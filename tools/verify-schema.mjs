/**
 * スキーマと成分表データの投入を、端末なしで検証する。
 * Node同梱のSQLiteに対して実際にCREATE TABLEとINSERTを流し、検索まで確認する。
 *
 * 実行: node tools/verify-schema.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';

import { MIGRATIONS } from '../src/db/schema.ts';

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON;');

// ── マイグレーション ──
for (const [index, sql] of MIGRATIONS.entries()) {
  db.exec(sql);
  db.exec(`PRAGMA user_version = ${index + 1};`);
}
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;")
  .all()
  .map((r) => r.name)
  .filter((n) => !n.startsWith('sqlite_'));
console.log(`テーブル ${tables.length}件:`, tables.join(', '));

// ── 成分表データの投入（アプリと同じ手順）──
const seed = JSON.parse(await readFile('assets/data/foods.json', 'utf8'));
const columns = [...seed.columns, 'source', 'created_at', 'updated_at'];
const placeholders = `(${columns.map(() => '?').join(',')})`;
const now = new Date().toISOString();
const BATCH_SIZE = 25;

const started = Date.now();
db.exec('BEGIN;');
for (let offset = 0; offset < seed.rows.length; offset += BATCH_SIZE) {
  const batch = seed.rows.slice(offset, offset + BATCH_SIZE);
  const values = [];
  for (const row of batch) values.push(...row, 'standard', now, now);
  db.prepare(
    `INSERT INTO foods (${columns.join(',')}) VALUES ${batch.map(() => placeholders).join(',')};`
  ).run(...values);
}

// 常用単位
const unitSeed = JSON.parse(await readFile('assets/data/food-units.json', 'utf8'));
for (const [stdCode, name, grams, isPurchase, sortOrder] of unitSeed.rows) {
  db.prepare(
    `INSERT INTO food_units (food_id, name, grams, is_purchase_unit, sort_order)
     SELECT id, ?, ?, ?, ? FROM foods WHERE std_code = ?;`
  ).run(name, grams, isPurchase, sortOrder, stdCode);
}
db.exec('COMMIT;');
const unitCount = db.prepare('SELECT COUNT(*) AS c FROM food_units;').get().c;
console.log(`常用単位 ${unitCount}件`);

const count = db.prepare("SELECT COUNT(*) AS c FROM foods WHERE source = 'standard';").get().c;
console.log(`投入 ${count}件 / ${Date.now() - started}ms`);

// ── 検索の確認 ──
const search = (keyword) => {
  const pattern = `%${keyword}%`;
  const normalized = `%${keyword.replace(/[\s［］[\]（）()・,、]/g, '')}%`;
  return db
    .prepare(
      `SELECT name, kcal, protein_g, fat_g, carb_g FROM foods
       WHERE name LIKE ? OR kana LIKE ?
       ORDER BY
         CASE WHEN kana LIKE ? THEN 0 ELSE 1 END,
         CASE WHEN name LIKE ? THEN 0 ELSE 1 END,
         LENGTH(name) ASC
       LIMIT 3;`
    )
    .all(pattern, normalized, `%|${keyword}|%`, `${keyword}%`);
};

for (const keyword of ['鶏むね肉', '玉ねぎ', '白米', 'ごはん', '鮭', '豚こま', 'ブロッコリー']) {
  console.log(`--- 「${keyword}」`);
  const hits = search(keyword);
  if (hits.length === 0) console.log('   ヒットなし');
  for (const hit of hits) {
    console.log(
      `   ${hit.name} | ${hit.kcal}kcal P${hit.protein_g} F${hit.fat_g} C${hit.carb_g}`
    );
  }
}

// ── 料理データの投入（アプリと同じ手順）──
const dishSeed = JSON.parse(await readFile('assets/data/dishes.json', 'utf8'));
const foodIdByCode = new Map(
  db.prepare('SELECT id, std_code FROM foods WHERE std_code IS NOT NULL;').all().map((r) => [r.std_code, r.id])
);
db.exec('BEGIN;');
let dishCount = 0;
let missingIngredients = 0;
for (const [name, category, cuisine, effort, volume, servings, cookMinutes, tastes, ingredients] of dishSeed.rows) {
  const resolved = [];
  let missing = false;
  for (const [code, grams, isSeasoning] of ingredients) {
    const foodId = foodIdByCode.get(code);
    if (foodId == null) { missing = true; break; }
    resolved.push([foodId, grams, isSeasoning]);
  }
  if (missing) { missingIngredients++; continue; }
  const info = db.prepare(
    `INSERT INTO dishes (name, kana, category, cuisine, effort, volume, servings, cook_minutes, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'preset', ?, ?);`
  ).run(name, name, category, cuisine, effort, volume, servings, cookMinutes, now, now);
  const dishId = Number(info.lastInsertRowid);
  for (const taste of tastes) {
    db.prepare('INSERT INTO dish_tastes (dish_id, taste) VALUES (?, ?);').run(dishId, taste);
  }
  for (const [index, [foodId, grams, isSeasoning]] of resolved.entries()) {
    db.prepare(
      'INSERT INTO dish_ingredients (dish_id, food_id, grams, is_seasoning, sort_order) VALUES (?, ?, ?, ?, ?);'
    ).run(dishId, foodId, grams, isSeasoning, index);
  }
  dishCount++;
}
db.exec('COMMIT;');
console.log(`料理 ${dishCount}件を投入（材料不足でとばした料理: ${missingIngredients}件）`);

// 材料から計算した栄養価が現実的か、代表的な料理で確認する
const dishNutrition = (dishName) =>
  db.prepare(
    `SELECT d.name, d.servings,
            SUM(f.kcal * di.grams / 100) / d.servings      AS kcal,
            SUM(f.protein_g * di.grams / 100) / d.servings AS protein_g,
            SUM(f.fat_g * di.grams / 100) / d.servings     AS fat_g,
            SUM(f.carb_g * di.grams / 100) / d.servings    AS carb_g
     FROM dishes d
     JOIN dish_ingredients di ON di.dish_id = d.id
     JOIN foods f ON f.id = di.food_id
     WHERE d.name = ?
     GROUP BY d.id;`
  ).get(dishName);

console.log('--- 料理1人前の栄養価');
for (const name of ['白ごはん', '鮭の塩焼き', '豚の生姜焼き', '豆腐とわかめの味噌汁', 'ほうれん草のおひたし', 'カレーライス']) {
  const n = dishNutrition(name);
  if (!n) { console.log(`   ${name}: 見つかりません`); continue; }
  console.log(
    `   ${name.padEnd(12)} ${Math.round(n.kcal).toString().padStart(4)}kcal  P${n.protein_g.toFixed(1)} F${n.fat_g.toFixed(1)} C${n.carb_g.toFixed(1)}`
  );
}

// 気分タグで絞ったときに候補が残るか（献立生成が成立するかの確認）
console.log('--- 気分で絞ったときの候補数');
for (const [label, sql, params] of [
  ['和食 × 主菜', "SELECT COUNT(*) AS c FROM dishes WHERE category='main' AND cuisine='japanese'", []],
  ['中華 × 主菜', "SELECT COUNT(*) AS c FROM dishes WHERE category='main' AND cuisine='chinese'", []],
  ['エスニック（全体）', "SELECT COUNT(*) AS c FROM dishes WHERE cuisine='ethnic'", []],
  ['加熱だけ（全体）', "SELECT COUNT(*) AS c FROM dishes WHERE effort='heatonly'", []],
  ['辛いもの（全体）', "SELECT COUNT(*) AS c FROM dishes d JOIN dish_tastes t ON t.dish_id=d.id WHERE t.taste='spicy'", []],
  ['軽め × 副菜', "SELECT COUNT(*) AS c FROM dishes WHERE category='side' AND volume='light'", []],
]) {
  console.log(`   ${label.padEnd(20)} ${db.prepare(sql).get(...params).c}件`);
}

// ── 外部キーと連鎖削除の確認 ──
db.prepare(
  `INSERT INTO dishes (name, category, servings, source, created_at, updated_at)
   VALUES ('検証用の料理', 'main', 1, 'preset', ?, ?);`
).run(now, now);
const dishId = db.prepare('SELECT id FROM dishes WHERE name = ?;').get('検証用の料理').id;
const foodId = db.prepare("SELECT id FROM foods WHERE std_code = '11220';").get().id;
db.prepare(
  'INSERT INTO dish_ingredients (dish_id, food_id, grams) VALUES (?, ?, ?);'
).run(dishId, foodId, 150);
db.prepare("INSERT INTO dish_tastes (dish_id, taste) VALUES (?, 'light');").run(dishId);

const nutrition = db
  .prepare(
    `SELECT d.name,
            SUM(f.kcal * di.grams / 100)      AS kcal,
            SUM(f.protein_g * di.grams / 100) AS protein_g
     FROM dishes d
     JOIN dish_ingredients di ON di.dish_id = d.id
     JOIN foods f ON f.id = di.food_id
     WHERE d.id = ?
     GROUP BY d.id;`
  )
  .get(dishId);
console.log(
  `--- 料理の栄養計算: ${nutrition.name} = ${nutrition.kcal.toFixed(0)}kcal / P${nutrition.protein_g.toFixed(1)}g（鶏むね150g）`
);

db.prepare('DELETE FROM dishes WHERE id = ?;').run(dishId);
const leftIngredients = db
  .prepare('SELECT COUNT(*) AS c FROM dish_ingredients WHERE dish_id = ?;')
  .get(dishId).c;
const leftTastes = db.prepare('SELECT COUNT(*) AS c FROM dish_tastes WHERE dish_id = ?;').get(dishId).c;
console.log(`--- 連鎖削除: 材料 ${leftIngredients}件 / 味タグ ${leftTastes}件（どちらも0なら正常）`);

// ── 単一行テーブルの制約確認 ──
try {
  db.prepare(
    `INSERT INTO settings (id, updated_at) VALUES (2, ?);`
  ).run(now);
  console.log('--- settings の単一行制約: 効いていません（想定外）');
} catch {
  console.log('--- settings の単一行制約: 効いています');
}

// ── 常用単位の確認 ──
const units = db
  .prepare(
    `SELECT f.name AS food, u.name AS unit, u.grams, u.is_purchase_unit
     FROM food_units u JOIN foods f ON f.id = u.food_id
     WHERE f.std_code IN ('12004', '06061', '10134', '17007')
     ORDER BY f.std_code, u.sort_order;`
  )
  .all();
console.log('--- 常用単位');
for (const u of units) {
  console.log(`   ${u.food} = 1${u.unit} ${u.grams}g${u.is_purchase_unit ? '（購入単位）' : ''}`);
}

console.log('検証完了');
