/**
 * 日本食品標準成分表のデータをDBへ投入する。
 *
 * assets/data/foods.json は tools/build-food-seed.mjs で生成している。
 * 出典: 日本食品標準成分表（八訂）増補2023年（文部科学省）
 */
import type { SQLiteDatabase } from 'expo-sqlite';

type FoodSeedFile = {
  source: string;
  generatedAt: string;
  columns: string[];
  rows: (string | number)[][];
};

// import ではなく require を使う。
// 2,500件ぶんのJSONを import すると型推論が巨大になり、型チェックが極端に遅くなるため。
const seed = require('@/assets/data/foods.json') as FoodSeedFile;

type UnitSeedFile = {
  columns: string[];
  /** [食品番号, 単位名, グラム, 購入単位か, 並び順] */
  rows: [string, string, number, number, number][];
};

const unitSeed = require('@/assets/data/food-units.json') as UnitSeedFile;

/** 1回のINSERTでまとめる件数。SQLiteのプレースホルダ数の上限に余裕を持たせている */
const BATCH_SIZE = 25;

/**
 * 成分表データが未投入なら投入する。
 * 初回起動時のみ実行され、2回目以降は件数チェックだけで終わる。
 */
export async function seedStandardFoods(db: SQLiteDatabase): Promise<number> {
  const existing = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM foods WHERE source = 'standard';"
  );
  if ((existing?.count ?? 0) > 0) return 0;

  const now = new Date().toISOString();
  // JSONの列順にDBの列を並べ、source と日時を末尾に足す
  const columns = [...seed.columns, 'source', 'created_at', 'updated_at'];
  const placeholders = `(${columns.map(() => '?').join(',')})`;
  const columnList = columns.join(',');

  await db.withTransactionAsync(async () => {
    for (let offset = 0; offset < seed.rows.length; offset += BATCH_SIZE) {
      const batch = seed.rows.slice(offset, offset + BATCH_SIZE);
      const values: (string | number)[] = [];
      for (const row of batch) {
        values.push(...row, 'standard', now, now);
      }
      await db.runAsync(
        `INSERT INTO foods (${columnList}) VALUES ${batch.map(() => placeholders).join(',')};`,
        values
      );
    }

    // 常用単位（卵=1個50g、キャベツ=1玉1200g など）
    for (const [stdCode, name, grams, isPurchaseUnit, sortOrder] of unitSeed.rows) {
      await db.runAsync(
        `INSERT INTO food_units (food_id, name, grams, is_purchase_unit, sort_order)
         SELECT id, ?, ?, ?, ? FROM foods WHERE std_code = ?;`,
        [name, grams, isPurchaseUnit, sortOrder, stdCode]
      );
    }
  });

  return seed.rows.length;
}

/** 出典表示。設定画面などに表示する */
export const FOOD_DATA_SOURCE = seed.source;
