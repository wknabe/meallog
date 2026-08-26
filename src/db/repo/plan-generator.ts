/**
 * 献立生成をDBとつなぐ層。
 * 候補の料理・直近の栄養履歴・冷蔵庫の在庫を集めて、生成エンジンに渡す。
 */
import { dishNutrition, listDishes } from '@/db/repo/dishes';
import { countRecordedDays, recentDishIds, sumNutrientsInRange } from '@/db/repo/meals';
import { expiringFoodIds, pantryFoodIds } from '@/db/repo/pantry';
import { addDays, type DayKey } from '@/lib/day';
import {
  calcDeficits,
  DAILY_REFERENCE,
  generateDayPlan,
  type DayPlan,
  type PlanDish,
  type PlanTarget,
} from '@/lib/mealplan';
import type { MoodFilter } from '@/lib/types';

/** 不足栄養素と重複回避で見る日数 */
const HISTORY_DAYS = 7;
/** 賞味期限が何日先までを「近い」とみなすか */
const EXPIRY_WINDOW_DAYS = 3;

export type GenerateOptions = {
  date: DayKey;
  target: PlanTarget;
  mood: MoodFilter;
  variant?: number;
  /** 冷蔵庫にある食材を優先するか */
  usePantry?: boolean;
};

export async function generatePlan(options: GenerateOptions): Promise<DayPlan> {
  const historyFrom = addDays(options.date, -HISTORY_DAYS);
  const historyTo = addDays(options.date, -1);

  const [dishes, nutrientSum, recordedDays, recentIds, pantryIds, expiringIds] = await Promise.all([
    listDishes({ limit: 500 }),
    sumNutrientsInRange(historyFrom, historyTo),
    countRecordedDays(historyFrom, historyTo),
    recentDishIds(addDays(options.date, -3), historyTo),
    options.usePantry === false ? Promise.resolve(new Set<number>()) : pantryFoodIds(),
    options.usePantry === false
      ? Promise.resolve(new Set<number>())
      : expiringFoodIds(addDays(options.date, EXPIRY_WINDOW_DAYS)),
  ]);

  // 記録がある日数で割って1日あたりに直す。記録がなければ不足判定はしない
  const averagePerDay: Record<string, number> = {};
  if (recordedDays > 0) {
    for (const [key, value] of Object.entries(nutrientSum)) {
      averagePerDay[key] = value / recordedDays;
    }
  }

  const candidates: PlanDish[] = dishes.map((dish) => ({
    id: dish.id,
    name: dish.name,
    category: dish.category,
    cuisine: dish.cuisine,
    effort: dish.effort,
    volume: dish.volume,
    tastes: dish.tastes,
    perServing: dishNutrition(dish, 1).nutrients,
    ingredientFoodIds: dish.ingredients.map((ingredient) => ingredient.foodId),
  }));

  return generateDayPlan(candidates, {
    target: options.target,
    mood: options.mood,
    deficits: recordedDays > 0 ? calcDeficits(averagePerDay, DAILY_REFERENCE) : {},
    pantryFoodIds: pantryIds,
    expiringFoodIds: expiringIds,
    recentDishIds: new Set(recentIds),
    variant: options.variant,
  });
}
