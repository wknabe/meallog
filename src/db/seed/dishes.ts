/**
 * 料理データをDBへ投入する。
 *
 * assets/data/dishes.json は tools/build-dish-seed.mjs が
 * data/dishes/*.json から生成している（食品番号の実在チェック込み）。
 *
 * 同一性の判定には dishes.seed_key を使う。
 * 名前で判定すると、ユーザーが「肉じゃが」を「うちの肉じゃが」に改名しただけで
 * 次の更新時に「肉じゃが」が重複して入ってしまうため。
 * ユーザーが消したプリセットは app_meta に控えておき、勝手に復活させない。
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
const VERSION_KEY = 'dish_seed_version';
const REMOVED_KEY = 'removed_dish_seed_keys';

export async function getMeta(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_meta WHERE key = ?;',
    [key]
  );
  return row?.value ?? null;
}

export async function setMeta(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO app_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    [key, value]
  );
}

/** ユーザーが削除したプリセット料理の識別子 */
export async function getRemovedSeedKeys(db: SQLiteDatabase): Promise<Set<string>> {
  const raw = await getMeta(db, REMOVED_KEY);
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

/** 削除したプリセットを覚えておく。次の更新で復活させないため */
export async function rememberRemovedSeedKey(db: SQLiteDatabase, seedKey: string): Promise<void> {
  const keys = await getRemovedSeedKeys(db);
  keys.add(seedKey);
  await setMeta(db, REMOVED_KEY, JSON.stringify([...keys]));
}

/**
 * 未投入の料理を追加する。追加した件数を返す。
 * 材料が解決できない料理があった場合は版数を進めず、次の起動でやり直す。
 */
export async function seedPresetDishes(db: SQLiteDatabase): Promise<number> {
  const installed = Number((await getMeta(db, VERSION_KEY)) ?? 0);
  if (installed >= DISH_SEED_VERSION) return 0;

  const existingRows = await db.getAllAsync<{ seed_key: string }>(
    'SELECT seed_key FROM dishes WHERE seed_key IS NOT NULL;'
  );
  const existing = new Set(existingRows.map((row) => row.seed_key));
  const removed = await getRemovedSeedKeys(db);

  // 食品番号から食品idを引くための対応表
  const foodRows = await db.getAllAsync<{ id: number; std_code: string }>(
    'SELECT id, std_code FROM foods WHERE std_code IS NOT NULL;'
  );
  const foodIdByCode = new Map(foodRows.map((row) => [row.std_code, row.id]));

  const now = new Date().toISOString();
  let inserted = 0;
  let skipped = 0;

  await db.withTransactionAsync(async () => {
    for (const row of seed.rows) {
      const [name, category, cuisine, effort, volume, servings, cookMinutes, tastes, ingredients] =
        row;
      const seedKey = name;
      if (existing.has(seedKey) || removed.has(seedKey)) continue;

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
        skipped++;
        continue;
      }

      const result = await db.runAsync(
        `INSERT INTO dishes (name, kana, seed_key, category, cuisine, effort, volume, servings,
                             cook_minutes, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'preset', ?, ?);`,
        [name, name, seedKey, category, cuisine, effort, volume, servings, cookMinutes, now, now]
      );
      const dishId = result.lastInsertRowId;

      for (const taste of new Set(tastes)) {
        // 同じ味タグが重複していても投入全体が失敗しないようにする
        await db.runAsync('INSERT OR IGNORE INTO dish_tastes (dish_id, taste) VALUES (?, ?);', [
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

    // 取りこぼしがあるときは版数を進めない。次の起動で残りを入れ直す
    if (skipped === 0) {
      await setMeta(db, VERSION_KEY, String(DISH_SEED_VERSION));
    } else {
      console.warn(`${skipped}件を投入できなかったため、次回の起動でやり直します`);
    }
  });

  return inserted;
}
