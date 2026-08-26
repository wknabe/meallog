/** 一時検証用（コミットしない）: 献立生成エンジンを実データで動かす */
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';

import { MIGRATIONS } from '../src/db/schema.ts';
import { NUTRIENT_KEYS } from '../src/db/nutrients.ts';
import {
  generateDayPlan,
  fitCalories,
  scoreDish,
  calcDeficits,
  DAILY_REFERENCE,
  sumPlan,
} from '../src/lib/mealplan.ts';

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON;');
for (const sql of MIGRATIONS) db.exec(sql);

const now = new Date().toISOString();
const seed = JSON.parse(await readFile('assets/data/foods.json', 'utf8'));
const columns = [...seed.columns, 'source', 'created_at', 'updated_at'];
const ph = `(${columns.map(() => '?').join(',')})`;
db.exec('BEGIN;');
for (let o = 0; o < seed.rows.length; o += 25) {
  const batch = seed.rows.slice(o, o + 25);
  const values = [];
  for (const row of batch) values.push(...row, 'standard', now, now);
  db.prepare(`INSERT INTO foods (${columns.join(',')}) VALUES ${batch.map(() => ph).join(',')};`).run(...values);
}
const dishSeed = JSON.parse(await readFile('assets/data/dishes.json', 'utf8'));
const foodIdByCode = new Map(
  db.prepare('SELECT id, std_code FROM foods WHERE std_code IS NOT NULL;').all().map((r) => [r.std_code, r.id])
);
for (const [name, category, cuisine, effort, volume, servings, cookMinutes, tastes, ingredients] of dishSeed.rows) {
  const resolved = [];
  let missing = false;
  for (const [code, grams, isSeasoning] of ingredients) {
    const fid = foodIdByCode.get(code);
    if (fid == null) { missing = true; break; }
    resolved.push([fid, grams, isSeasoning]);
  }
  if (missing) continue;
  const info = db.prepare(
    `INSERT INTO dishes (name, kana, category, cuisine, effort, volume, servings, cook_minutes, source, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?, 'preset', ?, ?);`
  ).run(name, name, category, cuisine, effort, volume, servings, cookMinutes, now, now);
  const did = Number(info.lastInsertRowid);
  for (const t of tastes) db.prepare('INSERT INTO dish_tastes (dish_id, taste) VALUES (?,?);').run(did, t);
  for (const [i, [fid, g, s]] of resolved.entries()) {
    db.prepare('INSERT INTO dish_ingredients (dish_id, food_id, grams, is_seasoning, sort_order) VALUES (?,?,?,?,?);').run(did, fid, g, s, i);
  }
}
db.exec('COMMIT;');

// PlanDish 相当を組み立てる（1人前あたり）
const dishRows = db.prepare('SELECT * FROM dishes;').all();
const candidates = [];
for (const d of dishRows) {
  const ings = db.prepare(
    `SELECT di.food_id, di.grams, ${NUTRIENT_KEYS.map((k) => `f.${k}`).join(', ')}
     FROM dish_ingredients di JOIN foods f ON f.id = di.food_id WHERE di.dish_id = ?;`
  ).all(d.id);
  const per = {};
  for (const k of NUTRIENT_KEYS) per[k] = 0;
  for (const ing of ings) for (const k of NUTRIENT_KEYS) per[k] += (Number(ing[k]) * ing.grams) / 100 / d.servings;
  const tastes = db.prepare('SELECT taste FROM dish_tastes WHERE dish_id = ?;').all(d.id).map((r) => r.taste);
  candidates.push({
    id: d.id, name: d.name, category: d.category, cuisine: d.cuisine,
    effort: d.effort, volume: d.volume, tastes,
    perServing: per,
    ingredientFoodIds: ings.map((i) => i.food_id),
  });
}
console.log(`候補 ${candidates.length}品`);
const byCat = {};
for (const c of candidates) byCat[c.category] = (byCat[c.category] ?? 0) + 1;
console.log('カテゴリ別:', JSON.stringify(byCat));

const target = { kcal: 1800, proteinG: 100, fatG: 50, carbG: 230 };
const baseCtx = {
  target, mood: {}, deficits: {},
  pantryFoodIds: new Set(), expiringFoodIds: new Set(), recentDishIds: new Set(),
};

console.log('\n=== 1) variant を変えたときに献立が変わるか ===');
const sigs = [];
for (let v = 0; v < 12; v++) {
  const p = generateDayPlan(candidates, { ...baseCtx, variant: v });
  const sig = p.meals.map((m) => m.entries.map((e) => e.dish.id).join(',')).join('|');
  sigs.push(sig);
  console.log(
    `v=${String(v).padStart(2)} kcal=${Math.round(p.totals.kcal).toString().padStart(4)} ` +
      p.meals.map((m) => m.entries.map((e) => `${e.dish.name}(${e.servings})`).join('+')).join(' / ')
  );
}
const dupes = sigs.map((s, i) => [i, sigs.indexOf(s)]).filter(([i, f]) => f !== i);
console.log('重複した variant:', JSON.stringify(dupes));

console.log('\n=== 2) 主食が複数あるとき fitCalories はどう配分するか ===');
const p0 = generateDayPlan(candidates, { ...baseCtx, variant: 0 });
for (const m of p0.meals) {
  for (const e of m.entries) {
    if (e.dish.category === 'staple') {
      console.log(`  ${m.slot} ${e.dish.name}: 1人前 ${Math.round(e.dish.perServing.kcal)}kcal → ${e.servings}人前 = ${Math.round(e.dish.perServing.kcal * e.servings)}kcal`);
    }
  }
}
console.log(`  合計 ${Math.round(p0.totals.kcal)}kcal / 目標 ${target.kcal}kcal`);

console.log('\n=== 3) fitCalories を2回かけたら（冪等か）===');
const once = fitCalories(p0.meals, target.kcal);
const twice = fitCalories(once, target.kcal);
console.log('  1回目合計', Math.round(sumPlan(once).kcal), '/ 2回目合計', Math.round(sumPlan(twice).kcal));

console.log('\n=== 4) 点数の内訳（不足栄養素の重みが支配的か）===');
const avg = {}; for (const k of NUTRIENT_KEYS) avg[k] = 0; // 全部0＝全栄養素が最大不足
const deficits = calcDeficits(avg, DAILY_REFERENCE);
console.log('  deficits の項目数:', Object.keys(deficits).length);
const ctxD = { ...baseCtx, deficits };
const mains = candidates.filter((c) => c.category === 'main');
const budget = 1800 * 0.4 * 0.4; // 夕食の主菜
const scored = mains.map((d) => {
  const diff = (d.perServing.kcal - budget) / Math.max(budget, 1);
  const kcalTerm = diff > 0 ? diff * 1.5 : -diff;
  let defTerm = 0;
  for (const [k, w] of Object.entries(deficits)) if ((d.perServing[k] ?? 0) > 0 && w > 0) defTerm -= Math.min(w, 1) * 0.6;
  return { name: d.name, kcal: Math.round(d.perServing.kcal), kcalTerm, defTerm, total: scoreDish(d, ctxD, budget) };
}).sort((a, b) => a.total - b.total);
console.log('  上位5件 (kcal項 / 不足項 / 合計):');
for (const s of scored.slice(0, 5)) console.log(`   ${s.name.padEnd(16)} ${s.kcal}kcal  kcal項=${s.kcalTerm.toFixed(2)} 不足項=${s.defTerm.toFixed(2)} 合計=${s.total.toFixed(2)}`);
console.log('  kcal項の範囲:', Math.min(...scored.map(s=>s.kcalTerm)).toFixed(2), '〜', Math.max(...scored.map(s=>s.kcalTerm)).toFixed(2));
console.log('  不足項の範囲:', Math.min(...scored.map(s=>s.defTerm)).toFixed(2), '〜', Math.max(...scored.map(s=>s.defTerm)).toFixed(2));

console.log('\n=== 5) 気分を指定したとき、実際に守られるか（和食・辛い）===');
const moodCtx = { ...baseCtx, deficits, mood: { cuisine: 'japanese', tastes: ['spicy'] } };
const pm = generateDayPlan(candidates, { ...moodCtx, variant: 0 });
for (const m of pm.meals) for (const e of m.entries) {
  const ok = e.dish.cuisine === 'japanese' && e.dish.tastes.includes('spicy');
  console.log(`  ${m.slot} ${e.dish.name} cuisine=${e.dish.cuisine} tastes=${e.dish.tastes.join('/')} → ${ok ? '一致' : '★不一致'}`);
}
console.log('  reasons:', JSON.stringify(pm.reasons));

console.log('\n=== 6) week.tsx の variant=index*3（7日分）で重複するか ===');
const weekSigs = [];
for (let i = 0; i < 7; i++) {
  const p = generateDayPlan(candidates, { ...baseCtx, deficits, variant: i * 3 });
  weekSigs.push(p.meals.flatMap((m) => m.entries.map((e) => e.dish.id)));
  console.log(`  ${i + 1}日目 kcal=${Math.round(p.totals.kcal)}: ` + p.meals.map((m) => m.entries.map((e) => e.dish.name).join('+')).join(' / '));
}
const all = weekSigs.flat();
console.log(`  のべ${all.length}品 / ユニーク${new Set(all).size}品`);

console.log('\n=== 7) 候補が極端に少ないとき ===');
const tiny = candidates.filter((c) => c.category === 'staple').slice(0, 1);
const tp = generateDayPlan(tiny, { ...baseCtx, variant: 0 });
console.log('  主食1品だけ:', JSON.stringify(tp.meals.map((m) => m.entries.map((e) => `${e.dish.name}x${e.servings}`))), 'totals=', Math.round(tp.totals.kcal));
const empty = generateDayPlan([], { ...baseCtx, variant: 0 });
console.log('  候補0件:', JSON.stringify(empty.totals), empty.meals.length);
console.log('  target.kcal=0:', JSON.stringify(generateDayPlan(candidates, { ...baseCtx, target: { kcal: 0, proteinG: 0, fatG: 0, carbG: 0 } }).totals));
