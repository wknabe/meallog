/**
 * 食べ過ぎ・食べ足りない分の調整。
 *
 * 1日単位で極端に増減させるのではなく、直近N日のズレをこれから先のN日に分散して
 * その日の目標カロリーを補正する。設定で4項目（ON/OFF・期間・上限・分散方法）を変えられる。
 *
 * 基準にするのは「摂取 − その日の目標」であって「摂取 − 消費」ではない。
 * 目標カロリーには既に減量ぶんの赤字が織り込まれているため、
 * 消費との差を使うと赤字を二重に数えてしまう。
 */
import type { DayKey } from './day.ts';

export type AdjustmentSettings = {
  enabled: boolean;
  /** 何日で均すか */
  days: number;
  /** 1日の調整幅の上限（％）。0なら制限なし */
  capPct: number;
  /** even=均等に分散、front=直近の日に多く配分 */
  distribution: 'even' | 'front';
};

/** 調整の計算に使う1日ぶんの記録 */
export type DayIntake = {
  date: DayKey;
  intakeKcal: number;
  /** 食事の記録が1件でもあるか。記録がない日は計算から除く */
  recorded: boolean;
  /**
   * その日の目標に上乗せされていた運動ぶんのカロリー。
   * 「運動した分を目標に加算する」設定がオフなら 0（省略可）。
   * 画面に出ていた目標と同じ基準で比べないと、運動した日が食べ過ぎ扱いになってしまう。
   */
  bonusKcal?: number;
};

export type AdjustmentResult = {
  /** 目標カロリーに足す値。食べ過ぎていればマイナス */
  adjustmentKcal: number;
  /** 直近N日の目標に対する超過の合計。マイナスなら食べ足りない */
  surplusKcal: number;
  /** 計算に使った日数（記録のある日だけ） */
  consideredDays: number;
  /** 上限で頭打ちになったか */
  capped: boolean;
  /** 上限を超えたぶん。これは翌日以降へ繰り越される */
  carryOverKcal: number;
};

/** Math.round は -0 を返すことがあるため、0に揃えてから使う */
function round(value: number): number {
  return Math.round(value) + 0;
}

const NO_ADJUSTMENT: AdjustmentResult = {
  adjustmentKcal: 0,
  surplusKcal: 0,
  consideredDays: 0,
  capped: false,
  carryOverKcal: 0,
};

/**
 * 今日の目標カロリーの補正量を求める。
 *
 * history には今日より前のN日ぶんを渡す。
 * 記録がない日は「食べていない」ではなく「記録し忘れ」の可能性が高いため計算から外す。
 * これをしないと、記録を1日飛ばすだけで翌日の目標が跳ね上がってしまう。
 */
export function computeAdjustment(params: {
  targetKcal: number;
  history: DayIntake[];
  settings: AdjustmentSettings;
}): AdjustmentResult {
  const { targetKcal, history, settings } = params;
  if (!settings.enabled || targetKcal <= 0) return NO_ADJUSTMENT;

  const days = Math.max(1, settings.days);
  const recorded = history.filter((day) => day.recorded).slice(-days);
  if (recorded.length === 0) return NO_ADJUSTMENT;

  const surplusKcal = recorded.reduce(
    (sum, day) => sum + (day.intakeKcal - (targetKcal + (day.bonusKcal ?? 0))),
    0,
  );

  // 超過分をこれから先のN日に配る。今日ぶんの取り分を求める
  const share =
    settings.distribution === 'front'
      ? // N, N-1, ..., 1 の重みで配ると、今日は 2/(N+1)
        2 / (days + 1)
      : 1 / days;

  const raw = -surplusKcal * share;

  if (settings.capPct <= 0) {
    return {
      adjustmentKcal: round(raw),
      surplusKcal: round(surplusKcal),
      consideredDays: recorded.length,
      capped: false,
      carryOverKcal: 0,
    };
  }

  const cap = (targetKcal * settings.capPct) / 100;
  const clamped = Math.max(-cap, Math.min(cap, raw));

  return {
    adjustmentKcal: round(clamped),
    surplusKcal: round(surplusKcal),
    consideredDays: recorded.length,
    capped: Math.abs(raw) > cap,
    carryOverKcal: round(raw - clamped),
  };
}

/** 調整後の目標カロリー。0を下回らないようにする */
export function adjustedTarget(targetKcal: number, adjustmentKcal: number): number {
  return Math.max(0, targetKcal + adjustmentKcal);
}

/** 設定画面などに出す説明文 */
export function describeAdjustment(result: AdjustmentResult): string {
  if (result.consideredDays === 0) return '記録が貯まると調整されます';
  if (result.adjustmentKcal === 0) return '調整はありません';
  const sign = result.adjustmentKcal > 0 ? '+' : '−';
  const amount = Math.abs(result.adjustmentKcal);
  const base = `今日の目標を ${sign}${amount} kcal 調整しています`;
  return result.capped ? `${base}（上限のため一部は翌日以降へ繰り越し）` : base;
}
