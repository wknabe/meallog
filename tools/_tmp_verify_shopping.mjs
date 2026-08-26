/** 一時検証用（コミットしない）: 買い物リスト集計SQLの挙動を実SQLiteで確かめる */
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '../src/db/schema.ts';

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON;');
for (const sql of MIGRATIONS) db.exec(sql);

const now = '2026-08-27T00:00:00.000Z';
function food(id, name, refuse = 0) {
  db.prepare(
    `INSERT INTO foods (id, source, name, group_code, refuse_pct, created_at, updated_at)
     VALUES (?, 'standard', ?, '06', ?, ?, ?);`
  ).run(id, name, refuse, now, now);
}
function dish(id, name, servings) {
  db.prepare(
    `INSERT INTO dishes (id, name, category, servings, created_at, updated_at)
     VALUES (?, ?, 'main', ?, ?, ?);`
  ).run(id, name, servings, now, now);
}
function ing(dishId, foodId, grams, isSeasoning = 0) {
  db.prepare(
    `INSERT INTO dish_ingredients (dish_id, food_id, grams, is_seasoning) VALUES (?,?,?,?);`
  ).run(dishId, foodId, grams, isSeasoning);
}
function plan(date, slot, dishId, qty, cooked = 0) {
  db.prepare(
    `INSERT INTO meal_plans (date, slot, ref_type, ref_id, quantity, cooked, created_at)
     VALUES (?,?, 'dish', ?, ?, ?, ?);`
  ).run(date, slot, dishId, qty, cooked, now);
}

// 食材
food(1, 'キャベツ', 15);
food(2, 'にんじん', 10);
food(3, 'しょうゆ', 0);
food(4, '玉ねぎ', 6);

// 料理A: 2人前ぶんの材料。キャベツ200g + しょうゆ18g(調味料)
dish(10, '野菜炒め', 2);
ing(10, 1, 200);
ing(10, 3, 18, 1);

// 料理B: 1人前。キャベツ100g + にんじん50g
dish(11, 'サラダ', 1);
ing(11, 1, 100);
ing(11, 2, 50);

// 料理C: 1人前。しょうゆを「食材扱い(is_seasoning=0)」で入れてしまったケース
dish(12, '煮物', 1);
ing(12, 3, 30, 0);
ing(12, 4, 80);

// 同じ料理内で同じ食材が2行に分かれているケース
dish(13, '重複材料', 1);
ing(13, 4, 50);
ing(13, 4, 30);

plan('2026-08-27', 'dinner', 10, 2); // 2人前 → キャベツ 200*2/2 = 200
plan('2026-08-28', 'lunch', 10, 1);  // 1人前 → キャベツ 200*1/2 = 100
plan('2026-08-28', 'dinner', 11, 1); // キャベツ 100, にんじん 50
plan('2026-08-29', 'dinner', 12, 1); // しょうゆ30(非調味料扱い), 玉ねぎ80
plan('2026-08-29', 'lunch', 13, 1);  // 玉ねぎ 50+30=80
plan('2026-08-30', 'dinner', 11, 1, 1); // cooked=1 → 除外されるはず

const SQL = `SELECT di.food_id,
        f.name,
        f.group_code,
        f.refuse_pct,
        di.is_seasoning,
        SUM(di.grams * mp.quantity / d.servings) AS grams
 FROM meal_plans mp
 JOIN dishes d ON d.id = mp.ref_id
 JOIN dish_ingredients di ON di.dish_id = d.id
 JOIN foods f ON f.id = di.food_id
 WHERE mp.date BETWEEN ? AND ? AND mp.ref_type = 'dish' AND mp.cooked = 0
 GROUP BY di.food_id, di.is_seasoning;`;

console.log('--- 集計結果 (2026-08-27 〜 2026-08-31) ---');
const rows = db.prepare(SQL).all('2026-08-27', '2026-08-31');
for (const r of rows) {
  console.log(
    `food_id=${r.food_id} ${r.name} is_seasoning=${r.is_seasoning} grams=${r.grams} refuse=${r.refuse_pct}`
  );
}

console.log('\n--- 同じ食材が調味料フラグ違いで割れるか ---');
// 料理Aでしょうゆを調味料(1)、料理Cで非調味料(0)として登録済み
const soy = rows.filter((r) => r.food_id === 3);
console.log(`しょうゆの行数: ${soy.length}`, JSON.stringify(soy));

console.log('\n--- 在庫差し引き＋廃棄率の順序 ---');
db.prepare(`INSERT INTO pantry (food_id, grams, updated_at) VALUES (1, 300, ?);`).run(now);
const pantryRows = db.prepare('SELECT food_id, SUM(grams) AS grams FROM pantry GROUP BY food_id;').all();
const pantryByFood = new Map(pantryRows.map((r) => [r.food_id, r.grams]));
const withRefuse = (g, pct) => (pct <= 0 || pct >= 100 ? g : g / (1 - pct / 100));
for (const r of rows) {
  if (r.is_seasoning === 1) continue;
  const stock = pantryByFood.get(r.food_id) ?? 0;
  const shortage = r.grams - stock;
  if (shortage <= 0) { console.log(`${r.name}: 在庫充足でスキップ (必要${r.grams} 在庫${stock})`); continue; }
  console.log(
    `${r.name}: 必要${r.grams} - 在庫${stock} = ${shortage} → 廃棄率適用後 ${withRefuse(shortage, r.refuse_pct).toFixed(1)}g` +
      ` / 参考:先に廃棄率→在庫差引 = ${(withRefuse(r.grams, r.refuse_pct) - stock).toFixed(1)}g`
  );
}

console.log('\n--- 期間端の BETWEEN 挙動 ---');
console.log(db.prepare('SELECT COUNT(*) AS c FROM meal_plans WHERE date BETWEEN ? AND ?;').get('2026-08-27', '2026-08-29'));

console.log('\n--- 空リストのとき ---');
console.log(db.prepare(SQL).all('2027-01-01', '2027-01-07'));
