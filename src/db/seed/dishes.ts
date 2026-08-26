/**
 * 料理データをDBへ投入する。
 *
 * assets/data/dishes.json は tools/build-dish-seed.mjs が
 * data/dishes/*.json から生成している（食品番号の実在チェック込み）。
 *
 * 品数はあとから増やすため、投入済みの版数を app_meta に持ち、
 * 版が上がったときは「まだ無い名前の料理」だけを追加する。
 * こうすると、ユーザーが編集した料理を上書きせずに新作を足せる。
 */
import type { SQLiteDatabase } from 'expo-sqlite';

type DishSeedFile = {
  columns: string[];
  /** [名前, カテゴリ, ジャンル, 手間, ボリューム, 人数分, 調理時間, 味タグ[], 材料[[食品番号, グラム, 調味料か]]] */
  rows: [
    string,
    string,
    string | null,
    string | null,
    string | null,
    number,
    number | null,
    string[],
    [string, number, number][],
  ][];
};

// 巨大なJSONを import すると型推論が重くなるため require で読み込む
const seed = require('@/assets/data/dishes.json') as DishSeedFile;

/** 料理データの版数。品目を追加したらこの数を上げる */
const DISH_SEED_VERSION = 1;
const META_KEY = 'dish_seed_version';

async function getMeta(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_meta WHERE key = ?;',
    [key]
  );
  return row?.value ?? null;
}

async function setMeta(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO app_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    [key, value]
  );
}

/**
 * 未投入の料理を追加する。追加した件数を返す。
 * 材料は食品番号で参照し、成分表の投入が終わっている前提で id に解決する。
 */
export async function seedPresetDishes(db: SQLiteDatabase): Promise<number> {
  const installed = Number((await getMeta(db, META_KEY)) ?? 0);
  if (installed >= DISH_SEED_VERSION) return 0;

  // 既にある料理名を集めておき、同じ名前を二重に入れない
  const existingRows = await db.getAllAsync<{ name: string }>('SELECT name FROM dishes;');
  const existing = new Set(existingRows.map((row) => row.name));

  // 食品番号から食品idを引くための対応表
  const foodRows = await db.getAllAsync<{ id: number; std_code: string }>(
    'SELECT id, std_code FROM foods WHERE std_code IS NOT NULL;'
  );
  const foodIdByCode = new Map(foodRows.map((row) => [row.std_code, row.id]));

  const now = new Date().toISOString();
  let inserted = 0;

  await db.withTransactionAsync(async () => {
    for (const row of seed.rows) {
      const [name, category, cuisine, effort, volume, servings, cookMinutes, tastes, ingredients] =
        row;
      if (existing.has(name)) continue;

      // 材料が1つでも欠けている料理は入れない（栄養価が過小に出るため）
      const resolved: { foodId: number; grams: number; isSeasoning: number }[] = [];
      let missing = false;
      for (const [code, grams, isSeasoning] of ingredients) {
        const foodId = foodIdByCode.get(code);
        if (foodId == null) {
          missing = true;
          break;
        }
        resolved.push({ foodId, grams, isSeasoning });
      }
      if (missing) {
        console.warn(`料理「${name}」の材料が見つからないため投入をとばしました`);
        continue;
      }

      const result = await db.runAsync(
        `INSERT INTO dishes (name, kana, category, cuisine, effort, volume, servings,
                             cook_minutes, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'preset', ?, ?);`,
        [name, name, category, cuisine, effort, volume, servings, cookMinutes, now, now]
      );
      const dishId = result.lastInsertRowId;

      for (const taste of tastes) {
        await db.runAsync('INSERT INTO dish_tastes (dish_id, taste) VALUES (?, ?);', [
          dishId,
          taste,
        ]);
      }

      for (const [index, ingredient] of resolved.entries()) {
        await db.runAsync(
          `INSERT INTO dish_ingredients (dish_id, food_id, grams, is_seasoning, sort_order)
           VALUES (?, ?, ?, ?, ?);`,
          [dishId, ingredient.foodId, ingredient.grams, ingredient.isSeasoning, index]
        );
      }

      inserted++;
    }

    await setMeta(db, META_KEY, String(DISH_SEED_VERSION));
  });

  return inserted;
}
