import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  estimateExerciseKcal,
  estimateStepsKcal,
  exerciseBonus,
  intensityLabel,
  stepsToKm,
  strideMeters,
} from './energy.ts';

describe('strideMeters', () => {
  it('身長170cmなら約76cm', () => {
    assert.ok(Math.abs(strideMeters(170) - 0.765) < 0.001);
  });
});

describe('stepsToKm', () => {
  it('身長170cmで1万歩なら約7.7km', () => {
    const km = stepsToKm(10_000, 170);
    assert.ok(km > 7.5 && km < 7.8, `${km}km`);
  });

  it('0歩なら0km', () => {
    assert.equal(stepsToKm(0, 170), 0);
  });
});

describe('estimateStepsKcal', () => {
  it('体重70kg・身長170cmで1万歩なら400kcal前後', () => {
    const kcal = estimateStepsKcal(10_000, 70, 170);
    assert.ok(kcal > 350 && kcal < 450, `${kcal}kcal`);
  });

  it('体重が重いほど多く消費する', () => {
    assert.ok(estimateStepsKcal(5000, 80, 170) > estimateStepsKcal(5000, 60, 170));
  });

  it('歩数に比例する', () => {
    const half = estimateStepsKcal(5000, 70, 170);
    const full = estimateStepsKcal(10_000, 70, 170);
    assert.ok(Math.abs(full - half * 2) < 0.001);
  });

  it('値が欠けていれば0を返す', () => {
    assert.equal(estimateStepsKcal(0, 70, 170), 0);
    assert.equal(estimateStepsKcal(10_000, 0, 170), 0);
    assert.equal(estimateStepsKcal(10_000, 70, 0), 0);
  });
});

describe('estimateExerciseKcal', () => {
  it('メッツ×体重×時間×1.05', () => {
    // 8メッツ・60kg・30分 → 8 × 60 × 0.5 × 1.05 = 252
    assert.ok(Math.abs(estimateExerciseKcal(8, 60, 30) - 252) < 0.001);
  });
});

describe('intensityLabel', () => {
  it('メッツの大きさで言い換える', () => {
    assert.equal(intensityLabel(2.5), '軽い');
    assert.equal(intensityLabel(3.5), 'ふつう');
    assert.equal(intensityLabel(7), 'きつい');
    assert.equal(intensityLabel(10), 'かなりきつい');
  });

  it('境目はその上の言い方に入る', () => {
    assert.equal(intensityLabel(3), 'ふつう');
    assert.equal(intensityLabel(6), 'きつい');
    assert.equal(intensityLabel(9), 'かなりきつい');
  });
});

describe('exerciseBonus', () => {
  it('設定がオフなら0', () => {
    assert.equal(exerciseBonus(300, { addExerciseToTarget: false, exerciseAddRatio: 100 }), 0);
  });

  it('加算率を掛ける', () => {
    assert.equal(exerciseBonus(300, { addExerciseToTarget: true, exerciseAddRatio: 50 }), 150);
  });

  it('マイナスは0として扱う', () => {
    assert.equal(exerciseBonus(-100, { addExerciseToTarget: true, exerciseAddRatio: 100 }), 0);
  });
});
