/**
 * 冷蔵庫の在庫。
 *
 * 在庫は自動では減らさない。献立に「作った」を付けたときと手動編集だけで減らす。
 * 食事記録から自動で引くと、外食や分量の誤差でズレが溜まり、
 * 結局信用できない在庫になって使われなくなるため。
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { getDatabase } from '@/db';
import { NUTRIENT_KEYS, type Nutrients } from '@/db/nutrients';
import type { DayKey } from '@/lib/day';

export type PantryItem = {
  id: number;
  foodId: number;
  foodName: string;
  groupCode: string | null;
  grams: number;
  expiresOn: DayKey | null;
  per100g: Nutrients;
};

type PantryRow = Record<string, string | number | null>;

function toPantryItem(row: PantryRow): PantryItem {
  const per100g = {} as Nutrients;
  for (const key of NUTRIENT_KEYS) per100g[key] = Number(row[key] ?? 0);
  return {
    id: Number(row.id),
    foodId: Number(row.food_id),
    foodName: String(row.food_name),
    groupCode: (row.group_code as string) ?? null,
    grams: Number(row.grams),
    expiresOn: (row.expires_on as string) ?? null,
    per100g,
  };
}

const NUTRIENT_COLUMNS = NUTRIENT_KEYS.map((key) => `f.${key}`).join(', ');

export async function listPantry(): Promise<PantryItem[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<PantryRow>(
    `SELECT p.id, p.food_id, p.grams, p.expires_on,
            f.name AS food_name, f.group_code, ${NUTRIENT_COLUMNS}
     FROM pantry p JOIN foods f ON f.id = p.food_id
     -- 期限が近いものを上に出して、使い切りやすくする
     ORDER BY CASE WHEN p.expires_on IS NULL THEN 1 ELSE 0 END, p.expires_on ASC, f.name ASC;`,
  );
  return rows.map(toPantryItem);
}

/**
 * 在庫を足す。同じ食品が既にあれば数量を合算する。
 * 同じ食材が何行にも分かれると、不足の判定が正しくできなくなるため。
 */
export async function addToPantry(
  foodId: number,
  grams: number,
  expiresOn: DayKey | null,
): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  const existing = await db.getFirstAsync<{ id: number; grams: number; expires_on: string | null }>(
    'SELECT id, grams, expires_on FROM pantry WHERE food_id = ?;',
    [foodId],
  );

  if (existing) {
    // 期限は早いほうを残す。古いものから使い切りたいため
    const nextExpiry =
      existing.expires_on == null
        ? expiresOn
        : expiresOn == null
          ? existing.expires_on
          : existing.expires_on < expiresOn
            ? existing.expires_on
            : expiresOn;
    await db.runAsync('UPDATE pantry SET grams = ?, expires_on = ?, updated_at = ? WHERE id = ?;', [
      existing.grams + grams,
      nextExpiry,
      now,
      existing.id,
    ]);
    return;
  }

  await db.runAsync(
    'INSERT INTO pantry (food_id, grams, expires_on, updated_at) VALUES (?, ?, ?, ?);',
    [foodId, grams, expiresOn, now],
  );
}

export async function updatePantryItem(
  id: number,
  values: { grams: number; expiresOn: DayKey | null },
): Promise<void> {
  const db = getDatabase();
  if (!Number.isFinite(values.grams) || values.grams <= 0) {
    // 0以下は「使い切った」とみなして消す。呼び出し側で確認を取ること
    await db.runAsync('DELETE FROM pantry WHERE id = ?;', [id]);
    return;
  }
  await db.runAsync('UPDATE pantry SET grams = ?, expires_on = ?, updated_at = ? WHERE id = ?;', [
    values.grams,
    values.expiresOn,
    new Date().toISOString(),
    id,
  ]);
}

export async function removePantryItem(id: number): Promise<void> {
  const db = getDatabase();
  await db.runAsync('DELETE FROM pantry WHERE id = ?;', [id]);
}

/** 在庫にある食品idの集合。献立の点数付けで使う */
export async function pantryFoodIds(): Promise<Set<number>> {
  const db = getDatabase();
  const rows = await db.getAllAsync<{ food_id: number }>('SELECT food_id FROM pantry;');
  return new Set(rows.map((row) => row.food_id));
}

/** 賞味期限が指定日までに来る食品idの集合 */
export async function expiringFoodIds(until: DayKey): Promise<Set<number>> {
  const db = getDatabase();
  const rows = await db.getAllAsync<{ food_id: number }>(
    'SELECT food_id FROM pantry WHERE expires_on IS NOT NULL AND expires_on <= ?;',
    [until],
  );
  return new Set(rows.map((row) => row.food_id));
}

/**
 * 問い合わせの出し先。通常の接続でも、トランザクション用の接続でも渡せるようにする。
 *
 * withExclusiveTransactionAsync は専用の接続を新しく開いて引数で渡してくる。
 * その中で外側の接続を使うと BEGIN/COMMIT の外で走ってしまい、
 * 見た目はトランザクションでも実際には囲えていない。必ず渡された側を使うこと。
 */
export type DbExecutor = Pick<SQLiteDatabase, 'getAllAsync' | 'getFirstAsync' | 'runAsync'>;

/**
 * 料理を作ったぶんだけ在庫を減らす。
 * 在庫より多く使った場合は0で止め、マイナスにはしない。
 *
 * 材料を1つずつ減らすため、途中で失敗すると半分だけ減った在庫が残ってしまう。
 * それを防ぐために全体を1つのトランザクションで囲う。
 * 呼び出し側が既にトランザクションを開いている場合は、その接続を executor で渡す。
 */
export async function consumeForDish(
  dishId: number,
  servings: number,
  executor?: DbExecutor,
): Promise<void> {
  if (executor) {
    await consume(executor, dishId, servings);
    return;
  }
  // 別の「作った」操作と重ならないよう排他にする
  await getDatabase().withExclusiveTransactionAsync(async (txn) => {
    await consume(txn, dishId, servings);
  });
}

async function consume(db: DbExecutor, dishId: number, servings: number): Promise<void> {
  const ingredients = await db.getAllAsync<{ food_id: number; grams: number }>(
    `SELECT di.food_id, di.grams * ? / d.servings AS grams
     FROM dish_ingredients di JOIN dishes d ON d.id = di.dish_id
     WHERE di.dish_id = ?;`,
    [servings, dishId],
  );

  for (const ingredient of ingredients) {
    const row = await db.getFirstAsync<{ id: number; grams: number }>(
      'SELECT id, grams FROM pantry WHERE food_id = ?;',
      [ingredient.food_id],
    );
    if (!row) continue;
    const remaining = row.grams - ingredient.grams;
    if (remaining <= 0) {
      await db.runAsync('DELETE FROM pantry WHERE id = ?;', [row.id]);
    } else {
      await db.runAsync('UPDATE pantry SET grams = ?, updated_at = ? WHERE id = ?;', [
        remaining,
        new Date().toISOString(),
        row.id,
      ]);
    }
  }
}
