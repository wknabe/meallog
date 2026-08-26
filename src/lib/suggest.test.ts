import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { emptyNutrients, type Nutrients } from '../db/nutrients.ts';
import {
  buildCombo,
  distanceFromRemaining,
  isRemainingTooSmall,
  rankByRemaining,
  type ComboFood,
} from './suggest.ts';

function nutrients(values: Partial<Nutrients>): Nutrients {
  return Object.assign(emptyNutrients(), values);
}

function food(id: number, name: string, values: Partial<Nutrients>): ComboFood {
  return { id, name, per100g: nutrients(values) };
}

// 実際の成分表の値
const chicken = food(1, '鶏むね肉', { kcal: 105, protein_g: 23.3, fat_g: 1.9, carb_g: 0.1 });
const rice = food(2, 'ごはん', { kcal: 156, protein_g: 2.5, fat_g: 0.3, carb_g: 37.1 });
const broccoli = food(3, 'ブロッコリー', { kcal: 37, protein_g: 5.4, fat_g: 0.6, carb_g: 6.6 });

const remaining = { kcal: 650, proteinG: 60, fatG: 15, carbG: 90 };

describe('distanceFromRemaining', () => {
  it('残りとぴったり一致すれば0になる', () => {
    const exact = nutrients({ kcal: 650, protein_g: 60, fat_g: 15, carb_g: 90 });
    assert.equal(distanceFromRemaining(exact, remaining), 0);
  });

  it('近いほうが小さい点数になる', () => {
    const near = nutrients({ kcal: 600, protein_g: 55, fat_g: 14, carb_g: 85 });
    const far = nutrients({ kcal: 1500, protein_g: 20, fat_g: 80, carb_g: 200 });
    assert.ok(distanceFromRemaining(near, remaining) < distanceFromRemaining(far, remaining));
  });

  it('同じ幅なら超過のほうが不足より悪い点になる', () => {
    const over = nutrients({ kcal: 850, protein_g: 60, fat_g: 15, carb_g: 90 });
    const under = nutrients({ kcal: 450, protein_g: 60, fat_g: 15, carb_g: 90 });
    assert.ok(distanceFromRemaining(over, remaining) > distanceFromRemaining(under, remaining));
  });

  it('残りが0の栄養素に足すと点数が悪くなる', () => {
    const noFatLeft = { kcal: 300, proteinG: 30, fatG: 0, carbG: 40 };
    const withFat = nutrients({ kcal: 300, protein_g: 30, fat_g: 20, carb_g: 40 });
    const withoutFat = nutrients({ kcal: 300, protein_g: 30, fat_g: 0, carb_g: 40 });
    assert.ok(
      distanceFromRemaining(withFat, noFatLeft) > distanceFromRemaining(withoutFat, noFatLeft)
    );
  });
});

describe('rankByRemaining', () => {
  it('残りに近い順に並ぶ', () => {
    const candidates = [
      { item: 'から揚げ', nutrients: nutrients({ kcal: 1200, protein_g: 40, fat_g: 70, carb_g: 60 }) },
      { item: '鶏むねとごはん', nutrients: nutrients({ kcal: 640, protein_g: 58, fat_g: 14, carb_g: 88 }) },
      { item: 'サラダ', nutrients: nutrients({ kcal: 80, protein_g: 3, fat_g: 5, carb_g: 6 }) },
    ];
    const ranked = rankByRemaining(candidates, remaining, 3);
    assert.equal(ranked[0].item, '鶏むねとごはん');
  });

  it('件数の上限を守る', () => {
    const candidates = Array.from({ length: 20 }, (_, index) => ({
      item: index,
      nutrients: nutrients({ kcal: 100 * index }),
    }));
    assert.equal(rankByRemaining(candidates, remaining, 5).length, 5);
  });

  it('候補がなければ空を返す', () => {
    assert.deepEqual(rankByRemaining([], remaining), []);
  });
});

describe('buildCombo', () => {
  it('残りのPFCに近いグラム数を組む', () => {
    const combo = buildCombo(remaining, {
      protein: chicken,
      staple: rice,
      vegetable: broccoli,
    });

    // 炭水化物とタンパク質が残りに近い値になる
    assert.ok(Math.abs(combo.totals.carbG - remaining.carbG) < 15, `C=${combo.totals.carbG}`);
    assert.ok(Math.abs(combo.totals.proteinG - remaining.proteinG) < 15, `P=${combo.totals.proteinG}`);
    assert.equal(combo.items.length, 3);
  });

  it('グラム数は5g単位に丸める', () => {
    const combo = buildCombo(remaining, { protein: chicken, staple: rice, vegetable: broccoli });
    for (const item of combo.items) {
      assert.equal(item.grams % 5, 0, `${item.food.name} が ${item.grams}g`);
    }
  });

  it('主食がなくてもタンパク源だけで組める', () => {
    const combo = buildCombo(remaining, { protein: chicken });
    assert.equal(combo.items.length, 1);
    assert.ok(combo.totals.proteinG > 0);
  });

  it('極端な量にならないよう上限で止める', () => {
    // 残りが非常に多くても、鶏むね1kgのような提案はしない
    const huge = { kcal: 5000, proteinG: 400, fatG: 100, carbG: 600 };
    const combo = buildCombo(huge, { protein: chicken, staple: rice });
    const chickenItem = combo.items.find((item) => item.food.id === chicken.id);
    const riceItem = combo.items.find((item) => item.food.id === rice.id);
    assert.ok(chickenItem != null && chickenItem.grams <= 300);
    assert.ok(riceItem != null && riceItem.grams <= 400);
  });

  it('残りが少なくても最低限の量を提案する', () => {
    const small = { kcal: 120, proteinG: 10, fatG: 3, carbG: 10 };
    const combo = buildCombo(small, { protein: chicken });
    assert.ok(combo.items[0].grams >= 30);
  });

  it('炭水化物を含まない主食を渡しても0除算にならない', () => {
    const zeroCarb = food(9, '謎の主食', { kcal: 100, protein_g: 0, fat_g: 10, carb_g: 0 });
    const combo = buildCombo(remaining, { protein: chicken, staple: zeroCarb });
    assert.ok(Number.isFinite(combo.totals.kcal));
  });

  it('タンパク質を含まない食品を渡しても0除算にならない', () => {
    const zeroProtein = food(10, '油', { kcal: 886, protein_g: 0, fat_g: 100, carb_g: 0 });
    const combo = buildCombo(remaining, { protein: zeroProtein });
    assert.ok(Number.isFinite(combo.totals.kcal));
    assert.equal(combo.items[0].grams, 30);
  });
});

describe('isRemainingTooSmall', () => {
  it('100kcalを切ったら提案しない', () => {
    assert.equal(isRemainingTooSmall({ kcal: 80, proteinG: 5, fatG: 2, carbG: 10 }), true);
  });

  it('十分残っていれば提案する', () => {
    assert.equal(isRemainingTooSmall(remaining), false);
  });
});
