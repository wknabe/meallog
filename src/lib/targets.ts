/**
 * 目標カロリーとPFCの算出。
 *
 * 基礎代謝は国立健康・栄養研究所の式（Ganpule式）を使う。
 * ハリス・ベネディクト式は欧米人のデータが基になっており、日本人では過大に出やすいため。
 */
import { addDays, calcAge, differenceInDays, toDayKey, type DayKey } from './day';
import type { ActivityLevel, Gender, MacroTargets } from './types';

/** 体脂肪1kgあたりのエネルギー量（kcal） */
export const KCAL_PER_KG_FAT = 7200;

/** 身体活動レベルの選択肢。抽象的な言葉だけだと自己判断がぶれるため具体例を添える */
export const ACTIVITY_LEVELS: {
  level: ActivityLevel;
  label: string;
  coefficient: number;
  example: string;
}[] = [
  {
    level: 1,
    label: '低い',
    coefficient: 1.4,
    example: 'デスクワーク中心で、運動の習慣はほとんどない',
  },
  {
    level: 2,
    label: 'やや低い',
    coefficient: 1.55,
    example: '座っていることが多いが、通勤や買い物で少し歩く',
  },
  {
    level: 3,
    label: '普通',
    coefficient: 1.7,
    example: '立ち仕事や移動が多い、または週2〜3回の運動習慣がある',
  },
  {
    level: 4,
    label: '高い',
    coefficient: 1.85,
    example: '力仕事、またはほぼ毎日運動している',
  },
  {
    level: 5,
    label: '非常に高い',
    coefficient: 2.0,
    example: '毎日ハードなトレーニングをしている、または重労働',
  },
];

export function activityCoefficient(level: ActivityLevel): number {
  return ACTIVITY_LEVELS.find((a) => a.level === level)?.coefficient ?? 1.7;
}

/**
 * 基礎代謝量（kcal/日）を Ganpule式 で求める。
 * BMR = [0.1238 + 0.0481×体重 + 0.0234×身長 − 0.0138×年齢 − 0.5473×性別] × 1000 ÷ 4.186
 * 性別は男性=1、女性=2。
 */
export function calcBmr(params: {
  gender: Gender;
  ageYears: number;
  heightCm: number;
  weightKg: number;
}): number {
  const sexValue = params.gender === 'male' ? 1 : 2;
  const mj =
    0.1238 +
    0.0481 * params.weightKg +
    0.0234 * params.heightCm -
    0.0138 * params.ageYears -
    0.5473 * sexValue;
  return (mj * 1000) / 4.186;
}

/** 推定総消費カロリー（基礎代謝 × 身体活動レベル係数） */
export function calcTdee(bmr: number, level: ActivityLevel): number {
  return bmr * activityCoefficient(level);
}

export type TargetWarning = {
  kind: 'pace_too_fast' | 'below_bmr' | 'target_in_past';
  message: string;
};

export type TargetResult = MacroTargets & {
  bmr: number;
  tdee: number;
  /** 1日あたりの目標赤字（kcal）。増量ならマイナス */
  dailyDeficit: number;
  warnings: TargetWarning[];
};

/**
 * プロフィールから目標カロリーとPFCを算出する。
 *
 * 目標体重・達成希望日が未設定の場合は、体重維持（＝推定消費カロリー）を目標にする。
 */
export function calcTargets(params: {
  gender: Gender;
  birthDate: string;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  targetWeightKg?: number | null;
  targetDate?: DayKey | null;
  /** 基準日。既定は今日 */
  today?: DayKey;
}): TargetResult {
  const ageYears = calcAge(params.birthDate);
  const bmr = calcBmr({
    gender: params.gender,
    ageYears,
    heightCm: params.heightCm,
    weightKg: params.weightKg,
  });
  const tdee = calcTdee(bmr, params.activityLevel);
  const warnings: TargetWarning[] = [];

  let dailyDeficit = 0;
  if (params.targetWeightKg != null && params.targetDate) {
    const baseDay = params.today ?? toDayKey(new Date());
    const days = differenceInDays(params.targetDate, baseDay);
    if (days <= 0) {
      warnings.push({
        kind: 'target_in_past',
        message: '達成希望日が過去の日付です。体重維持の目標で計算しています。',
      });
    } else {
      const diffKg = params.weightKg - params.targetWeightKg;
      dailyDeficit = (diffKg * KCAL_PER_KG_FAT) / days;

      const kgPerWeek = (diffKg / days) * 7;
      if (Math.abs(kgPerWeek) > 1) {
        warnings.push({
          kind: 'pace_too_fast',
          message: `週${Math.abs(kgPerWeek).toFixed(1)}kgのペースになります。体脂肪1kgは約7,200kcalなので、食事だけで達成するのは現実的ではありません。達成希望日を延ばすことをおすすめします。`,
        });
      }
    }
  }

  let kcal = tdee - dailyDeficit;

  // 基礎代謝を下回る目標は、体調を崩したりリバウンドの原因になるため下限で止める
  if (kcal < bmr) {
    warnings.push({
      kind: 'below_bmr',
      message: `目標が基礎代謝(${Math.round(bmr)}kcal)を下回るため、基礎代謝の値まで引き上げています。`,
    });
    kcal = bmr;
  }

  return { bmr, tdee, dailyDeficit, ...calcMacros(kcal, params.weightKg), warnings };
}

/**
 * カロリーからPFCの初期値を割り振る。
 * タンパク質＝体重×2g、脂質＝総カロリーの25%、残りを炭水化物にする。
 * 目標カロリーが低くて炭水化物が不足する場合は、タンパク質を体重×1.6gまで下げて調整する。
 */
export function calcMacros(kcal: number, weightKg: number): MacroTargets {
  let proteinG = weightKg * 2;
  let fatG = (kcal * 0.25) / 9;
  let carbG = (kcal - proteinG * 4 - fatG * 9) / 4;

  // 炭水化物が総カロリーの20%を下回るなら、タンパク質を減らして枠を作る
  const minCarbG = (kcal * 0.2) / 4;
  if (carbG < minCarbG) {
    proteinG = Math.max(weightKg * 1.6, (kcal - minCarbG * 4 - fatG * 9) / 4);
    carbG = (kcal - proteinG * 4 - fatG * 9) / 4;
  }
  // それでも足りなければ脂質を削る
  if (carbG < 0) {
    fatG = (kcal * 0.2) / 9;
    carbG = Math.max(0, (kcal - proteinG * 4 - fatG * 9) / 4);
  }

  return {
    kcal: Math.round(kcal),
    proteinG: Math.round(proteinG),
    fatG: Math.round(fatG),
    carbG: Math.round(carbG),
  };
}

/** 減量ペースの選択肢 */
export const PACE_PRESETS = [
  { key: 'slow', label: 'ゆっくり', kgPerMonth: 1, note: '無理なく続けやすい' },
  { key: 'normal', label: '標準', kgPerMonth: 2, note: 'おすすめのペース' },
  { key: 'fast', label: '速め', kgPerMonth: 3, note: 'かなりの食事管理が必要' },
] as const;

export type PaceKey = (typeof PACE_PRESETS)[number]['key'];

/** 現在体重・目標体重・ペースから達成希望日を逆算する */
export function paceToTargetDate(
  currentWeightKg: number,
  targetWeightKg: number,
  kgPerMonth: number,
  from: DayKey = toDayKey(new Date())
): DayKey {
  const diffKg = Math.abs(currentWeightKg - targetWeightKg);
  if (diffKg === 0 || kgPerMonth <= 0) return addDays(from, 30);
  const months = diffKg / kgPerMonth;
  return addDays(from, Math.max(7, Math.round(months * 30)));
}

/** BMIを求める */
export function calcBmi(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}
