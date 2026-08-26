import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  adjustedTarget,
  computeAdjustment,
  type AdjustmentSettings,
  type DayIntake,
} from './adjustment.ts';

const settings = (patch: Partial<AdjustmentSettings> = {}): AdjustmentSettings => ({
  enabled: true,
  days: 7,
  capPct: 15,
  distribution: 'even',
  ...patch,
});

/** 指定した超過量で記録された日を作る */
function days(target: number, surpluses: number[]): DayIntake[] {
  return surpluses.map((surplus, index) => ({
    date: `2026-05-${String(index + 1).padStart(2, '0')}`,
    intakeKcal: target + surplus,
    recorded: true,
  }));
}

describe('computeAdjustment', () => {
  it('目標どおりに食べていれば調整しない', () => {
    const result = computeAdjustment({
      targetKcal: 2000,
      history: days(2000, [0, 0, 0, 0, 0, 0, 0]),
      settings: settings(),
    });
    assert.equal(result.adjustmentKcal, 0);
    assert.equal(result.surplusKcal, 0);
  });

  it('食べ過ぎた分を7日で均等に割る', () => {
    // 1日だけ700kcal超過 → 7日で割って今日は100kcal減
    const result = computeAdjustment({
      targetKcal: 2000,
      history: days(2000, [700, 0, 0, 0, 0, 0, 0]),
      settings: settings(),
    });
    assert.equal(result.surplusKcal, 700);
    assert.equal(result.adjustmentKcal, -100);
  });

  it('食べ足りない分は目標を増やす方向に働く', () => {
    const result = computeAdjustment({
      targetKcal: 2000,
      history: days(2000, [-700, 0, 0, 0, 0, 0, 0]),
      settings: settings(),
    });
    assert.equal(result.adjustmentKcal, 100);
  });

  it('1日の調整幅は上限で頭打ちになり、超えた分は繰り越しになる', () => {
    // 飲み会で3,000kcal超過 → 7日で割ると-428kcalだが、±15%(300kcal)で止まる
    const result = computeAdjustment({
      targetKcal: 2000,
      history: days(2000, [3000, 0, 0, 0, 0, 0, 0]),
      settings: settings(),
    });
    assert.equal(result.adjustmentKcal, -300);
    assert.equal(result.capped, true);
    assert.ok(result.carryOverKcal < 0);
  });

  it('上限なしにすると頭打ちにならない', () => {
    const result = computeAdjustment({
      targetKcal: 2000,
      history: days(2000, [3000, 0, 0, 0, 0, 0, 0]),
      settings: settings({ capPct: 0 }),
    });
    assert.equal(result.adjustmentKcal, -429);
    assert.equal(result.capped, false);
  });

  it('前半重点は均等より今日の調整量が大きくなる', () => {
    const history = days(2000, [700, 0, 0, 0, 0, 0, 0]);
    const even = computeAdjustment({ targetKcal: 2000, history, settings: settings() });
    const front = computeAdjustment({
      targetKcal: 2000,
      history,
      settings: settings({ distribution: 'front' }),
    });
    assert.ok(Math.abs(front.adjustmentKcal) > Math.abs(even.adjustmentKcal));
    // 7日なら今日の取り分は 2/8 = 25%
    assert.equal(front.adjustmentKcal, -175);
  });

  it('調整期間を短くすると1日あたりの調整が大きくなる', () => {
    const history = days(2000, [600, 0, 0, 0, 0, 0, 0]);
    const short = computeAdjustment({
      targetKcal: 2000,
      history,
      settings: settings({ days: 3 }),
    });
    // 直近3日ぶんだけを見るので、6日前の超過は対象外になる
    assert.equal(short.consideredDays, 3);
    assert.equal(short.surplusKcal, 0);
  });

  it('記録のない日は計算から外す', () => {
    // 記録し忘れた日を「0kcal食べた」と扱うと、翌日の目標が跳ね上がってしまう
    const history: DayIntake[] = [
      { date: '2026-05-01', intakeKcal: 2500, recorded: true },
      { date: '2026-05-02', intakeKcal: 0, recorded: false },
      { date: '2026-05-03', intakeKcal: 0, recorded: false },
    ];
    const result = computeAdjustment({ targetKcal: 2000, history, settings: settings() });
    assert.equal(result.consideredDays, 1);
    assert.equal(result.surplusKcal, 500);
  });

  it('記録が1日もなければ調整しない', () => {
    const history: DayIntake[] = [
      { date: '2026-05-01', intakeKcal: 0, recorded: false },
    ];
    const result = computeAdjustment({ targetKcal: 2000, history, settings: settings() });
    assert.equal(result.adjustmentKcal, 0);
  });

  it('設定がオフなら何もしない', () => {
    const result = computeAdjustment({
      targetKcal: 2000,
      history: days(2000, [3000]),
      settings: settings({ enabled: false }),
    });
    assert.equal(result.adjustmentKcal, 0);
  });

  it('目標カロリーが0でも壊れない', () => {
    const result = computeAdjustment({
      targetKcal: 0,
      history: days(0, [500]),
      settings: settings(),
    });
    assert.equal(result.adjustmentKcal, 0);
  });

  it('調整期間より多くの履歴を渡しても直近ぶんだけ使う', () => {
    const history = days(2000, [500, 500, 500, 500, 500, 500, 500, 500, 500, 500]);
    const result = computeAdjustment({ targetKcal: 2000, history, settings: settings() });
    assert.equal(result.consideredDays, 7);
    assert.equal(result.surplusKcal, 3500);
  });
});

describe('adjustedTarget', () => {
  it('調整量を足した目標を返す', () => {
    assert.equal(adjustedTarget(2000, -300), 1700);
  });

  it('マイナスにはならない', () => {
    assert.equal(adjustedTarget(500, -900), 0);
  });
});
