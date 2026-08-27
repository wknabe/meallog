/**
 * 食品・料理から栄養価を求める。
 *
 * 料理は栄養値を持たず、材料の積み上げで毎回計算する。
 * ただし食事として記録するときは、その時点の値を記録側に保存する
 * （あとでレシピを直しても過去の記録が変わらないようにするため）。
 */
import {
  addNutrients,
  emptyNutrients,
  multiplyNutrients,
  scaleNutrients,
  type Nutrients,
} from '../db/nutrients.ts';

/** 栄養計算に必要な食品の情報 */
export type FoodLike = {
  id: number;
  name: string;
  /** 100gあたりの栄養価 */
  per100g: Nutrients;
};

/** 栄養計算に必要な料理の情報 */
export type DishLike = {
  id: number;
  name: string;
  /** 材料構成が何人前ぶんか */
  servings: number;
  ingredients: { food: FoodLike; grams: number }[];
};

/** 食品を指定グラム数ぶん食べたときの栄養価 */
export function nutrientsForFood(food: FoodLike, grams: number): Nutrients {
  return scaleNutrients(food.per100g, grams);
}

export type DishNutrition = {
  /** 指定した人数分の総重量（g） */
  grams: number;
  nutrients: Nutrients;
};

/**
 * 料理を指定人数分食べたときの栄養価と重量。
 * 材料構成が2人前で1人前を食べるなら、材料をすべて半分にして計算する。
 */
export function nutrientsForDish(dish: DishLike, servings = 1): DishNutrition {
  const baseServings = dish.servings > 0 ? dish.servings : 1;
  const ratio = servings / baseServings;

  let totalGrams = 0;
  const parts: Nutrients[] = [];
  for (const ingredient of dish.ingredients) {
    totalGrams += ingredient.grams;
    parts.push(scaleNutrients(ingredient.food.per100g, ingredient.grams));
  }

  return {
    grams: totalGrams * ratio,
    nutrients: multiplyNutrients(addNutrients(...parts), ratio),
  };
}

/** 料理1人前あたりの栄養価。献立の候補を比べるときに使う */
export function nutrientsPerServing(dish: DishLike): Nutrients {
  return nutrientsForDish(dish, 1).nutrients;
}

/** 複数の栄養価を合計する */
export function sumNutrients(list: Nutrients[]): Nutrients {
  if (list.length === 0) return emptyNutrients();
  return addNutrients(...list);
}

/**
 * 目標に対する残量を求める。
 * 目標を超えている項目は0ではなくマイナスのまま返し、
 * 「どれだけ超えたか」を画面で出せるようにしている。
 */
export type MacroRemaining = {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
};

export function remainingMacros(
  target: { kcal: number; proteinG: number; fatG: number; carbG: number },
  consumed: Nutrients,
): MacroRemaining {
  return {
    kcal: target.kcal - consumed.kcal,
    proteinG: target.proteinG - consumed.protein_g,
    fatG: target.fatG - consumed.fat_g,
    carbG: target.carbG - consumed.carb_g,
  };
}

/**
 * PFCから計算されるカロリー。
 * タンパク質4kcal/g、脂質9kcal/g、炭水化物4kcal/g（アトウォーター係数）。
 * 成分表の値と完全には一致しないため、あくまで目安として使う。
 */
export function kcalFromMacros(proteinG: number, fatG: number, carbG: number): number {
  return proteinG * 4 + fatG * 9 + carbG * 4;
}
