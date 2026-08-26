import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { emptyNutrients, type Nutrients } from '../db/nutrients.ts';
import {
  kcalFromMacros,
  nutrientsForDish,
  nutrientsForFood,
  remainingMacros,
  type DishLike,
  type FoodLike,
} from './nutrition.ts';

/** 100gあたりの値を指定して食品を作る */
function food(name: string, values: Partial<Nutrients>): FoodLike {
  const per100g = emptyNutrients();
  Object.assign(per100g, values);
  return { id: 1, name, per100g };
}

// 実際の成分表の値（鶏むね肉 皮なし 生 / 精白米めし）
const chicken = food('鶏むね肉', { kcal: 105, protein_g: 23.3, fat_g: 1.9, carb_g: 0.1 });
const rice = food('ごはん', { kcal: 156, protein_g: 2.5, fat_g: 0.3, carb_g: 37.1 });

describe('nutrientsForFood', () => {
  it('150gなら100gあたりの1.5倍になる', () => {
    const result = nutrientsForFood(chicken, 150);
    assert.equal(Math.round(result.kcal), 158);
    assert.equal(Number(result.protein_g.toFixed(2)), 34.95);
  });

  it('0gなら全てゼロ', () => {
    assert.equal(nutrientsForFood(chicken, 0).kcal, 0);
  });
});

describe('nutrientsForDish', () => {
  const dish: DishLike = {
    id: 1,
    name: '鶏むねごはん',
    servings: 2,
    ingredients: [
      { food: chicken, grams: 300 },
      { food: rice, grams: 400 },
    ],
  };

  it('材料構成2人前の料理を1人前ぶん計算する', () => {
    const result = nutrientsForDish(dish, 1);
    // 鶏むね150g(157.5kcal) + ごはん200g(312kcal) = 469.5kcal
    assert.equal(Math.round(result.nutrients.kcal), 470);
    assert.equal(result.grams, 350);
  });

  it('2人前ぶんなら材料そのままの値になる', () => {
    const result = nutrientsForDish(dish, 2);
    assert.equal(Math.round(result.nutrients.kcal), 939);
    assert.equal(result.grams, 700);
  });

  it('servingsが0でも1人前として扱い、0除算にならない', () => {
    const broken: DishLike = { ...dish, servings: 0 };
    const result = nutrientsForDish(broken, 1);
    assert.ok(Number.isFinite(result.nutrients.kcal));
    assert.equal(Math.round(result.nutrients.kcal), 939);
  });

  it('材料がなければゼロになる', () => {
    const empty: DishLike = { id: 2, name: '空', servings: 1, ingredients: [] };
    assert.equal(nutrientsForDish(empty, 1).nutrients.kcal, 0);
    assert.equal(nutrientsForDish(empty, 1).grams, 0);
  });
});

describe('remainingMacros', () => {
  it('目標から摂取分を引いた残りを返す', () => {
    const consumed = emptyNutrients();
    Object.assign(consumed, { kcal: 1350, protein_g: 80, fat_g: 45, carb_g: 160 });
    const result = remainingMacros(
      { kcal: 2000, proteinG: 140, fatG: 60, carbG: 250 },
      consumed
    );
    assert.deepEqual(result, { kcal: 650, proteinG: 60, fatG: 15, carbG: 90 });
  });

  it('超過分はマイナスのまま返す', () => {
    const consumed = emptyNutrients();
    Object.assign(consumed, { kcal: 2300, protein_g: 150, fat_g: 80, carb_g: 260 });
    const result = remainingMacros(
      { kcal: 2000, proteinG: 140, fatG: 60, carbG: 250 },
      consumed
    );
    assert.equal(result.kcal, -300);
    assert.equal(result.fatG, -20);
  });
});

describe('kcalFromMacros', () => {
  it('アトウォーター係数で計算する', () => {
    assert.equal(kcalFromMacros(140, 60, 250), 140 * 4 + 60 * 9 + 250 * 4);
  });
});
