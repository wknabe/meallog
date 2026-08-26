/** 一時検証用（コミットしない）: 気分の反映と fitCalories の冪等性を確かめる */
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { MIGRATIONS } from '../src/db/schema.ts';
import { NUTRIENT_KEYS } from '../src/db/nutrients.ts';
import { generateDayPlan, fitCalories, scoreDish, calcDeficits, DAILY_REFERENCE, sumPlan } from '../src/lib/mealplan.ts';

const db = new DatabaseSync(':memory:');
for (const sql of MIGRATIONS) db.exec(sql);
const now = new Date().toISOString();
const seed = JSON.parse(await readFile('assets/data/foods.json', 'utf8'));
const columns = [...seed.columns, 'source', 'created_at', 'updated_at'];
const ph = `(${columns.map(() => '?').join(',')})`;
db.exec('BEGIN;');
for (let o = 0; o < seed.rows.length; o += 25) {
  const batch = seed.rows.slice(o, o + 25);
  const values = []; for (const row of batch) values.push(...row, 'standard', now, now);
  db.prepare(`INSERT INTO foods (${columns.join(',')}) VALUES ${batch.map(() => ph).join(',')};`).run(...values);
}
const dishSeed = JSON.parse(await readFile('assets/data/dishes.json', 'utf8'));
const fid = new Map(db.prepare('SELECT id, std_code FROM foods WHERE std_code IS NOT NULL;').all().map((r) => [r.std_code, r.id]));
for (const [name, category, cuisine, effort, volume, servings, cm, tastes, ings] of dishSeed.rows) {
  const res = []; let miss = false;
  for (const [c, g, s] of ings) { const i = fid.get(c); if (i == null) { miss = true; break; } res.push([i, g, s]); }
  if (miss) continue;
  const info = db.prepare(`INSERT INTO dishes (name,kana,category,cuisine,effort,volume,servings,cook_minutes,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,'preset',?,?);`).run(name, name, category, cuisine, effort, volume, servings, cm, now, now);
  const did = Number(info.lastInsertRowid);
  for (const t of tastes) db.prepare('INSERT INTO dish_tastes (dish_id,taste) VALUES (?,?);').run(did, t);
  for (const [i, [f, g, s]] of res.entries()) db.prepare('INSERT INTO dish_ingredients (dish_id,food_id,grams,is_seasoning,sort_order) VALUES (?,?,?,?,?);').run(did, f, g, s, i);
}
db.exec('COMMIT;');

const candidates = [];
for (const d of db.prepare('SELECT * FROM dishes;').all()) {
  const ings = db.prepare(`SELECT di.food_id, di.grams, ${NUTRIENT_KEYS.map((k) => `f.${k}`).join(',')} FROM dish_ingredients di JOIN foods f ON f.id=di.food_id WHERE di.dish_id=?;`).all(d.id);
  const per = {}; for (const k of NUTRIENT_KEYS) per[k] = 0;
  for (const g of ings) for (const k of NUTRIENT_KEYS) per[k] += (Number(g[k]) * g.grams) / 100 / d.servings;
  candidates.push({ id: d.id, name: d.name, category: d.category, cuisine: d.cuisine, effort: d.effort, volume: d.volume,
    tastes: db.prepare('SELECT taste FROM dish_tastes WHERE dish_id=?;').all(d.id).map((r) => r.taste),
    perServing: per, ingredientFoodIds: ings.map((i) => i.food_id) });
}

const mood = { cuisine: 'japanese', tastes: ['spicy'] };
const match = (d) => d.cuisine === 'japanese' && d.tastes.includes('spicy');
console.log('=== 和食かつ辛い料理はカテゴリ別に何品あるか ===');
for (const cat of ['staple', 'main', 'side', 'soup']) {
  const list = candidates.filter((c) => c.category === cat && match(c));
  console.log(`  ${cat}: ${list.length}品  ${list.slice(0, 5).map((c) => c.name).join('、')}`);
}

const avg = {}; for (const k of NUTRIENT_KEYS) avg[k] = 0;
const deficits = calcDeficits(avg, DAILY_REFERENCE);
const ctx = { target: { kcal: 1800, proteinG: 100, fatG: 50, carbG: 230 }, mood, deficits,
  pantryFoodIds: new Set(), expiringFoodIds: new Set(), recentDishIds: new Set() };

console.log('\n=== 主菜プールの順位: 気分一致の料理は何位か（夕食の主菜, budget=288）===');
const budget = 1800 * 0.4 * 0.4;
const pool = candidates.filter((c) => c.category === 'main')
  .map((d) => ({ d, s: scoreDish(d, ctx, budget) })).sort((a, b) => a.s - b.s);
pool.slice(0, 8).forEach((p, i) => console.log(`  ${String(i).padStart(2)}位 ${p.d.name.padEnd(18)} score=${p.s.toFixed(2)} ${match(p.d) ? '★一致' : ''}`));
const firstMatch = pool.findIndex((p) => match(p.d));
console.log(`  最初の気分一致は ${firstMatch}位: ${firstMatch >= 0 ? pool[firstMatch].d.name : 'なし'} (score=${pool[firstMatch]?.s.toFixed(2)})`);
console.log(`  実際に選ばれるのは pool[variant+mealIndex+slotIndex] = pool[0+2+1] = pool[3] → ${pool[3].d.name}`);

console.log('\n=== variant=0 でも各枠が「1位」を選ばない ===');
for (const [mi, slot] of [[0,'breakfast'],[1,'lunch'],[2,'dinner']]) {
  const layout = { breakfast: ['staple','main','soup','side'], lunch: ['staple','main','side'], dinner: ['staple','main','side','soup'] }[slot];
  console.log(`  ${slot}: ` + layout.map((c, si) => `${c}→pool[${0 + mi + si}]`).join(' , '));
}

console.log('\n=== fitCalories の冪等性（servings が 1 でない献立に再適用）===');
const p8 = generateDayPlan(candidates, { ...ctx, mood: {}, variant: 8 });
console.log('  1回目:', Math.round(sumPlan(p8.meals).kcal), 'kcal / staple servings =',
  p8.meals.flatMap((m) => m.entries.filter((e) => e.dish.category === 'staple').map((e) => e.servings)).join(','));
const again = fitCalories(p8.meals, 1800);
console.log('  再適用:', Math.round(sumPlan(again).kcal), 'kcal / staple servings =',
  again.flatMap((m) => m.entries.filter((e) => e.dish.category === 'staple').map((e) => e.servings)).join(','));
const third = fitCalories(again, 1800);
console.log('  3回目:', Math.round(sumPlan(third).kcal), 'kcal / staple servings =',
  third.flatMap((m) => m.entries.filter((e) => e.dish.category === 'staple').map((e) => e.servings)).join(','));

console.log('\n=== 主食のカロリー差が大きいときの一律倍率 ===');
const mk = (id, name, cat, kcal) => ({ id, name, category: cat, cuisine: null, effort: null, volume: null, tastes: [],
  perServing: { kcal, protein_g: 0, fat_g: 0, carb_g: 0 }, ingredientFoodIds: [] });
const meals = [
  { slot: 'breakfast', entries: [{ dish: mk(1, '食パン1枚', 'staple', 150), servings: 1 }] },
  { slot: 'lunch', entries: [{ dish: mk(2, '大盛りごはん', 'staple', 500), servings: 1 }, { dish: mk(3, '主菜', 'main', 400), servings: 1 }] },
];
for (const t of [1800, 1000, 700, 400]) {
  const r = fitCalories(meals, t);
  console.log(`  target=${t}: ` + r.flatMap((m) => m.entries.map((e) => `${e.dish.name} x${e.servings} = ${Math.round(e.dish.perServing.kcal * e.servings)}kcal`)).join(' , ') + ` → 合計 ${Math.round(sumPlan(r).kcal)}`);
}
