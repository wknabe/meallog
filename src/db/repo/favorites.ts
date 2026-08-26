/**
 * よく食べる食事のテンプレート。
 * ワンタップで食事を記録できるようにするためのもの。
 *
 * 栄養価は保存せず、参照先（食品・料理）と数量だけを持つ。
 * 登録するときに毎回そのときの栄養価を計算し直すため、
 * 商品の成分表を更新した場合も新しい値で記録される。
 */
import { getDatabase } from '@/db';
import type { RefType } from '@/lib/types';
import type { MealSlot } from '@/lib/types';

export type FavoriteItem = {
  refType: RefType;
  refId: number;
  quantity: number;
  unitLabel: string | null;
};

export type MealFavorite = {
  id: number;
  name: string;
  slot: MealSlot | null;
  useCount: number;
  items: FavoriteItem[];
};

export async function listFavorites(): Promise<MealFavorite[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<{
    id: number;
    name: string;
    slot: string | null;
    use_count: number;
  }>('SELECT * FROM meal_favorites ORDER BY use_count DESC, id DESC;');
  if (rows.length === 0) return [];

  const placeholders = rows.map(() => '?').join(',');
  const itemRows = await db.getAllAsync<{
    favorite_id: number;
    ref_type: string;
    ref_id: number;
    quantity: number;
    unit_label: string | null;
  }>(
    `SELECT * FROM meal_favorite_items
     WHERE favorite_id IN (${placeholders})
     ORDER BY sort_order ASC, id ASC;`,
    rows.map((row) => row.id)
  );

  const itemsByFavorite = new Map<number, FavoriteItem[]>();
  for (const row of itemRows) {
    const list = itemsByFavorite.get(row.favorite_id) ?? [];
    list.push({
      refType: row.ref_type as RefType,
      refId: row.ref_id,
      quantity: row.quantity,
      unitLabel: row.unit_label,
    });
    itemsByFavorite.set(row.favorite_id, list);
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slot: (row.slot as MealSlot) ?? null,
    useCount: row.use_count,
    items: itemsByFavorite.get(row.id) ?? [],
  }));
}

export async function createFavorite(input: {
  name: string;
  slot: MealSlot | null;
  items: FavoriteItem[];
}): Promise<number> {
  const db = getDatabase();
  let favoriteId = 0;
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      'INSERT INTO meal_favorites (name, slot, created_at) VALUES (?, ?, ?);',
      [input.name, input.slot, new Date().toISOString()]
    );
    favoriteId = result.lastInsertRowId;
    for (const [index, item] of input.items.entries()) {
      await db.runAsync(
        `INSERT INTO meal_favorite_items (favorite_id, ref_type, ref_id, quantity, unit_label, sort_order)
         VALUES (?, ?, ?, ?, ?, ?);`,
        [favoriteId, item.refType, item.refId, item.quantity, item.unitLabel, index]
      );
    }
  });
  return favoriteId;
}

export async function deleteFavorite(id: number): Promise<void> {
  const db = getDatabase();
  await db.runAsync('DELETE FROM meal_favorites WHERE id = ?;', [id]);
}

export async function incrementFavoriteUseCount(id: number): Promise<void> {
  const db = getDatabase();
  await db.runAsync('UPDATE meal_favorites SET use_count = use_count + 1 WHERE id = ?;', [id]);
}
