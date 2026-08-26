/** 料理マスタの読み書き。材料構成から栄養価を毎回計算する */
import { getDatabase } from '@/db';
import { NUTRIENT_KEYS, type Nutrients } from '@/db/nutrients';
import { nutrientsForDish, type DishLike } from '@/lib/nutrition';
import type { Cuisine, DishCategory, Effort, Taste, Volume } from '@/lib/types';

export type DishIngredient = {
  id: number;
  foodId: number;
  foodName: string;
  grams: number;
  displayQty: number | null;
  displayUnit: string | null;
  isSeasoning: boolean;
  /** 材料の100gあたり栄養価 */
  per100g: Nutrients;
};

export type Dish = {
  id: number;
  name: string;
  category: DishCategory;
  cuisine: Cuisine | null;
  effort: Effort | null;
  volume: Volume | null;
  tastes: Taste[];
  servings: number;
  cookMinutes: number | null;
  steps: string | null;
  photoPath: string | null;
  source: 'preset' | 'user';
  isFavorite: boolean;
  useCount: number;
  ingredients: DishIngredient[];
};

type DishRow = {
  id: number;
  name: string;
  category: string;
  cuisine: string | null;
  effort: string | null;
  volume: string | null;
  servings: number;
  cook_minutes: number | null;
  steps: string | null;
  photo_path: string | null;
  source: string;
  is_favorite: number;
  use_count: number;
};

type IngredientRow = Record<string, string | number | null>;

function toIngredient(row: IngredientRow): DishIngredient {
  const per100g = {} as Nutrients;
  for (const key of NUTRIENT_KEYS) per100g[key] = Number(row[key] ?? 0);
  return {
    id: Number(row.id),
    foodId: Number(row.food_id),
    foodName: String(row.food_name),
    grams: Number(row.grams),
    displayQty: row.display_qty == null ? null : Number(row.display_qty),
    displayUnit: (row.display_unit as string) ?? null,
    isSeasoning: Number(row.is_seasoning) === 1,
    per100g,
  };
}

const NUTRIENT_COLUMNS = NUTRIENT_KEYS.map((key) => `f.${key}`).join(', ');

async function attachDetails(rows: DishRow[]): Promise<Dish[]> {
  if (rows.length === 0) return [];
  const db = getDatabase();
  const ids = rows.map((row) => row.id);
  const placeholders = ids.map(() => '?').join(',');

  const ingredientRows = await db.getAllAsync<IngredientRow>(
    `SELECT di.id, di.dish_id, di.food_id, di.grams, di.display_qty, di.display_unit,
            di.is_seasoning, f.name AS food_name, ${NUTRIENT_COLUMNS}
     FROM dish_ingredients di
     JOIN foods f ON f.id = di.food_id
     WHERE di.dish_id IN (${placeholders})
     ORDER BY di.sort_order ASC, di.id ASC;`,
    ids
  );
  const tasteRows = await db.getAllAsync<{ dish_id: number; taste: string }>(
    `SELECT dish_id, taste FROM dish_tastes WHERE dish_id IN (${placeholders});`,
    ids
  );

  const ingredientsByDish = new Map<number, DishIngredient[]>();
  for (const row of ingredientRows) {
    const dishId = Number(row.dish_id);
    const list = ingredientsByDish.get(dishId) ?? [];
    list.push(toIngredient(row));
    ingredientsByDish.set(dishId, list);
  }

  const tastesByDish = new Map<number, Taste[]>();
  for (const row of tasteRows) {
    const list = tastesByDish.get(row.dish_id) ?? [];
    list.push(row.taste as Taste);
    tastesByDish.set(row.dish_id, list);
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category as DishCategory,
    cuisine: (row.cuisine as Cuisine) ?? null,
    effort: (row.effort as Effort) ?? null,
    volume: (row.volume as Volume) ?? null,
    tastes: tastesByDish.get(row.id) ?? [],
    servings: row.servings,
    cookMinutes: row.cook_minutes,
    steps: row.steps,
    photoPath: row.photo_path,
    source: row.source as 'preset' | 'user',
    isFavorite: row.is_favorite === 1,
    useCount: row.use_count,
    ingredients: ingredientsByDish.get(row.id) ?? [],
  }));
}

export async function getDish(id: number): Promise<Dish | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<DishRow>('SELECT * FROM dishes WHERE id = ?;', [id]);
  if (!row) return null;
  const [dish] = await attachDetails([row]);
  return dish ?? null;
}

export type DishFilter = {
  category?: DishCategory;
  cuisine?: Cuisine;
  effort?: Effort;
  volume?: Volume;
  keyword?: string;
  limit?: number;
};

export async function listDishes(filter: DishFilter = {}): Promise<Dish[]> {
  const db = getDatabase();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filter.category) {
    conditions.push('category = ?');
    params.push(filter.category);
  }
  if (filter.cuisine) {
    conditions.push('cuisine = ?');
    params.push(filter.cuisine);
  }
  if (filter.effort) {
    conditions.push('effort = ?');
    params.push(filter.effort);
  }
  if (filter.volume) {
    conditions.push('volume = ?');
    params.push(filter.volume);
  }
  if (filter.keyword?.trim()) {
    conditions.push('(name LIKE ? OR kana LIKE ?)');
    params.push(`%${filter.keyword.trim()}%`, `%${filter.keyword.trim()}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(filter.limit ?? 100);

  const rows = await db.getAllAsync<DishRow>(
    `SELECT * FROM dishes ${where}
     ORDER BY is_favorite DESC, use_count DESC, name ASC
     LIMIT ?;`,
    params
  );
  return attachDetails(rows);
}

/** 料理を DishLike に変換する。栄養計算はこの形で行う */
export function toDishLike(dish: Dish): DishLike {
  return {
    id: dish.id,
    name: dish.name,
    servings: dish.servings,
    ingredients: dish.ingredients.map((ingredient) => ({
      food: { id: ingredient.foodId, name: ingredient.foodName, per100g: ingredient.per100g },
      grams: ingredient.grams,
    })),
  };
}

/** 料理を指定人数分食べたときの栄養価と重量 */
export function dishNutrition(dish: Dish, servings = 1) {
  return nutrientsForDish(toDishLike(dish), servings);
}

export async function incrementDishUseCount(id: number): Promise<void> {
  const db = getDatabase();
  await db.runAsync('UPDATE dishes SET use_count = use_count + 1 WHERE id = ?;', [id]);
}

export async function countDishes(): Promise<number> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM dishes;');
  return row?.count ?? 0;
}
