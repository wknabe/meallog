/** 食事記録の読み書き */
import { getDatabase } from '@/db';
import { addNutrients, emptyNutrients, type Nutrients } from '@/db/nutrients';
import type { DayKey } from '@/lib/day';
import type { Meal, MealItem, MealSlot, RefType } from '@/lib/types';

export type MealItemInput = {
  refType: RefType;
  refId: number;
  /** 記録時点の名称。あとで元データの名前が変わっても記録は変えない */
  name: string;
  /**
   * 単位が指定されていればその個数（卵なら「1」）、単位がなければグラム数。
   * 実重量は必ず grams 列を使うこと。
   */
  quantity: number;
  /** 「1パック」のような表示用ラベル */
  unitLabel: string | null;
  /** 実重量。買い物や在庫の計算に使う */
  grams: number;
  nutrients: Nutrients;
};

export type MealInput = {
  date: DayKey;
  slot: MealSlot;
  eatenAt: string;
  photoPath: string | null;
  memo: string | null;
  items: MealItemInput[];
};

type MealRow = {
  id: number;
  date: string;
  slot: string;
  eaten_at: string;
  photo_path: string | null;
  memo: string | null;
};

type MealItemRow = {
  id: number;
  meal_id: number;
  ref_type: string;
  ref_id: number;
  name: string;
  quantity: number;
  unit_label: string | null;
  grams: number;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
  fiber_g: number;
  nutrients: string;
};

function toMealItem(row: MealItemRow): MealItem {
  let nutrients: Nutrients;
  try {
    nutrients = { ...emptyNutrients(), ...(JSON.parse(row.nutrients) as Partial<Nutrients>) };
  } catch {
    // 保存内容が壊れていても記録自体は表示できるようにする
    nutrients = emptyNutrients();
  }
  return {
    id: row.id,
    refType: row.ref_type as RefType,
    refId: row.ref_id,
    name: row.name,
    quantity: row.quantity,
    unitLabel: row.unit_label,
    grams: row.grams,
    kcal: row.kcal,
    proteinG: row.protein_g,
    fatG: row.fat_g,
    carbG: row.carb_g,
    fiberG: row.fiber_g,
    nutrients,
  };
}

async function insertItems(mealId: number, items: MealItemInput[]): Promise<void> {
  const db = getDatabase();
  for (const [index, item] of items.entries()) {
    await db.runAsync(
      `INSERT INTO meal_items (
         meal_id, ref_type, ref_id, name, quantity, unit_label, grams,
         kcal, protein_g, fat_g, carb_g, fiber_g, nutrients, sort_order
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        mealId,
        item.refType,
        item.refId,
        item.name,
        item.quantity,
        item.unitLabel,
        item.grams,
        item.nutrients.kcal,
        item.nutrients.protein_g,
        item.nutrients.fat_g,
        item.nutrients.carb_g,
        item.nutrients.fiber_g,
        JSON.stringify(item.nutrients),
        index,
      ],
    );
  }
}

export async function createMeal(input: MealInput): Promise<number> {
  const db = getDatabase();
  const now = new Date().toISOString();
  let mealId = 0;

  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT INTO meals (date, slot, eaten_at, photo_path, memo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [input.date, input.slot, input.eatenAt, input.photoPath, input.memo, now, now],
    );
    mealId = result.lastInsertRowId;
    await insertItems(mealId, input.items);
  });

  return mealId;
}

export async function updateMeal(id: number, input: MealInput): Promise<void> {
  const db = getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE meals SET date = ?, slot = ?, eaten_at = ?, photo_path = ?, memo = ?, updated_at = ?
       WHERE id = ?;`,
      [
        input.date,
        input.slot,
        input.eatenAt,
        input.photoPath,
        input.memo,
        new Date().toISOString(),
        id,
      ],
    );
    // 中身は毎回入れ替える。並び順や個数の変更を差分で扱うと複雑になるため
    await db.runAsync('DELETE FROM meal_items WHERE meal_id = ?;', [id]);
    await insertItems(id, input.items);
  });
}

export async function getMeal(id: number): Promise<Meal | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<MealRow>('SELECT * FROM meals WHERE id = ?;', [id]);
  if (!row) return null;
  const itemRows = await db.getAllAsync<MealItemRow>(
    'SELECT * FROM meal_items WHERE meal_id = ? ORDER BY sort_order ASC, id ASC;',
    [id],
  );
  return {
    id: row.id,
    date: row.date,
    slot: row.slot as MealSlot,
    eatenAt: row.eaten_at,
    photoPath: row.photo_path,
    memo: row.memo,
    items: itemRows.map(toMealItem),
  };
}

/** 指定日の食事を、時刻の早い順に返す */
export async function listMealsByDate(date: DayKey): Promise<Meal[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<MealRow>(
    'SELECT * FROM meals WHERE date = ? ORDER BY eaten_at ASC, id ASC;',
    [date],
  );
  if (rows.length === 0) return [];

  const itemRows = await db.getAllAsync<MealItemRow>(
    `SELECT * FROM meal_items
     WHERE meal_id IN (SELECT id FROM meals WHERE date = ?)
     ORDER BY sort_order ASC, id ASC;`,
    [date],
  );

  const itemsByMeal = new Map<number, MealItem[]>();
  for (const itemRow of itemRows) {
    const list = itemsByMeal.get(itemRow.meal_id) ?? [];
    list.push(toMealItem(itemRow));
    itemsByMeal.set(itemRow.meal_id, list);
  }

  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    slot: row.slot as MealSlot,
    eatenAt: row.eaten_at,
    photoPath: row.photo_path,
    memo: row.memo,
    items: itemsByMeal.get(row.id) ?? [],
  }));
}

export async function deleteMeal(id: number): Promise<void> {
  const db = getDatabase();
  // meal_items は ON DELETE CASCADE で一緒に消える
  await db.runAsync('DELETE FROM meals WHERE id = ?;', [id]);
}

export type DailyTotals = {
  date: DayKey;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  fiberG: number;
};

const emptyTotals = (date: DayKey): DailyTotals => ({
  date,
  kcal: 0,
  proteinG: 0,
  fatG: 0,
  carbG: 0,
  fiberG: 0,
});

/** 指定日の摂取合計 */
export async function getDailyTotals(date: DayKey): Promise<DailyTotals> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{
    kcal: number | null;
    protein_g: number | null;
    fat_g: number | null;
    carb_g: number | null;
    fiber_g: number | null;
  }>(
    `SELECT SUM(i.kcal) AS kcal, SUM(i.protein_g) AS protein_g, SUM(i.fat_g) AS fat_g,
            SUM(i.carb_g) AS carb_g, SUM(i.fiber_g) AS fiber_g
     FROM meal_items i JOIN meals m ON m.id = i.meal_id
     WHERE m.date = ?;`,
    [date],
  );
  if (!row) return emptyTotals(date);
  return {
    date,
    kcal: row.kcal ?? 0,
    proteinG: row.protein_g ?? 0,
    fatG: row.fat_g ?? 0,
    carbG: row.carb_g ?? 0,
    fiberG: row.fiber_g ?? 0,
  };
}

/** 期間内の日別合計。記録がない日は0で埋めず、存在する日だけ返す */
export async function listDailyTotals(from: DayKey, to: DayKey): Promise<DailyTotals[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<{
    date: string;
    kcal: number;
    protein_g: number;
    fat_g: number;
    carb_g: number;
    fiber_g: number;
  }>(
    `SELECT m.date AS date, SUM(i.kcal) AS kcal, SUM(i.protein_g) AS protein_g,
            SUM(i.fat_g) AS fat_g, SUM(i.carb_g) AS carb_g, SUM(i.fiber_g) AS fiber_g
     FROM meal_items i JOIN meals m ON m.id = i.meal_id
     WHERE m.date BETWEEN ? AND ?
     GROUP BY m.date
     ORDER BY m.date ASC;`,
    [from, to],
  );
  return rows.map((row) => ({
    date: row.date,
    kcal: row.kcal ?? 0,
    proteinG: row.protein_g ?? 0,
    fatG: row.fat_g ?? 0,
    carbG: row.carb_g ?? 0,
    fiberG: row.fiber_g ?? 0,
  }));
}

/**
 * 期間内の全栄養素の合計。
 * ビタミン・ミネラルはJSON列に入っているためSQLでは合計できず、行を取り出して足し合わせる。
 * 献立提案で「直近7日の不足栄養素」を求めるときに使う。
 */
export async function sumNutrientsInRange(from: DayKey, to: DayKey): Promise<Nutrients> {
  const db = getDatabase();
  const rows = await db.getAllAsync<{ nutrients: string }>(
    `SELECT i.nutrients AS nutrients
     FROM meal_items i JOIN meals m ON m.id = i.meal_id
     WHERE m.date BETWEEN ? AND ?;`,
    [from, to],
  );
  const parsed: Partial<Nutrients>[] = [];
  for (const row of rows) {
    try {
      parsed.push(JSON.parse(row.nutrients) as Partial<Nutrients>);
    } catch {
      // 壊れた行は無視して集計を続ける
    }
  }
  return addNutrients(...parsed);
}

/** 記録がある日数。平均を出すときの分母に使う */
export async function countRecordedDays(from: DayKey, to: DayKey): Promise<number> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(DISTINCT date) AS count FROM meals WHERE date BETWEEN ? AND ?;',
    [from, to],
  );
  return row?.count ?? 0;
}

/**
 * 保存期間を過ぎて実ファイルを消した写真の参照を、記録側からも外す。
 * これをしないと、一覧に中身のない灰色の枠が残り続ける。
 */
export async function clearPhotoPaths(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const db = getDatabase();
  const placeholders = paths.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE meals SET photo_path = NULL WHERE photo_path IN (${placeholders});`,
    paths,
  );
  await db.runAsync(
    `UPDATE foods SET label_photo_path = NULL WHERE label_photo_path IN (${placeholders});`,
    paths,
  );
}

/** 直近に食べた料理のID。献立提案で重複を避けるために使う */
export async function recentDishIds(from: DayKey, to: DayKey): Promise<number[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<{ ref_id: number }>(
    `SELECT DISTINCT i.ref_id AS ref_id
     FROM meal_items i JOIN meals m ON m.id = i.meal_id
     WHERE m.date BETWEEN ? AND ? AND i.ref_type = 'dish';`,
    [from, to],
  );
  return rows.map((row) => row.ref_id);
}
