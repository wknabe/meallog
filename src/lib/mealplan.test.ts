import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { emptyNutrients, type Nutrients } from '../db/nutrients.ts';
import {
  calcDeficits,
  fitCalories,
  generateDayPlan,
  scoreDish,
  sumPlan,
  type PlanContext,
  type PlanDish,
} from './mealplan.ts';
import type { DishCategory } from './types.ts';

function dish(
  id: number,
  name: string,
  category: DishCategory,
  values: Partial<Nutrients>,
  extra: Partial<PlanDish> = {}
): PlanDish {
  return {
    id,
    name,
    category,
    cuisine: null,
    effort: null,
    volume: null,
    tastes: [],
    perServing: Object.assign(emptyNutrients(), values),
    ingredientFoodIds: [],
    ...extra,
  };
}

/** 各枠に十分な候補がある状態を作る */
function buildCandidates(): PlanDish[] {
  const list: PlanDish[] = [];
  for (let i = 0; i < 6; i++) {
    list.push(
      dish(100 + i, `主食${i}`, 'staple', { kcal: 230 + i * 20, protein_g: 4, fat_g: 1, carb_g: 50 })
    );
    list.push(
      dish(200 + i, `主菜${i}`, 'main', { kcal: 260 + i * 30, protein_g: 22, fat_g: 15, carb_g: 8 })
    );
    list.push(
      dish(300 + i, `副菜${i}`, 'side', { kcal: 90 + i * 10, protein_g: 4, fat_g: 5, carb_g: 8 })
    );
    list.push(
      dish(400 + i, `汁物${i}`, 'soup', { kcal: 70 + i * 5, protein_g: 5, fat_g: 3, carb_g: 6 })
    );
  }
  return list;
}

function context(patch: Partial<PlanContext> = {}): PlanContext {
  return {
    target: { kcal: 2000, proteinG: 140, fatG: 60, carbG: 250 },
    mood: {},
    deficits: {},
    pantryFoodIds: new Set(),
    expiringFoodIds: new Set(),
    recentDishIds: new Set(),
    ...patch,
  };
}

describe('scoreDish', () => {
  const budget = 300;

  it('割り当てに近いほど良い点になる', () => {
    const near = dish(1, '近い', 'main', { kcal: 310 });
    const far = dish(2, '遠い', 'main', { kcal: 900 });
    assert.ok(scoreDish(near, context(), budget) < scoreDish(far, context(), budget));
  });

  it('同じ幅なら超過のほうが悪い点になる', () => {
    const over = dish(1, '超過', 'main', { kcal: 450 });
    const under = dish(2, '不足', 'main', { kcal: 150 });
    assert.ok(scoreDish(over, context(), budget) > scoreDish(under, context(), budget));
  });

  it('不足している栄養素を含むと点が良くなる', () => {
    const withFiber = dish(1, '食物繊維あり', 'side', { kcal: 300, fiber_g: 5 });
    const withoutFiber = dish(2, 'なし', 'side', { kcal: 300 });
    const ctx = context({ deficits: { fiber_g: 0.8 } });
    assert.ok(scoreDish(withFiber, ctx, budget) < scoreDish(withoutFiber, ctx, budget));
  });

  it('冷蔵庫にある材料を使うと点が良くなる', () => {
    const usesPantry = dish(1, '在庫あり', 'main', { kcal: 300 }, { ingredientFoodIds: [10, 11] });
    const plain = dish(2, '在庫なし', 'main', { kcal: 300 }, { ingredientFoodIds: [99] });
    const ctx = context({ pantryFoodIds: new Set([10, 11]) });
    assert.ok(scoreDish(usesPantry, ctx, budget) < scoreDish(plain, ctx, budget));
  });

  it('賞味期限が近い材料はさらに優先される', () => {
    const expiring = dish(1, '期限近い', 'main', { kcal: 300 }, { ingredientFoodIds: [10] });
    const pantryOnly = dish(2, '在庫のみ', 'main', { kcal: 300 }, { ingredientFoodIds: [11] });
    const ctx = context({
      pantryFoodIds: new Set([10, 11]),
      expiringFoodIds: new Set([10]),
    });
    assert.ok(scoreDish(expiring, ctx, budget) < scoreDish(pantryOnly, ctx, budget));
  });

  it('直近に食べた料理は減点される', () => {
    const recent = dish(1, '昨日食べた', 'main', { kcal: 300 });
    const fresh = dish(2, '久しぶり', 'main', { kcal: 300 });
    const ctx = context({ recentDishIds: new Set([1]) });
    assert.ok(scoreDish(recent, ctx, budget) > scoreDish(fresh, ctx, budget));
  });

  it('気分に合わない料理は大きく減点される', () => {
    const japanese = dish(1, '和食', 'main', { kcal: 300 }, { cuisine: 'japanese' });
    const chinese = dish(2, '中華', 'main', { kcal: 300 }, { cuisine: 'chinese' });
    const ctx = context({ mood: { cuisine: 'japanese' } });
    assert.ok(scoreDish(japanese, ctx, budget) < scoreDish(chinese, ctx, budget));
  });
});

describe('generateDayPlan', () => {
  it('朝・昼・夕の3食を組む', () => {
    const plan = generateDayPlan(buildCandidates(), context());
    assert.equal(plan.meals.length, 3);
    assert.deepEqual(
      plan.meals.map((meal) => meal.slot),
      ['breakfast', 'lunch', 'dinner']
    );
  });

  it('各食に主食と主菜が入る', () => {
    const plan = generateDayPlan(buildCandidates(), context());
    for (const meal of plan.meals) {
      const categories = meal.entries.map((entry) => entry.dish.category);
      assert.ok(categories.includes('staple'), `${meal.slot}に主食がない`);
      assert.ok(categories.includes('main'), `${meal.slot}に主菜がない`);
    }
  });

  it('同じ料理が1日に2回出ない', () => {
    const plan = generateDayPlan(buildCandidates(), context());
    const ids = plan.meals.flatMap((meal) => meal.entries.map((entry) => entry.dish.id));
    assert.equal(new Set(ids).size, ids.length);
  });

  it('合計カロリーが目標に近づく', () => {
    const plan = generateDayPlan(buildCandidates(), context());
    const error = Math.abs(plan.totals.kcal - 2000) / 2000;
    assert.ok(error < 0.15, `誤差が大きい: ${Math.round(plan.totals.kcal)}kcal`);
  });

  it('variant を変えると別の組み合わせになる', () => {
    const first = generateDayPlan(buildCandidates(), context());
    const second = generateDayPlan(buildCandidates(), context({ variant: 1 }));
    const firstIds = first.meals.flatMap((meal) => meal.entries.map((entry) => entry.dish.id));
    const secondIds = second.meals.flatMap((meal) => meal.entries.map((entry) => entry.dish.id));
    assert.notDeepEqual(firstIds, secondIds);
  });

  it('候補が少なくても組める範囲で返す', () => {
    const few = [
      dish(1, '主食', 'staple', { kcal: 250, carb_g: 55 }),
      dish(2, '主菜', 'main', { kcal: 300, protein_g: 25 }),
    ];
    const plan = generateDayPlan(few, context());
    assert.ok(plan.meals.length === 3);
    // 使い回さないので、2品しか無ければ1食ぶんしか埋まらない
    const total = plan.meals.reduce((sum, meal) => sum + meal.entries.length, 0);
    assert.equal(total, 2);
  });

  it('候補が空でも落ちない', () => {
    const plan = generateDayPlan([], context());
    assert.equal(plan.totals.kcal, 0);
  });

  it('気分に合う候補が足りないときは条件から外れた旨を伝える', () => {
    const candidates = buildCandidates();
    const plan = generateDayPlan(candidates, context({ mood: { cuisine: 'ethnic' } }));
    assert.ok(plan.reasons.some((reason) => reason.includes('条件から外れ')));
  });

  it('不足している栄養素があると理由に出る', () => {
    const plan = generateDayPlan(buildCandidates(), context({ deficits: { fiber_g: 0.5 } }));
    assert.ok(plan.reasons.some((reason) => reason.includes('食物繊維')));
  });
});

describe('fitCalories', () => {
  it('主食の量で目標に寄せる', () => {
    const meals = [
      {
        slot: 'breakfast' as const,
        entries: [
          { dish: dish(1, '主食', 'staple', { kcal: 200 }), servings: 1 },
          { dish: dish(2, '主菜', 'main', { kcal: 300 }), servings: 1 },
        ],
      },
    ];
    // 目標700 → 主菜300は固定、主食は400ぶん必要 → 2倍
    const fitted = fitCalories(meals, 700);
    assert.equal(fitted[0].entries[0].servings, 2);
    assert.equal(fitted[0].entries[1].servings, 1);
  });

  it('増やせる量には上限がある', () => {
    const meals = [
      {
        slot: 'breakfast' as const,
        entries: [{ dish: dish(1, '主食', 'staple', { kcal: 200 }), servings: 1 }],
      },
    ];
    const fitted = fitCalories(meals, 3000);
    assert.equal(fitted[0].entries[0].servings, 2);
  });

  it('減らせる量にも下限がある', () => {
    const meals = [
      {
        slot: 'breakfast' as const,
        entries: [{ dish: dish(1, '主食', 'staple', { kcal: 500 }), servings: 1 }],
      },
    ];
    const fitted = fitCalories(meals, 50);
    assert.equal(fitted[0].entries[0].servings, 0.5);
  });

  it('主食がなければ何も変えない', () => {
    const meals = [
      {
        slot: 'breakfast' as const,
        entries: [{ dish: dish(2, '主菜', 'main', { kcal: 300 }), servings: 1 }],
      },
    ];
    assert.deepEqual(fitCalories(meals, 700), meals);
  });
});

describe('sumPlan', () => {
  it('人数分を掛けて合計する', () => {
    const meals = [
      {
        slot: 'lunch' as const,
        entries: [
          { dish: dish(1, '主食', 'staple', { kcal: 200, protein_g: 4 }), servings: 1.5 },
          { dish: dish(2, '主菜', 'main', { kcal: 300, protein_g: 25 }), servings: 1 },
        ],
      },
    ];
    const totals = sumPlan(meals);
    assert.equal(totals.kcal, 600);
    assert.equal(totals.proteinG, 31);
  });
});

describe('calcDeficits', () => {
  it('目安に足りない栄養素だけを返す', () => {
    const deficits = calcDeficits(
      { fiber_g: 10, calcium_mg: 900 },
      { fiber_g: 20, calcium_mg: 700 }
    );
    assert.equal(deficits.fiber_g, 0.5);
    assert.equal(deficits.calcium_mg, undefined);
  });

  it('まったく摂れていなければ1になる', () => {
    const deficits = calcDeficits({}, { iron_mg: 7.5 });
    assert.equal(deficits.iron_mg, 1);
  });

  it('目安が0の項目は無視する', () => {
    const deficits = calcDeficits({}, { iron_mg: 0 });
    assert.equal(Object.keys(deficits).length, 0);
  });
});
