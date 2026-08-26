import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  addDays,
  calcAge,
  dateRange,
  differenceInDays,
  formatDayLabel,
  logicalDate,
  recentDays,
  toDayKey,
} from './day.ts';

describe('logicalDate（1日の区切り）', () => {
  it('区切り時刻より前の記録は前日として扱う', () => {
    // 5月28日 0:30 の間食は、区切り4時なら5月27日ぶん
    const instant = new Date(2026, 4, 28, 0, 30);
    assert.equal(logicalDate(instant, 4), '2026-05-27');
  });

  it('区切り時刻ちょうどはその日として扱う', () => {
    const instant = new Date(2026, 4, 28, 4, 0);
    assert.equal(logicalDate(instant, 4), '2026-05-28');
  });

  it('区切りを0時にすれば深夜も当日になる', () => {
    const instant = new Date(2026, 4, 28, 0, 30);
    assert.equal(logicalDate(instant, 0), '2026-05-28');
  });

  it('月をまたぐ深夜も正しく前日になる', () => {
    const instant = new Date(2026, 5, 1, 2, 0);
    assert.equal(logicalDate(instant, 4), '2026-05-31');
  });

  it('日中の記録は区切り設定に影響されない', () => {
    const instant = new Date(2026, 4, 28, 12, 0);
    assert.equal(logicalDate(instant, 4), '2026-05-28');
    assert.equal(logicalDate(instant, 0), '2026-05-28');
  });
});

describe('addDays / differenceInDays', () => {
  it('月をまたいで加算できる', () => {
    assert.equal(addDays('2026-05-30', 3), '2026-06-02');
  });

  it('負の値で遡れる', () => {
    assert.equal(addDays('2026-06-02', -3), '2026-05-30');
  });

  it('うるう年の2月をまたげる', () => {
    assert.equal(addDays('2028-02-28', 2), '2028-03-01');
  });

  it('日数差を求められる', () => {
    assert.equal(differenceInDays('2026-06-02', '2026-05-30'), 3);
    assert.equal(differenceInDays('2026-05-30', '2026-06-02'), -3);
  });
});

describe('dateRange / recentDays', () => {
  it('両端を含む日付の配列を返す', () => {
    assert.deepEqual(dateRange('2026-05-28', '2026-05-31'), [
      '2026-05-28',
      '2026-05-29',
      '2026-05-30',
      '2026-05-31',
    ]);
  });

  it('同じ日なら1件だけ返す', () => {
    assert.deepEqual(dateRange('2026-05-28', '2026-05-28'), ['2026-05-28']);
  });

  it('直近n日は当日を含む', () => {
    const days = recentDays('2026-05-28', 7);
    assert.equal(days.length, 7);
    assert.equal(days[0], '2026-05-22');
    assert.equal(days[6], '2026-05-28');
  });
});

describe('calcAge', () => {
  it('誕生日を迎えていれば加算される', () => {
    assert.equal(calcAge('1994-05-01', new Date(2026, 4, 28)), 32);
  });

  it('誕生日前なら1つ少ない', () => {
    assert.equal(calcAge('1994-06-01', new Date(2026, 4, 28)), 31);
  });

  it('誕生日当日は加算される', () => {
    assert.equal(calcAge('1994-05-28', new Date(2026, 4, 28)), 32);
  });
});

describe('表示形式', () => {
  it('曜日つきの日本語表記になる', () => {
    assert.equal(formatDayLabel('2026-05-28'), '5月28日(木)');
  });

  it('Dateから日付キーに変換できる', () => {
    assert.equal(toDayKey(new Date(2026, 4, 28, 23, 59)), '2026-05-28');
  });
});
