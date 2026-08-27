/**
 * 食品・料理・よく食べる食事を、食事記録の1行（MealItemInput）に変換する。
 * 栄養価はこの時点の値を確定させ、記録側に保存する。
 */
import { getDish, dishNutrition } from '@/db/repo/dishes';
import { getFood, listFoodUnits, type Food, type FoodUnit } from '@/db/repo/foods';
import type { Dish } from '@/db/repo/dishes';
import type { FavoriteItem } from '@/db/repo/favorites';
import type { MealItemInput } from '@/db/repo/meals';
import { nutrientsForFood } from '@/lib/nutrition';
import { formatQuantity, toGrams } from '@/lib/units';

/**
 * 食品を記録用の1行に変換する。
 * quantity は単位が指定されていればその個数、なければグラム数として扱う。
 */
export function foodToMealItem(food: Food, quantity: number, unit: FoodUnit | null): MealItemInput {
  const grams = unit ? toGrams(quantity, unit) : quantity;
  return {
    refType: 'food',
    refId: food.id,
    name: food.name,
    quantity,
    unitLabel: unit ? formatQuantity(quantity, unit.name) : null,
    grams,
    nutrients: nutrientsForFood({ id: food.id, name: food.name, per100g: food.per100g }, grams),
  };
}

/** 料理を記録用の1行に変換する */
export function dishToMealItem(dish: Dish, servings: number): MealItemInput {
  const { grams, nutrients } = dishNutrition(dish, servings);
  return {
    refType: 'dish',
    refId: dish.id,
    name: dish.name,
    quantity: servings,
    unitLabel: formatQuantity(servings, '人前'),
    grams,
    nutrients,
  };
}

/**
 * よく食べる食事のテンプレートから記録用の行を作る。
 * 参照先が削除されていた項目は静かに読み飛ばす。
 */
export async function favoriteToMealItems(
  items: FavoriteItem[],
): Promise<{ items: MealItemInput[]; skipped: number }> {
  const result: MealItemInput[] = [];
  let skipped = 0;

  for (const item of items) {
    if (item.refType === 'food') {
      const food = await getFood(item.refId);
      if (!food) {
        skipped++;
        continue;
      }
      // テンプレートは「1パック」のような表示ラベルしか持たないため、
      // 単位名から現在のグラム換算を引き直す（単位の定義を直したら次回から反映される）
      let unit: FoodUnit | null = null;
      if (item.unitLabel) {
        const unitName = item.unitLabel.replace(/^[\d.]+/, '');
        const units = await listFoodUnits(food.id);
        unit = units.find((candidate) => candidate.name === unitName) ?? null;
        if (!unit) {
          // 単位が見つからないまま quantity をグラムとして扱うと
          // 「卵1個」が1gになるなど栄養価が大きく狂うため、この項目は取り込まない
          skipped++;
          continue;
        }
      }
      result.push(foodToMealItem(food, item.quantity, unit));
    } else {
      const dish = await getDish(item.refId);
      if (!dish) {
        skipped++;
        continue;
      }
      result.push(dishToMealItem(dish, item.quantity));
    }
  }

  return { items: result, skipped };
}
