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
