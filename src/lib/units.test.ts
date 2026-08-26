import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatGrams, toGrams, toPurchaseAmount, withRefuse, type Unit } from './units.ts';

const unit = (name: string, grams: number, isPurchaseUnit = false): Unit => ({
  name,
  grams,
  isPurchaseUnit,
});

describe('toGrams', () => {
  it('単位が指定されていればグラムに換算する', () => {
    assert.equal(toGrams(2, unit('個', 50)), 100);
  });

  it('単位がなければ入力値をそのままグラムとして扱う', () => {
    assert.equal(toGrams(150, null), 150);
  });
});

describe('formatGrams', () => {
  it('1,000g未満はg表記', () => {
    assert.equal(formatGrams(480), '480g');
  });

  it('1,000g以上はkg表記にする', () => {
    assert.equal(formatGrams(1200), '1.2kg');
  });

  it('kg表記で末尾の0を残さない', () => {
    assert.equal(formatGrams(2000), '2kg');
  });

  it('端数は四捨五入する', () => {
    assert.equal(formatGrams(99.6), '100g');
  });
});

describe('toPurchaseAmount', () => {
  const cabbage = [unit('枚', 50), unit('玉', 1200, true)];

  it('必要量を満たす最小の個数へ切り上げる', () => {
    const result = toPurchaseAmount(480, cabbage);
    assert.equal(result.quantity, 1);
    assert.equal(result.unitName, '玉');
    assert.equal(result.label, '1玉（必要 480g）');
  });

  it('1単位を超えたら次の個数へ切り上げる', () => {
    const result = toPurchaseAmount(1300, cabbage);
    assert.equal(result.quantity, 2);
    assert.equal(result.label, '2玉（必要 1.3kg）');
  });

  it('ちょうど1単位ぶんなら切り上げない', () => {
    assert.equal(toPurchaseAmount(1200, cabbage).quantity, 1);
  });

  it('ごく少量でも最低1単位は買う必要がある', () => {
    assert.equal(toPurchaseAmount(10, cabbage).quantity, 1);
  });

  it('購入単位がなければグラム表記のまま返す', () => {
    const result = toPurchaseAmount(1200, [unit('枚', 100)]);
    assert.equal(result.unitName, null);
    assert.equal(result.label, '1.2kg');
  });

  it('1g単位で買えるもの（精肉など）は切り上げない', () => {
    const result = toPurchaseAmount(1234, [unit('g', 1, true)]);
    assert.equal(result.unitName, null);
    assert.equal(result.label, '1.23kg');
  });
});

describe('withRefuse', () => {
  it('廃棄率のぶんだけ購入量を増やす', () => {
    // 可食部100g・廃棄率10% → 約111g買う必要がある
    assert.equal(Math.round(withRefuse(100, 10)), 111);
  });

  it('廃棄率0ならそのまま', () => {
    assert.equal(withRefuse(100, 0), 100);
  });
});
