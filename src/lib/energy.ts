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

/**
 * よくある運動のMETs値（厚生労働省の身体活動のメッツ表を参考にした代表値）。
 *
 * メッツは「安静時の何倍のエネルギーを使うか」を表す数字だが、
 * 3.5 と 4.3 の違いを体感に置き換えられる人は少ない。
 * どれを選べばよいか迷わないよう、息の上がり具合で言い換えた hint を添えている。
 */
export const METS: Record<string, { label: string; mets: number; hint: string }> = {
  walk_slow: { label: 'ウォーキング（ゆっくり）', mets: 3.0, hint: '散歩くらい。息は上がらない' },
  walk: { label: 'ウォーキング（普通）', mets: 3.5, hint: '会話しながら歩ける速さ' },
  walk_fast: { label: 'ウォーキング（速歩）', mets: 4.3, hint: '少し息が弾む。早歩き' },
  jog: { label: 'ジョギング', mets: 7.0, hint: '会話が途切れがちな軽い走り' },
  run: { label: 'ランニング（時速8km）', mets: 8.3, hint: '会話は続かない。1km 7分半ほど' },
  run_fast: { label: 'ランニング（時速10km）', mets: 10.0, hint: 'かなり息が上がる。1km 6分ほど' },
  cycling: { label: 'サイクリング', mets: 6.8, hint: '軽く汗ばむ速さで漕ぐ' },
  swim: { label: '水泳', mets: 7.0, hint: 'クロールでゆったり泳ぐ' },
  strength_light: { label: '筋トレ（軽め）', mets: 3.5, hint: 'マシン中心。セット間の休憩は長め' },
  strength: { label: '筋トレ（しっかり）', mets: 6.0, hint: '高重量で追い込む。休憩は短め' },
  stretch: { label: 'ストレッチ・ヨガ', mets: 2.5, hint: '呼吸が乱れない程度' },
  housework: { label: '家事', mets: 3.0, hint: '掃除機がけ・洗濯など' },
};

/**
 * 歩幅（メートル）。身長のおよそ45%が目安。
 * 歩数から距離を出すために使う。
 */
export function strideMeters(heightCm: number): number {
  return (heightCm * 0.45) / 100;
}

/** 歩数から歩いた距離（km）を出す */
export function stepsToKm(steps: number, heightCm: number): number {
  return (steps * strideMeters(heightCm)) / 1000;
}

/**
 * 歩数から消費カロリーを見積もる。
 *
 * 歩数そのものにはカロリーの情報がないので、
 * 歩幅から距離を出し、ふつうの速さ（時速4.8km）で歩いたものとして時間に直し、
 * ウォーキングのメッツを当てる。他の運動と同じ計算に乗せるためにこの形にしている。
 *
 * 目安であって実測ではない。歩幅も速さも人によって違うので、数字は幅を持って見ること。
 */
const WALK_KM_PER_HOUR = 4.8;

export function estimateStepsKcal(steps: number, weightKg: number, heightCm: number): number {
  if (steps <= 0 || weightKg <= 0 || heightCm <= 0) return 0;
  const hours = stepsToKm(steps, heightCm) / WALK_KM_PER_HOUR;
  return estimateExerciseKcal(METS.walk.mets, weightKg, hours * 60);
}

export type StepsBurnParams = {
  /** 設定でオフにされていれば足さない */
  enabled: boolean;
  /**
   * ヘルスアプリから取り込めた歩数。
   * 取り込めている日は、その消費カロリーもヘルスアプリ側から取れているので足さない。
   * この仕組みは「連携できない・許可していない人」のためのもの。
   */
  healthSteps: number | null;
  /** 手で入れた1日の歩数 */
  manualSteps: number | null;
  /**
   * その日の「歩く」の記録に入っている歩数の合計。
   * 1日の歩数にはこのぶんも含まれているので、差し引かないと二重に数えてしまう。
   */
  recordedWalkSteps: number;
  weightKg: number | null;
  heightCm: number;
};

/**
 * 手で入れた歩数のうち、まだ運動として記録していないぶんの消費カロリー。
 *
 * 身体活動レベルからの推定消費にも日常の歩きは含まれているため、
 * 厳密にはここでも重なりが残る。それでも、連携できない人にとっては
 * 歩いたぶんが数字にまったく出ないほうが実態から遠いので、足す側に倒している。
 */
export function dailyStepsBurn(params: StepsBurnParams): number {
  if (!params.enabled) return 0;
  if (params.healthSteps != null) return 0;
  if (params.manualSteps == null || params.weightKg == null) return 0;

  const extra = Math.max(0, params.manualSteps - params.recordedWalkSteps);
  return estimateStepsKcal(extra, params.weightKg, params.heightCm);
}

/** メッツを「きつさ」の言葉に直す。数字だけでは強度が伝わらないため */
export function intensityLabel(mets: number): string {
  if (mets < 3) return '軽い';
  if (mets < 6) return 'ふつう';
  if (mets < 9) return 'きつい';
  return 'かなりきつい';
}
