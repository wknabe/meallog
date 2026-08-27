/**
 * 買い物リスト。
 *
 * 献立に入っている料理の材料をグラムで集計し、冷蔵庫にあるぶんを差し引いてから、
 * 店で買う単位（1玉・1切れなど）に切り上げて表示する。
 * 調味料はまとめて「調味料など」として1行にする（毎回買うものではないため）。
 */
import { getDatabase } from '@/db';
import { FOOD_GROUPS } from '@/db/repo/foods';
import type { DayKey } from '@/lib/day';
import { toPurchaseAmount, withRefuse, type Unit } from '@/lib/units';

export type ShoppingItem = {
  id: number;
  foodId: number | null;
  name: string;
  groupCode: string | null;
  /** 売り場のまとまり */
  categoryLabel: string;
  needGrams: number;
  purchaseQty: number | null;
  purchaseUnit: string | null;
  /** 「1玉（必要 480g）」のような表示 */
  label: string;
  checked: boolean;
};

export type ShoppingList = {
  id: number;
  startDate: DayKey;
  endDate: DayKey;
  items: ShoppingItem[];
};

/** 調味料をまとめる行の名前 */
const SEASONING_LABEL = '調味料など';

type AggregatedFood = {
  foodId: number;
  name: string;
  groupCode: string | null;
  refusePct: number;
  grams: number;
  units: Unit[];
};

/**
 * 期間の献立から必要な食材を集計する。
 * 在庫があるぶんは差し引き、廃棄率（皮や芯）を考慮して購入量に直す。
 */
export async function aggregateIngredients(
  from: DayKey,
  to: DayKey,
): Promise<{ foods: AggregatedFood[]; seasoningNames: string[] }> {
  const db = getDatabase();

  const rows = await db.getAllAsync<{
    food_id: number;
    name: string;
    group_code: string | null;
    refuse_pct: number;
    is_seasoning: number;
    grams: number;
  }>(
    `SELECT di.food_id,
            f.name,
            f.group_code,
            f.refuse_pct,
            -- 同じ食材でも料理によって調味料扱いが違うことがある。
            -- 1つでも食材として使われていれば買う対象にする（MIN=0が優先される）
            MIN(di.is_seasoning) AS is_seasoning,
            -- 献立の人数分に合わせて材料をスケールする
            SUM(di.grams * mp.quantity / d.servings) AS grams
     FROM meal_plans mp
     JOIN dishes d ON d.id = mp.ref_id
     JOIN dish_ingredients di ON di.dish_id = d.id
     JOIN foods f ON f.id = di.food_id
     WHERE mp.date BETWEEN ? AND ? AND mp.ref_type = 'dish' AND mp.cooked = 0
     GROUP BY di.food_id;`,
    [from, to],
  );

  // 在庫を引く
  const pantryRows = await db.getAllAsync<{ food_id: number; grams: number }>(
    'SELECT food_id, SUM(grams) AS grams FROM pantry GROUP BY food_id;',
  );
  const pantryByFood = new Map(pantryRows.map((row) => [row.food_id, row.grams]));

  // 常用単位（購入単位を含む）
  const unitRows = await db.getAllAsync<{
    food_id: number;
    name: string;
    grams: number;
    is_purchase_unit: number;
  }>('SELECT food_id, name, grams, is_purchase_unit FROM food_units;');
  const unitsByFood = new Map<number, Unit[]>();
  for (const row of unitRows) {
    const list = unitsByFood.get(row.food_id) ?? [];
    list.push({ name: row.name, grams: row.grams, isPurchaseUnit: row.is_purchase_unit === 1 });
    unitsByFood.set(row.food_id, list);
  }

  const foods: AggregatedFood[] = [];
  const seasoningNames: string[] = [];

  for (const row of rows) {
    if (row.is_seasoning === 1) {
      if (!seasoningNames.includes(row.name)) seasoningNames.push(row.name);
      continue;
    }
    const stock = pantryByFood.get(row.food_id) ?? 0;
    const shortage = row.grams - stock;
    if (shortage <= 0) continue;

    foods.push({
      foodId: row.food_id,
      name: row.name,
      groupCode: row.group_code,
      refusePct: row.refuse_pct,
      // 皮や芯を捨てるぶんも買う必要がある
      grams: withRefuse(shortage, row.refuse_pct),
      units: unitsByFood.get(row.food_id) ?? [],
    });
  }

  return { foods, seasoningNames };
}

/** 期間の献立から買い物リストを作り、保存する */
export async function buildShoppingList(from: DayKey, to: DayKey): Promise<number> {
  const db = getDatabase();
  const { foods, seasoningNames } = await aggregateIngredients(from, to);
  const now = new Date().toISOString();
  let listId = 0;

  await db.withTransactionAsync(async () => {
    // 同じ期間のリストは作り直す
    await db.runAsync('DELETE FROM shopping_lists WHERE start_date = ? AND end_date = ?;', [
      from,
      to,
    ]);
    const result = await db.runAsync(
      'INSERT INTO shopping_lists (start_date, end_date, created_at) VALUES (?, ?, ?);',
      [from, to, now],
    );
    listId = result.lastInsertRowId;

    // 売り場ごとにまとまるよう食品群の順で並べる
    const sorted = [...foods].sort((a, b) =>
      (a.groupCode ?? '99').localeCompare(b.groupCode ?? '99'),
    );

    for (const [index, food] of sorted.entries()) {
      const amount = toPurchaseAmount(food.grams, food.units);
      await db.runAsync(
        `INSERT INTO shopping_items
           (list_id, food_id, name, group_code, need_grams, purchase_qty, purchase_unit, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          listId,
          food.foodId,
          food.name,
          food.groupCode,
          food.grams,
          amount.unitName != null ? amount.quantity : null,
          amount.unitName,
          index,
        ],
      );
    }

    if (seasoningNames.length > 0) {
      await db.runAsync(
        `INSERT INTO shopping_items
           (list_id, food_id, name, group_code, need_grams, purchase_qty, purchase_unit, sort_order)
         VALUES (?, NULL, ?, '17', 0, NULL, NULL, ?);`,
        [listId, `${SEASONING_LABEL}（${seasoningNames.slice(0, 6).join('・')}）`, sorted.length],
      );
    }
  });

  return listId;
}

export async function getShoppingList(from: DayKey, to: DayKey): Promise<ShoppingList | null> {
  const db = getDatabase();
  const list = await db.getFirstAsync<{ id: number; start_date: string; end_date: string }>(
    'SELECT id, start_date, end_date FROM shopping_lists WHERE start_date = ? AND end_date = ?;',
    [from, to],
  );
  if (!list) return null;

  const rows = await db.getAllAsync<{
    id: number;
    food_id: number | null;
    name: string;
    group_code: string | null;
    need_grams: number;
    purchase_qty: number | null;
    purchase_unit: string | null;
    checked: number;
  }>('SELECT * FROM shopping_items WHERE list_id = ? ORDER BY sort_order ASC, id ASC;', [list.id]);

  return {
    id: list.id,
    startDate: list.start_date,
    endDate: list.end_date,
    items: rows.map((row) => ({
      id: row.id,
      foodId: row.food_id,
      name: row.name,
      groupCode: row.group_code,
      categoryLabel: row.group_code ? (FOOD_GROUPS[row.group_code] ?? 'その他') : 'その他',
      needGrams: row.need_grams,
      purchaseQty: row.purchase_qty,
      purchaseUnit: row.purchase_unit,
      label: formatItemLabel(row),
      checked: row.checked === 1,
    })),
  };
}

function formatItemLabel(row: {
  need_grams: number;
  purchase_qty: number | null;
  purchase_unit: string | null;
}): string {
  if (row.purchase_qty != null && row.purchase_unit != null) {
    const grams =
      row.need_grams >= 1000
        ? `${Number((row.need_grams / 1000).toFixed(2))}kg`
        : `${Math.round(row.need_grams)}g`;
    return `${row.purchase_qty}${row.purchase_unit}（必要 ${grams}）`;
  }
  if (row.need_grams <= 0) return '';
  return row.need_grams >= 1000
    ? `${Number((row.need_grams / 1000).toFixed(2))}kg`
    : `${Math.round(row.need_grams)}g`;
}

export async function toggleShoppingItem(id: number, checked: boolean): Promise<void> {
  const db = getDatabase();
  await db.runAsync('UPDATE shopping_items SET checked = ? WHERE id = ?;', [checked ? 1 : 0, id]);
}

/**
 * チェックした食材を冷蔵庫へ移す。買ってきたものを在庫にする用途。
 *
 * 在庫は可食部のグラムで持っている（献立の材料もそうなっている）ため、
 * 「1玉」のような購入単位で買った場合は、その重量から廃棄率を引いた量を入れる。
 * 移し終えた行はチェックを外す。外さないと、もう一度押すたびに在庫が二重に増える。
 */
export async function moveCheckedToPantry(listId: number): Promise<number> {
  const db = getDatabase();
  const rows = await db.getAllAsync<{
    id: number;
    food_id: number | null;
    need_grams: number;
    purchase_qty: number | null;
    purchase_unit: string | null;
    refuse_pct: number;
    unit_grams: number | null;
  }>(
    `SELECT si.id, si.food_id, si.need_grams, si.purchase_qty, si.purchase_unit,
            f.refuse_pct,
            (SELECT grams FROM food_units
              WHERE food_id = si.food_id AND name = si.purchase_unit LIMIT 1) AS unit_grams
     FROM shopping_items si
     JOIN foods f ON f.id = si.food_id
     WHERE si.list_id = ? AND si.checked = 1;`,
    [listId],
  );

  const { addToPantry } = await import('@/db/repo/pantry');
  let moved = 0;

  for (const row of rows) {
    if (row.food_id == null) continue;

    // 実際に買う重量。購入単位があればその個数ぶん、なければ必要量そのまま
    const purchasedGrams =
      row.purchase_qty != null && row.unit_grams != null && row.unit_grams > 0
        ? row.purchase_qty * row.unit_grams
        : row.need_grams;
    const edibleGrams = purchasedGrams * (1 - Math.min(Math.max(row.refuse_pct, 0), 99) / 100);
    if (edibleGrams <= 0) continue;

    await addToPantry(row.food_id, edibleGrams, null);
    await db.runAsync('UPDATE shopping_items SET checked = 0 WHERE id = ?;', [row.id]);
    moved++;
  }

  return moved;
}
