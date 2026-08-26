/** 食品マスタの検索と取得 */
import { getDatabase } from '@/db';
import { NUTRIENT_KEYS, type Nutrients } from '@/db/nutrients';

/** 成分表の食品群コードと名称。買い物リストの売り場分けにも使う */
export const FOOD_GROUPS: Record<string, string> = {
  '01': '穀類',
  '02': 'いも・でん粉類',
  '03': '砂糖・甘味類',
  '04': '豆類',
  '05': '種実類',
  '06': '野菜類',
  '07': '果実類',
  '08': 'きのこ類',
  '09': '藻類',
  '10': '魚介類',
  '11': '肉類',
  '12': '卵類',
  '13': '乳類',
  '14': '油脂類',
  '15': '菓子類',
  '16': '嗜好飲料類',
  '17': '調味料・香辛料類',
  '18': '調理済み流通食品類',
};

export type FoodSource = 'standard' | 'user' | 'product';

export type Food = {
  id: number;
  source: FoodSource;
  stdCode: string | null;
  name: string;
  groupCode: string | null;
  maker: string | null;
  refusePct: number;
  isFavorite: boolean;
  useCount: number;
  /** 100gあたりの栄養価 */
  per100g: Nutrients;
};

type FoodRow = Record<string, string | number | null>;

function toFood(row: FoodRow): Food {
  const per100g = {} as Nutrients;
  for (const key of NUTRIENT_KEYS) per100g[key] = Number(row[key] ?? 0);
  return {
    id: Number(row.id),
    source: row.source as FoodSource,
    stdCode: (row.std_code as string) ?? null,
    name: String(row.name),
    groupCode: (row.group_code as string) ?? null,
    maker: (row.maker as string) ?? null,
    refusePct: Number(row.refuse_pct ?? 0),
    isFavorite: Number(row.is_favorite) === 1,
    useCount: Number(row.use_count ?? 0),
    per100g,
  };
}

/**
 * 食品を検索する。
 * 成分表の名称は「こめ ［水稲めし］ 精白米」のように区切りが入っているため、
 * 記号を除いた kana 列にも同じ条件で当てて、区切りをまたぐ入力でも拾えるようにしている。
 */
export async function searchFoods(
  query: string,
  options: { limit?: number; source?: FoodSource } = {}
): Promise<Food[]> {
  const db = getDatabase();
  const limit = options.limit ?? 50;
  const keyword = query.trim();

  if (keyword === '') {
    // 未入力のときはよく使う食品を出す
    const rows = await db.getAllAsync<FoodRow>(
      `SELECT * FROM foods
       ${options.source ? 'WHERE source = ?' : ''}
       ORDER BY is_favorite DESC, use_count DESC, name ASC
       LIMIT ?;`,
      options.source ? [options.source, limit] : [limit]
    );
    return rows.map(toFood);
  }

  const pattern = `%${keyword}%`;
  const normalized = `%${keyword.replace(/[\s［］[\]（）()・,、]/g, '')}%`;
  // 別名は kana 列に |鶏むね肉|鶏胸肉| の形で入っているので、区切りごと一致させると別名そのものの指定だと分かる
  const aliasExact = `%|${keyword}|%`;
  const rows = await db.getAllAsync<FoodRow>(
    `SELECT * FROM foods
     WHERE (name LIKE ? OR kana LIKE ?)
       ${options.source ? 'AND source = ?' : ''}
     ORDER BY
       is_favorite DESC,
       -- 「白米」のように別名が完全に一致するものを最優先で出す
       CASE WHEN kana LIKE ? THEN 0 ELSE 1 END,
       use_count DESC,
       -- 次に名前の先頭に一致するもの
       CASE WHEN name LIKE ? THEN 0 ELSE 1 END,
       LENGTH(name) ASC
     LIMIT ?;`,
    options.source
      ? [pattern, normalized, options.source, aliasExact, `${keyword}%`, limit]
      : [pattern, normalized, aliasExact, `${keyword}%`, limit]
  );
  return rows.map(toFood);
}

export async function getFood(id: number): Promise<Food | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<FoodRow>('SELECT * FROM foods WHERE id = ?;', [id]);
  return row ? toFood(row) : null;
}

/** 成分表の食品番号から取得する。料理データの材料指定で使う */
export async function getFoodByStdCode(stdCode: string): Promise<Food | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<FoodRow>('SELECT * FROM foods WHERE std_code = ?;', [stdCode]);
  return row ? toFood(row) : null;
}

/** 食品に登録されている常用単位（1個=50g など） */
export type FoodUnit = {
  id: number;
  name: string;
  grams: number;
  isPurchaseUnit: boolean;
};

export async function listFoodUnits(foodId: number): Promise<FoodUnit[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<{
    id: number;
    name: string;
    grams: number;
    is_purchase_unit: number;
  }>('SELECT * FROM food_units WHERE food_id = ? ORDER BY sort_order ASC, id ASC;', [foodId]);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    grams: row.grams,
    isPurchaseUnit: row.is_purchase_unit === 1,
  }));
}

/** 食品を使ったときに呼ぶ。よく使う順の並び替えに反映される */
export async function incrementFoodUseCount(id: number): Promise<void> {
  const db = getDatabase();
  await db.runAsync('UPDATE foods SET use_count = use_count + 1 WHERE id = ?;', [id]);
}

export async function countFoods(source?: FoodSource): Promise<number> {
  const db = getDatabase();
  const row = source
    ? await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) AS count FROM foods WHERE source = ?;',
        [source]
      )
    : await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM foods;');
  return row?.count ?? 0;
}

/**
 * よく使う食品を食品群で絞って取り出す。
 *
 * 別名を付けた食品（kana に区切りの | が入っているもの）だけを対象にする。
 * 成分表には「〜 ゆで」「〜 油いため」のような調理違いが大量にあり、
 * そのまま候補にすると提案が不自然になるため、日常語で呼べるものに限っている。
 */
export async function listCommonFoods(groupCodes: string[], limit = 30): Promise<Food[]> {
  const db = getDatabase();
  const placeholders = groupCodes.map(() => '?').join(',');
  const rows = await db.getAllAsync<FoodRow>(
    `SELECT * FROM foods
     WHERE group_code IN (${placeholders})
       AND (kana LIKE '%|%' OR source = 'product')
     ORDER BY use_count DESC, id ASC
     LIMIT ?;`,
    [...groupCodes, limit]
  );
  return rows.map(toFood);
}

/** 食品群のまとまり。提案で使う */
export const FOOD_GROUP_SETS = {
  /** 魚介・肉・卵・豆 */
  protein: ['10', '11', '12', '04'],
  /** 穀類・いも */
  staple: ['01', '02'],
  /** 野菜・きのこ・藻類 */
  vegetable: ['06', '08', '09'],
} as const;
