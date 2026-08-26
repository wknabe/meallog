/** 一時検証用（コミットしない）: 気分の反映率を測る + charts のスケール検証 */
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { MIGRATIONS } from '../src/db/schema.ts';
import { NUTRIENT_KEYS } from '../src/db/nutrients.ts';
import { generateDayPlan, calcDeficits, DAILY_REFERENCE } from '../src/lib/mealplan.ts';

const db = new DatabaseSync(':memory:');
for (const sql of MIGRATIONS) db.exec(sql);
const now = new Date().toISOString();
const seed = JSON.parse(await readFile('assets/data/foods.json', 'utf8'));
const columns = [...seed.columns, 'source', 'created_at', 'updated_at'];
const ph = `(${columns.map(() => '?').join(',')})`;
db.exec('BEGIN;');
for (let o = 0; o < seed.rows.length; o += 25) {
  const b = seed.rows.slice(o, o + 25); const v = [];
  for (const r of b) v.push(...r, 'standard', now, now);
  db.prepare(`INSERT INTO foods (${columns.join(',')}) VALUES ${b.map(() => ph).join(',')};`).run(...v);
}
const ds = JSON.parse(await readFile('assets/data/dishes.json', 'utf8'));
const fid = new Map(db.prepare('SELECT id, std_code FROM foods WHERE std_code IS NOT NULL;').all().map((r) => [r.std_code, r.id]));
for (const [name, cat, cu, ef, vo, sv, cm, ta, ings] of ds.rows) {
  const res = []; let miss = false;
  for (const [c, g, s] of ings) { const i = fid.get(c); if (i == null) { miss = true; break; } res.push([i, g, s]); }
  if (miss) continue;
  const info = db.prepare(`INSERT INTO dishes (name,kana,category,cuisine,effort,volume,servings,cook_minutes,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,'preset',?,?);`).run(name, name, cat, cu, ef, vo, sv, cm, now, now);
  const did = Number(info.lastInsertRowid);
  for (const t of ta) db.prepare('INSERT INTO dish_tastes (dish_id,taste) VALUES (?,?);').run(did, t);
  for (const [i, [f, g, s]] of res.entries()) db.prepare('INSERT INTO dish_ingredients (dish_id,food_id,grams,is_seasoning,sort_order) VALUES (?,?,?,?,?);').run(did, f, g, s, i);
}
db.exec('COMMIT;');
const candidates = [];
for (const d of db.prepare('SELECT * FROM dishes;').all()) {
  const ings = db.prepare(`SELECT di.food_id, di.grams, ${NUTRIENT_KEYS.map((k) => `f.${k}`).join(',')} FROM dish_ingredients di JOIN foods f ON f.id=di.food_id WHERE di.dish_id=?;`).all(d.id);
  const per = {}; for (const k of NUTRIENT_KEYS) per[k] = 0;
  for (const g of ings) for (const k of NUTRIENT_KEYS) per[k] += (Number(g[k]) * g.grams) / 100 / d.servings;
  candidates.push({ id: d.id, name: d.name, category: d.category, cuisine: d.cuisine, effort: d.effort, volume: d.volume,
    tastes: db.prepare('SELECT taste FROM dish_tastes WHERE dish_id=?;').all(d.id).map((r) => r.taste), perServing: per, ingredientFoodIds: ings.map((i) => i.food_id) });
}

const avg = {}; for (const k of NUTRIENT_KEYS) avg[k] = 0;
const deficits = calcDeficits(avg, DAILY_REFERENCE);
const base = { target: { kcal: 1800, proteinG: 100, fatG: 50, carbG: 230 },
  pantryFoodIds: new Set(), expiringFoodIds: new Set(), recentDishIds: new Set() };

function matches(d, m) {
  if (m.cuisine && d.cuisine !== m.cuisine) return false;
  if (m.effort && d.effort !== m.effort) return false;
  if (m.volume && d.volume !== m.volume) return false;
  if (m.tastes?.length && !m.tastes.some((t) => d.tastes.includes(t))) return false;
  return true;
}

console.log('=== 気分の反映率（記録なし＝全栄養素が不足という状況）===');
for (const mood of [
  { cuisine: 'japanese' }, { cuisine: 'chinese' }, { cuisine: 'western' },
  { effort: 'nocook' }, { effort: 'heatonly' }, { volume: 'light' }, { tastes: ['spicy'] },
]) {
  const avail = {};
  for (const cat of ['staple', 'main', 'side', 'soup']) avail[cat] = candidates.filter((c) => c.category === cat && matches(c, mood)).length;
  let hit = 0, total = 0;
  for (let v = 0; v < 5; v++) {
    const p = generateDayPlan(candidates, { ...base, mood, deficits, variant: v });
    for (const m of p.meals) for (const e of m.entries) { total++; if (matches(e.dish, mood)) hit++; }
  }
  console.log(`  ${JSON.stringify(mood).padEnd(28)} 候補数=${JSON.stringify(avail)} → 一致 ${hit}/${total} (${Math.round((hit / total) * 100)}%)`);
}

console.log('\n=== 記録がある（deficits が空）ときの反映率 ===');
for (const mood of [{ cuisine: 'japanese' }, { effort: 'nocook' }, { tastes: ['spicy'] }]) {
  let hit = 0, total = 0;
  for (let v = 0; v < 5; v++) {
    const p = generateDayPlan(candidates, { ...base, mood, deficits: {}, variant: v });
    for (const m of p.meals) for (const e of m.entries) { total++; if (matches(e.dish, mood)) hit++; }
  }
  console.log(`  ${JSON.stringify(mood).padEnd(28)} → 一致 ${hit}/${total} (${Math.round((hit / total) * 100)}%)`);
}

// ── charts.tsx の buildScale / niceStep を移植して検証 ──
console.log('\n=== charts.tsx: buildScale / niceStep / toY ===');
function niceStep(raw) {
  if (raw <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  if (n <= 1) return mag; if (n <= 2) return 2 * mag; if (n <= 5) return 5 * mag; return 10 * mag;
}
function buildScale(max, min = 0, tickCount = 4) {
  const span = Math.max(max - min, 1);
  const step = niceStep(span / tickCount);
  const top = Math.ceil(max / step) * step;
  const bottom = Math.floor(min / step) * step;
  const ticks = [];
  for (let v = bottom; v <= top + step / 2; v += step) ticks.push(v);
  return { top, bottom, ticks };
}
const PAD = { top: 12, bottom: 24 }, H = 180;
const plotH = H - PAD.top - PAD.bottom;
const toY = (v, s) => PAD.top + plotH - ((v - s.bottom) / (s.top - s.bottom || 1)) * plotH;

for (const [label, args] of [
  ['全部0（棒: max=1にクランプ）', [1, 0]],
  ['全部0（クランプなし）', [0, 0]],
  ['1点だけ 60.0kg', [60.5, 59.5]],
  ['負の値を含む', [-1, -5]],
  ['全部負', [-10, -20]],
  ['極小レンジ 60.0〜60.1', [60.12, 59.98]],
  ['巨大値', [1234567, 0]],
  ['NaN混入', [NaN, 0]],
  ['Infinity', [Infinity, 0]],
]) {
  const s = buildScale(...args);
  console.log(`  ${label.padEnd(26)} top=${s.top} bottom=${s.bottom} ticks=${s.ticks.length}件 [${s.ticks.slice(0, 8).join(', ')}] toY(bottom)=${toY(s.bottom, s).toFixed(1)} toY(top)=${toY(s.top, s).toFixed(1)}`);
}
console.log('  niceStep(0)=', niceStep(0), ' niceStep(-5)=', niceStep(-5), ' niceStep(NaN)=', niceStep(NaN));
console.log('  浮動小数の累積: ', buildScale(1, 0).ticks.join(', '));
console.log('  ticks の重複キー確認 (buildScale(0.5,-0.5)):', JSON.stringify(buildScale(0.5, -0.5).ticks));
