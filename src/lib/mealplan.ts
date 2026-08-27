/**
 * 献立の生成。
 *
 * 外部のAIは使わず、料理に付けた気分タグと栄養価から組み立てる。
 * 「主食1＋主菜1＋副菜1＋汁物」の枠を決め、枠ごとに候補を点数化して選び、
 * 最後に主食の量で全体のカロリーを合わせる、という順で解く。
 *
 * 点数は次を足し合わせたもの（小さいほど良い）。
 *   ・その枠に割り当てたカロリーとの近さ
 *   ・直近7日で不足している栄養素を含むほど加点（マイナス方向）
 *   ・気分タグの一致
 *   ・冷蔵庫にある材料を使うほど加点
 *   ・賞味期限が近い材料を使うほど加点
 *   ・直近に食べた料理は減点（同じものが続かないように）
 */
import type { NutrientKey, Nutrients } from '../db/nutrients.ts';
import type {
  Cuisine,
  DishCategory,
  Effort,
  MealSlot,
  MoodFilter,
  Taste,
  Volume,
} from './types.ts';

/** 献立に使える料理 */
export type PlanDish = {
  id: number;
  name: string;
  category: DishCategory;
  cuisine: Cuisine | null;
  effort: Effort | null;
  volume: Volume | null;
  tastes: Taste[];
  /** 1人前あたりの栄養価 */
  perServing: Nutrients;
  /** 材料の食品id。冷蔵庫との突き合わせに使う */
  ingredientFoodIds: number[];
};

export type PlanTarget = {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
};

export type PlanContext = {
  target: PlanTarget;
  mood: MoodFilter;
  /** 不足している栄養素と、その不足度（0〜1）。1に近いほど足りていない */
  deficits: Partial<Record<NutrientKey, number>>;
  /** 冷蔵庫にある食品id */
  pantryFoodIds: Set<number>;
  /** 賞味期限が近い食品id */
  expiringFoodIds: Set<number>;
  /** 直近に食べた料理id */
  recentDishIds: Set<number>;
  /** 同じ条件でも違う献立を出すための番号 */
  variant?: number;
};

export type PlanEntry = {
  dish: PlanDish;
  servings: number;
};

export type PlanMeal = {
  slot: MealSlot;
  entries: PlanEntry[];
};

export type DayPlan = {
  meals: PlanMeal[];
  totals: PlanTarget;
  /** なぜこの献立になったかの説明。画面に出す */
  reasons: string[];
  /** 主食の増減では目標カロリーに届かなかったか */
  calorieGapRemains: boolean;
};

/** 1日のカロリーを食事ごとに配分する割合 */
const MEAL_SHARES: { slot: MealSlot; share: number }[] = [
  { slot: 'breakfast', share: 0.25 },
  { slot: 'lunch', share: 0.35 },
  { slot: 'dinner', share: 0.4 },
];

/** 1食の中での枠の構成と、その枠に割り当てるカロリーの割合 */
const SLOT_LAYOUT: Record<MealSlot, { category: DishCategory; share: number }[]> = {
  breakfast: [
    { category: 'staple', share: 0.4 },
    { category: 'main', share: 0.35 },
    { category: 'soup', share: 0.12 },
    { category: 'side', share: 0.13 },
  ],
  lunch: [
    { category: 'staple', share: 0.4 },
    { category: 'main', share: 0.42 },
    { category: 'side', share: 0.18 },
  ],
  dinner: [
    { category: 'staple', share: 0.32 },
    { category: 'main', share: 0.4 },
    { category: 'side', share: 0.16 },
    { category: 'soup', share: 0.12 },
  ],
  snack: [{ category: 'other', share: 1 }],
};

/** 主食の量を増減できる範囲。ここでカロリーの帳尻を合わせる */
const STAPLE_SERVING_RANGE = { min: 0.5, max: 2 };
/** 主食1品あたりのカロリー上限。「大盛りごはん2人前」のような提案を防ぐ */
const MAX_STAPLE_KCAL_PER_DISH = 600;

/** 気分タグが一致しないときの減点 */
const MOOD_PENALTY = 3;

function matchesMood(dish: PlanDish, mood: MoodFilter): boolean {
  if (mood.cuisine && dish.cuisine !== mood.cuisine) return false;
  if (mood.effort && dish.effort !== mood.effort) return false;
  if (mood.volume && dish.volume !== mood.volume) return false;
  if (mood.tastes && mood.tastes.length > 0) {
    if (!mood.tastes.some((taste) => dish.tastes.includes(taste))) return false;
  }
  return true;
}

/**
 * 1つの料理を点数化する。小さいほど良い。
 * 気分に合わない料理も候補から外さず減点にとどめる。
 * 完全に除外すると、条件を絞ったときに献立が組めなくなるため。
 */
export function scoreDish(dish: PlanDish, context: PlanContext, budgetKcal: number): number {
  // カロリーの近さ。割り当てを超えるほうを重く見る
  const diff = (dish.perServing.kcal - budgetKcal) / Math.max(budgetKcal, 1);
  let score = diff > 0 ? diff * 1.5 : -diff;

  // 不足している栄養素を含むほど良い点にする
  for (const [key, weight] of Object.entries(context.deficits)) {
    const amount = dish.perServing[key as NutrientKey] ?? 0;
    if (amount > 0 && weight > 0) {
      // 栄養素ごとに桁が違うため、量そのものではなく「含むかどうか」に近い形で効かせる
      score -= Math.min(weight, 1) * 0.6;
    }
  }

  if (!matchesMood(dish, context.mood)) score += MOOD_PENALTY;

  // 冷蔵庫にある材料を使うほど良い
  const pantryHits = dish.ingredientFoodIds.filter((id) => context.pantryFoodIds.has(id)).length;
  score -= pantryHits * 0.4;

  // 賞味期限が近い材料は優先して使い切りたい
  const expiringHits = dish.ingredientFoodIds.filter((id) =>
    context.expiringFoodIds.has(id),
  ).length;
  score -= expiringHits * 0.8;

  // 直近に食べたものは避ける
  if (context.recentDishIds.has(dish.id)) score += 1.2;

  return score;
}

/** 枠ごとに候補を選ぶ。variant を変えると2番手・3番手が選ばれる */
function pickForSlot(
  candidates: PlanDish[],
  category: DishCategory,
  context: PlanContext,
  budgetKcal: number,
  used: Set<number>,
  variant: number,
): PlanDish | null {
  const pool = candidates
    .filter((dish) => dish.category === category && !used.has(dish.id))
    .map((dish) => ({ dish, score: scoreDish(dish, context, budgetKcal) }))
    .sort((a, b) => a.score - b.score);

  if (pool.length === 0) return null;
  return pool[variant % pool.length].dish;
}

function emptyTotals(): PlanTarget {
  return { kcal: 0, proteinG: 0, fatG: 0, carbG: 0 };
}

function addEntry(totals: PlanTarget, entry: PlanEntry): PlanTarget {
  return {
    kcal: totals.kcal + entry.dish.perServing.kcal * entry.servings,
    proteinG: totals.proteinG + entry.dish.perServing.protein_g * entry.servings,
    fatG: totals.fatG + entry.dish.perServing.fat_g * entry.servings,
    carbG: totals.carbG + entry.dish.perServing.carb_g * entry.servings,
  };
}

export function sumPlan(meals: PlanMeal[]): PlanTarget {
  let totals = emptyTotals();
  for (const meal of meals) {
    for (const entry of meal.entries) totals = addEntry(totals, entry);
  }
  return totals;
}

/**
 * 1日の献立を組む。
 * 候補が足りない枠は静かに飛ばし、組めた範囲で返す。
 */
export function generateDayPlan(candidates: PlanDish[], context: PlanContext): DayPlan {
  const variant = context.variant ?? 0;
  const used = new Set<number>();
  const meals: PlanMeal[] = [];

  for (const { slot, share } of MEAL_SHARES) {
    const mealKcal = context.target.kcal * share;
    const entries: PlanEntry[] = [];

    for (const layout of SLOT_LAYOUT[slot]) {
      const budget = mealKcal * layout.share;
      // variant=0 ならどの枠も最良の候補を選ぶ。
      // 献立の多様性は used（1日に同じ料理を使わない）と直近の重複減点で確保している
      const dish = pickForSlot(candidates, layout.category, context, budget, used, variant);
      if (!dish) continue;
      used.add(dish.id);
      entries.push({ dish, servings: 1 });
    }

    meals.push({ slot, entries });
  }

  const adjusted = fitCalories(meals, context.target.kcal);
  const totals = sumPlan(adjusted);
  // 主食の量では埋められない差が残ったかどうか。10%を超えたら伝える
  const calorieGapRemains =
    context.target.kcal > 0 &&
    Math.abs(totals.kcal - context.target.kcal) / context.target.kcal > 0.1;

  const reasons = buildReasons(adjusted, context);
  if (calorieGapRemains) {
    reasons.push(
      totals.kcal < context.target.kcal
        ? '主食を増やしても目標カロリーに届きませんでした。品数を足すか、別の献立にしてください'
        : '主食を減らしても目標カロリーを超えています。軽めの料理に替えるか、別の献立にしてください',
    );
  }

  return { meals: adjusted, totals, reasons, calorieGapRemains };
}

/**
 * 主食の量で全体のカロリーを合わせる。
 * 主菜や副菜の量を動かすと現実的でない献立になりやすいので、
 * 増減しても違和感の小さい主食だけを動かす。
 */
export function fitCalories(meals: PlanMeal[], targetKcal: number): PlanMeal[] {
  const staples = meals.flatMap((meal) =>
    meal.entries.filter((entry) => entry.dish.category === 'staple'),
  );
  if (staples.length === 0) return meals;

  const current = sumPlan(meals).kcal;
  // 1人前あたりで見る。現在の servings を掛けて数えると、
  // 調整済みの献立に再度かけたときに値が振動する
  const stapleKcalPerServing = staples.reduce((sum, entry) => sum + entry.dish.perServing.kcal, 0);
  if (stapleKcalPerServing <= 0) return meals;

  const currentStapleKcal = staples.reduce(
    (sum, entry) => sum + entry.dish.perServing.kcal * entry.servings,
    0,
  );

  // 主食以外は固定なので、主食が担うべきカロリーから倍率を求める
  const fixedKcal = current - currentStapleKcal;
  const desiredStapleKcal = targetKcal - fixedKcal;
  const ratio = desiredStapleKcal / stapleKcalPerServing;

  // 人数分の範囲と、1品あたりのカロリー上限の両方で頭打ちにする。
  // 「大盛りごはん2人前」のような非現実的な提案を避けるため
  const maxByKcal = Math.min(
    ...staples.map((entry) =>
      entry.dish.perServing.kcal > 0
        ? MAX_STAPLE_KCAL_PER_DISH / entry.dish.perServing.kcal
        : STAPLE_SERVING_RANGE.max,
    ),
  );
  const upperBound = Math.min(
    STAPLE_SERVING_RANGE.max,
    Math.max(maxByKcal, STAPLE_SERVING_RANGE.min),
  );

  // 0.1人前単位に丸める。細かすぎる指定は量れない
  const servings =
    Math.round(Math.max(STAPLE_SERVING_RANGE.min, Math.min(upperBound, ratio)) * 10) / 10;

  return meals.map((meal) => ({
    slot: meal.slot,
    entries: meal.entries.map((entry) =>
      entry.dish.category === 'staple' ? { ...entry, servings } : entry,
    ),
  }));
}

/** なぜこの献立になったかを説明する文を作る */
function buildReasons(meals: PlanMeal[], context: PlanContext): string[] {
  const reasons: string[] = [];
  const dishes = meals.flatMap((meal) => meal.entries.map((entry) => entry.dish));

  const deficitKeys = Object.entries(context.deficits)
    .filter(([, weight]) => weight > 0.2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([key]) => key as NutrientKey);
  if (deficitKeys.length > 0) {
    reasons.push(
      `直近で不足している${deficitKeys.map((key) => DEFICIT_LABELS[key] ?? key).join('・')}を多く含む料理を選びました`,
    );
  }

  const pantryUsed = dishes.filter((dish) =>
    dish.ingredientFoodIds.some((id) => context.pantryFoodIds.has(id)),
  ).length;
  if (pantryUsed > 0) {
    reasons.push(`冷蔵庫にある食材を使う料理を${pantryUsed}品入れました`);
  }

  const expiringUsed = dishes.filter((dish) =>
    dish.ingredientFoodIds.some((id) => context.expiringFoodIds.has(id)),
  ).length;
  if (expiringUsed > 0) {
    reasons.push(`賞味期限が近い食材を優先して使っています`);
  }

  const mismatched = dishes.filter((dish) => !matchesMood(dish, context.mood)).length;
  if (mismatched > 0 && hasMood(context.mood)) {
    reasons.push(`指定した気分に合う料理が足りず、${mismatched}品は条件から外れています`);
  }

  return reasons;
}

function hasMood(mood: MoodFilter): boolean {
  return Boolean(mood.cuisine || mood.effort || mood.volume || (mood.tastes?.length ?? 0) > 0);
}

/** 説明文で使う栄養素の呼び方 */
const DEFICIT_LABELS: Partial<Record<NutrientKey, string>> = {
  protein_g: 'たんぱく質',
  fiber_g: '食物繊維',
  calcium_mg: 'カルシウム',
  iron_mg: '鉄',
  vit_a_ug: 'ビタミンA',
  vit_c_mg: 'ビタミンC',
  vit_d_ug: 'ビタミンD',
  vit_b1_mg: 'ビタミンB1',
  vit_b2_mg: 'ビタミンB2',
  folate_ug: '葉酸',
  potassium_mg: 'カリウム',
  magnesium_mg: 'マグネシウム',
  zinc_mg: '亜鉛',
};

/**
 * 直近の摂取量と目安から、不足している栄養素の度合いを求める。
 * 0〜1の値で、1に近いほど足りていない。
 */
export function calcDeficits(
  averagePerDay: Partial<Nutrients>,
  reference: Partial<Record<NutrientKey, number>>,
): Partial<Record<NutrientKey, number>> {
  const deficits: Partial<Record<NutrientKey, number>> = {};
  for (const [key, target] of Object.entries(reference)) {
    if (!target || target <= 0) continue;
    const actual = averagePerDay[key as NutrientKey] ?? 0;
    const shortage = (target - actual) / target;
    if (shortage > 0) deficits[key as NutrientKey] = Math.min(1, shortage);
  }
  return deficits;
}

/**
 * 不足の判定に使う1日あたりの目安量。
 * 日本人の食事摂取基準（2020年版）の推奨量・目安量を参考にした代表値で、
 * 厳密な個人別の値ではなく「足りているかの目安」として使う。
 */
export const DAILY_REFERENCE: Partial<Record<NutrientKey, number>> = {
  fiber_g: 21,
  calcium_mg: 700,
  iron_mg: 7.5,
  magnesium_mg: 340,
  potassium_mg: 2500,
  zinc_mg: 10,
  vit_a_ug: 850,
  vit_d_ug: 8.5,
  vit_b1_mg: 1.4,
  vit_b2_mg: 1.6,
  vit_c_mg: 100,
  folate_ug: 240,
};
