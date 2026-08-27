/**
 * 消費カロリーの扱い。
 *
 * 「プロフィールからの推定値」と「スマートウォッチの実測値」は別物として持ち、
 * 勝手に合算しない。どちらを主に使うかは設定で選ぶ。
 */
import type { ActivityLevel, Gender } from './types.ts';
import { calcBmr, calcTdee } from './targets.ts';

/** プロフィールから推定した1日の消費カロリー */
export type EstimatedBurn = {
  /** 基礎代謝 */
  bmr: number;
  /** 活動による推定消費（推定総消費 − 基礎代謝） */
  activity: number;
  /** 推定総消費 */
  total: number;
};

export function estimateBurn(params: {
  gender: Gender;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
}): EstimatedBurn {
  const bmr = calcBmr(params);
  const total = calcTdee(bmr, params.activityLevel);
  return { bmr, activity: total - bmr, total };
}

/** スマートウォッチから取得した1日の値 */
export type WatchBurn = {
  steps: number | null;
  distanceKm: number | null;
  activeKcal: number | null;
  totalKcal: number | null;
  exerciseMin: number | null;
};

export type BurnSource = 'estimate' | 'watch';

export type ResolvedBurn = {
  /** 実際に使う消費カロリー */
  kcal: number;
  /** 実際に使われた取得元。ウォッチのデータが無い日は推定値へ切り替わる */
  source: BurnSource;
  /** 設定はウォッチだが、データが無いため推定値を使ったか */
  fellBack: boolean;
};

/**
 * 設定にしたがって、その日の消費カロリーを決める。
 * ウォッチを選んでいてもデータが無い日は推定値を使う（0kcalとして扱わない）。
 */
export function resolveBurn(
  preferred: BurnSource,
  estimate: EstimatedBurn,
  watch: WatchBurn | null,
): ResolvedBurn {
  if (preferred === 'watch') {
    const watchKcal = watch?.totalKcal ?? null;
    if (watchKcal != null && watchKcal > 0) {
      return { kcal: watchKcal, source: 'watch', fellBack: false };
    }
    return { kcal: estimate.total, source: 'estimate', fellBack: true };
  }
  return { kcal: estimate.total, source: 'estimate', fellBack: false };
}

/**
 * 運動した分を目標カロリーに上乗せする量。
 *
 * 既定では上乗せしない。消費カロリーの推定には小さくない誤差があり、
 * そのまま「食べていい量」に足すと、実際には減っていないのに食べる量だけ増えてしまうため。
 */
export function exerciseBonus(
  exerciseKcal: number,
  settings: { addExerciseToTarget: boolean; exerciseAddRatio: number },
): number {
  if (!settings.addExerciseToTarget) return 0;
  return Math.max(0, exerciseKcal) * (settings.exerciseAddRatio / 100);
}

/**
 * 運動の消費カロリーをMETsから推定する。
 * 消費kcal = METs × 体重kg × 時間h × 1.05
 */
export function estimateExerciseKcal(mets: number, weightKg: number, minutes: number): number {
  return mets * weightKg * (minutes / 60) * 1.05;
}

/** よくある運動のMETs値（厚生労働省の身体活動のメッツ表を参考にした代表値） */
export const METS: Record<string, { label: string; mets: number }> = {
  walk_slow: { label: 'ウォーキング（ゆっくり）', mets: 3.0 },
  walk: { label: 'ウォーキング（普通）', mets: 3.5 },
  walk_fast: { label: 'ウォーキング（速歩）', mets: 4.3 },
  jog: { label: 'ジョギング', mets: 7.0 },
  run: { label: 'ランニング（時速8km）', mets: 8.3 },
  run_fast: { label: 'ランニング（時速10km）', mets: 10.0 },
  cycling: { label: 'サイクリング', mets: 6.8 },
  swim: { label: '水泳', mets: 7.0 },
  strength_light: { label: '筋トレ（軽め）', mets: 3.5 },
  strength: { label: '筋トレ（しっかり）', mets: 6.0 },
  stretch: { label: 'ストレッチ・ヨガ', mets: 2.5 },
  housework: { label: '家事', mets: 3.0 },
};
