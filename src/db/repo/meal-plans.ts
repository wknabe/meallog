/** 献立の保存と読み込み */
import { getDatabase } from '@/db';
import { inTransaction } from '@/db/transaction';
import { consumeForDish } from '@/db/repo/pantry';
import { dishNutrition, getDishes, type Dish } from '@/db/repo/dishes';
import type { DayKey } from '@/lib/day';
import type { MealSlot } from '@/lib/types';

export type PlanEntryRecord = {
  id: number;
  date: DayKey;
  slot: MealSlot;
  dishId: number;
  dish: Dish | null;
  servings: number;
  cooked: boolean;
};

export type PlanEntryInput = {
  slot: MealSlot;
  dishId: number;
  servings: number;
};

/**
 * その日の献立を丸ごと入れ替える。
 * 作り直したときに古い献立が残らないよう、日付単位で消してから入れる。
 */
export async function savePlanForDate(date: DayKey, entries: PlanEntryInput[]): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    // ref_type を絞る。将来 'food' の行を足したときに巻き添えで消さないため
    await db.runAsync("DELETE FROM meal_plans WHERE date = ? AND ref_type = 'dish';", [date]);
    for (const [index, entry] of entries.entries()) {
      await db.runAsync(
        `INSERT INTO meal_plans (date, slot, ref_type, ref_id, quantity, sort_order, created_at)
         VALUES (?, ?, 'dish', ?, ?, ?, ?);`,
        [date, entry.slot, entry.dishId, entry.servings, index, now],
      );
    }
  });
}

async function toRecords(
  rows: {
    id: number;
    date: string;
    slot: string;
    ref_id: number;
    quantity: number;
    cooked: number;
  }[],
): Promise<PlanEntryRecord[]> {
  // 1件ずつ引くと7日分で100クエリを超えるため、まとめて取得する
  const dishes = await getDishes(rows.map((row) => row.ref_id));

  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    slot: row.slot as MealSlot,
    dishId: row.ref_id,
    dish: dishes.get(row.ref_id) ?? null,
    servings: row.quantity,
    cooked: row.cooked === 1,
  }));
}

export async function listPlanForDate(date: DayKey): Promise<PlanEntryRecord[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<{
    id: number;
    date: string;
    slot: string;
    ref_id: number;
    quantity: number;
    cooked: number;
  }>(
    `SELECT id, date, slot, ref_id, quantity, cooked FROM meal_plans
     WHERE date = ? AND ref_type = 'dish'
     ORDER BY sort_order ASC, id ASC;`,
    [date],
  );
  return toRecords(rows);
}

export async function listPlanForRange(from: DayKey, to: DayKey): Promise<PlanEntryRecord[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<{
    id: number;
    date: string;
    slot: string;
    ref_id: number;
    quantity: number;
    cooked: number;
  }>(
    `SELECT id, date, slot, ref_id, quantity, cooked FROM meal_plans
     WHERE date BETWEEN ? AND ? AND ref_type = 'dish'
     ORDER BY date ASC, sort_order ASC, id ASC;`,
    [from, to],
  );
  return toRecords(rows);
}

export async function deletePlanForDate(date: DayKey): Promise<void> {
  const db = getDatabase();
  await db.runAsync("DELETE FROM meal_plans WHERE date = ? AND ref_type = 'dish';", [date]);
}

/**
 * 「作った」を記録する。このときだけ在庫を減らす。
 * 取り消した場合は在庫を戻さない（作ったものを元に戻せるわけではないため）。
 */
export async function markCooked(entryId: number, cooked: boolean): Promise<void> {
  const db = getDatabase();

  if (!cooked) {
    // 取り消しても在庫は戻さない。作ったものを元に戻せるわけではないため
    await db.runAsync('UPDATE meal_plans SET cooked = 0 WHERE id = ?;', [entryId]);
    return;
  }

  // 「作った」と在庫の減算は、片方だけ残らないようまとめて1つのトランザクションで行う
  await inTransaction(db, async (txn) => {
    const row = await txn.getFirstAsync<{ ref_id: number; quantity: number }>(
      "SELECT ref_id, quantity FROM meal_plans WHERE id = ? AND ref_type = 'dish';",
      [entryId],
    );
    if (!row) return;

    // 「未調理のときだけ1にする」を1文にまとめる。
    // 読んでから書くと、素早く2回押したときに在庫が二重に減る
    const result = await txn.runAsync(
      'UPDATE meal_plans SET cooked = 1 WHERE id = ? AND cooked = 0;',
      [entryId],
    );
    if (result.changes !== 1) return;

    await consumeForDish(row.ref_id, row.quantity, txn);
  });
}

/** 献立の1日ぶんの栄養価 */
export function planTotals(entries: PlanEntryRecord[]) {
  return entries.reduce(
    (totals, entry) => {
      if (!entry.dish) return totals;
      const nutrition = dishNutrition(entry.dish, entry.servings);
      return {
        kcal: totals.kcal + nutrition.nutrients.kcal,
        proteinG: totals.proteinG + nutrition.nutrients.protein_g,
        fatG: totals.fatG + nutrition.nutrients.fat_g,
        carbG: totals.carbG + nutrition.nutrients.carb_g,
      };
    },
    { kcal: 0, proteinG: 0, fatG: 0, carbG: 0 },
  );
}
