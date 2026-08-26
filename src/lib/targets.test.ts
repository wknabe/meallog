import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { calcBmi, calcBmr, calcMacros, calcTargets, paceToTargetDate } from './targets.ts';

describe('calcBmr（Ganpule式）', () => {
  it('男性30歳170cm65kgで約1,500kcalになる', () => {
    const bmr = calcBmr({ gender: 'male', ageYears: 30, heightCm: 170, weightKg: 65 });
    assert.ok(bmr > 1450 && bmr < 1550, `想定範囲外: ${bmr}`);
  });

  it('同条件なら女性のほうが低くなる', () => {
    const male = calcBmr({ gender: 'male', ageYears: 30, heightCm: 165, weightKg: 60 });
    const female = calcBmr({ gender: 'female', ageYears: 30, heightCm: 165, weightKg: 60 });
    assert.ok(female < male);
  });

  it('年齢が上がると下がる', () => {
    const young = calcBmr({ gender: 'male', ageYears: 25, heightCm: 170, weightKg: 65 });
    const old = calcBmr({ gender: 'male', ageYears: 60, heightCm: 170, weightKg: 65 });
    assert.ok(old < young);
  });
});

describe('calcMacros', () => {
  it('タンパク質は体重×2g、脂質は総カロリーの25%', () => {
    const macros = calcMacros(2000, 70);
    assert.equal(macros.proteinG, 140);
    assert.equal(macros.fatG, Math.round((2000 * 0.25) / 9));
  });

  it('PFCの合計カロリーが目標カロリーとほぼ一致する', () => {
    const macros = calcMacros(2000, 70);
    const total = macros.proteinG * 4 + macros.fatG * 9 + macros.carbG * 4;
    assert.ok(Math.abs(total - 2000) < 15, `誤差が大きい: ${total}`);
  });

  it('目標カロリーが低くても炭水化物がマイナスにならない', () => {
    const macros = calcMacros(1200, 90);
    assert.ok(macros.carbG >= 0, `炭水化物が負: ${macros.carbG}`);
    assert.ok(macros.proteinG > 0);
  });
});

describe('calcTargets', () => {
  const base = {
    gender: 'male' as const,
    birthDate: '1994-01-01',
    heightCm: 175,
    weightKg: 82.5,
    activityLevel: 3 as const,
    today: '2026-05-28',
  };

  it('目標体重が未設定なら体重維持（推定消費）を目標にする', () => {
    const result = calcTargets(base);
    assert.equal(result.dailyDeficit, 0);
    assert.equal(result.kcal, Math.round(result.tdee));
  });

  it('目標体重と期日から1日の赤字を逆算する', () => {
    // 5kg減を100日で → 5 × 7200 ÷ 100 = 360kcal/日
    const result = calcTargets({ ...base, targetWeightKg: 77.5, targetDate: '2026-09-05' });
    assert.ok(Math.abs(result.dailyDeficit - 360) < 1, `赤字が想定外: ${result.dailyDeficit}`);
  });

  it('週1kgを超えるペースには警告を出す', () => {
    // 10kg減を30日 → 週2.3kg
    const result = calcTargets({ ...base, targetWeightKg: 72.5, targetDate: '2026-06-27' });
    assert.ok(result.warnings.some((w) => w.kind === 'pace_too_fast'));
  });

  it('基礎代謝を下回る目標は基礎代謝まで引き上げ、警告を出す', () => {
    const result = calcTargets({ ...base, targetWeightKg: 60, targetDate: '2026-07-28' });
    assert.ok(result.warnings.some((w) => w.kind === 'below_bmr'));
    assert.equal(result.kcal, Math.round(result.bmr));
  });

  it('達成希望日が過去なら警告を出し、体重維持で計算する', () => {
    const result = calcTargets({ ...base, targetWeightKg: 77.5, targetDate: '2026-01-01' });
    assert.ok(result.warnings.some((w) => w.kind === 'target_in_past'));
    assert.equal(result.dailyDeficit, 0);
  });

  it('身体活動レベルが高いほど目標カロリーも高くなる', () => {
    const low = calcTargets({ ...base, activityLevel: 1 });
    const high = calcTargets({ ...base, activityLevel: 5 });
    assert.ok(high.kcal > low.kcal);
  });
});

describe('paceToTargetDate', () => {
  it('月2kgのペースで5kg減なら約75日後になる', () => {
    const target = paceToTargetDate(82.5, 77.5, 2, '2026-05-28');
    assert.equal(target, '2026-08-11');
  });

  it('体重差がなくても未来の日付を返す', () => {
    const target = paceToTargetDate(70, 70, 2, '2026-05-28');
    assert.ok(target > '2026-05-28');
  });
});

describe('calcBmi', () => {
  it('82.5kg / 183cmで約24.6になる', () => {
    assert.equal(calcBmi(82.5, 183).toFixed(1), '24.6');
  });
});
