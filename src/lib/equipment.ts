/**
 * 筋トレの種目（ジムの器具）。
 *
 * メッツだけでは「今日は何をどれだけ挙げたか」が残らず、
 * 続けているうちに一番知りたくなる「前回より上がったか」が分からない。
 * そのため器具ごとに重さ×回数×セットを記録できるようにしている。
 *
 * 一覧に無い種目は名前を直接入力できるので、ここは網羅ではなく「よくあるもの」でよい。
 */

export type MuscleGroup = 'chest' | 'back' | 'shoulder' | 'arm' | 'leg' | 'core' | 'cardio';

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: '胸',
  back: '背中',
  shoulder: '肩',
  arm: '腕',
  leg: '脚',
  core: '体幹',
  cardio: '有酸素',
};

export type Equipment = {
  key: string;
  name: string;
  group: MuscleGroup;
  /** 重さを記録する種目か。自重種目は false */
  weighted: boolean;
};

export const EQUIPMENT: Equipment[] = [
  // 胸
  { key: 'bench_press', name: 'ベンチプレス', group: 'chest', weighted: true },
  { key: 'incline_bench', name: 'インクラインベンチプレス', group: 'chest', weighted: true },
  { key: 'chest_press', name: 'チェストプレス', group: 'chest', weighted: true },
  { key: 'pec_fly', name: 'ペックフライ（チェストフライ）', group: 'chest', weighted: true },
  { key: 'dumbbell_press', name: 'ダンベルプレス', group: 'chest', weighted: true },
  { key: 'push_up', name: '腕立て伏せ', group: 'chest', weighted: false },

  // 背中
  { key: 'lat_pulldown', name: 'ラットプルダウン', group: 'back', weighted: true },
  { key: 'seated_row', name: 'シーテッドロー', group: 'back', weighted: true },
  { key: 'bent_over_row', name: 'ベントオーバーロー', group: 'back', weighted: true },
  { key: 'deadlift', name: 'デッドリフト', group: 'back', weighted: true },
  { key: 'back_extension', name: 'バックエクステンション', group: 'back', weighted: false },
  { key: 'pull_up', name: '懸垂（チンニング）', group: 'back', weighted: false },

  // 肩
  { key: 'shoulder_press', name: 'ショルダープレス', group: 'shoulder', weighted: true },
  { key: 'side_raise', name: 'サイドレイズ', group: 'shoulder', weighted: true },
  { key: 'rear_delt', name: 'リアデルト（リアレイズ）', group: 'shoulder', weighted: true },
  { key: 'upright_row', name: 'アップライトロー', group: 'shoulder', weighted: true },

  // 腕
  { key: 'arm_curl', name: 'アームカール', group: 'arm', weighted: true },
  { key: 'preacher_curl', name: 'プリーチャーカール', group: 'arm', weighted: true },
  { key: 'triceps_pushdown', name: 'トライセプスプレスダウン', group: 'arm', weighted: true },
  { key: 'dips', name: 'ディップス', group: 'arm', weighted: false },

  // 脚
  { key: 'squat', name: 'スクワット（バーベル）', group: 'leg', weighted: true },
  { key: 'leg_press', name: 'レッグプレス', group: 'leg', weighted: true },
  { key: 'leg_extension', name: 'レッグエクステンション', group: 'leg', weighted: true },
  { key: 'leg_curl', name: 'レッグカール', group: 'leg', weighted: true },
  { key: 'hip_abduction', name: 'アダクション／アブダクション', group: 'leg', weighted: true },
  { key: 'calf_raise', name: 'カーフレイズ', group: 'leg', weighted: true },
  { key: 'lunge', name: 'ランジ', group: 'leg', weighted: false },

  // 体幹
  { key: 'abdominal', name: 'アブドミナルクランチ', group: 'core', weighted: true },
  { key: 'torso_rotation', name: 'トルソーローテーション', group: 'core', weighted: true },
  { key: 'ab_roller', name: '腹筋ローラー', group: 'core', weighted: false },
  { key: 'plank', name: 'プランク', group: 'core', weighted: false },
  { key: 'sit_up', name: '腹筋（シットアップ）', group: 'core', weighted: false },

  // 有酸素（ジムのマシン）
  { key: 'treadmill', name: 'トレッドミル', group: 'cardio', weighted: false },
  { key: 'bike_machine', name: 'エアロバイク', group: 'cardio', weighted: false },
  { key: 'cross_trainer', name: 'クロストレーナー', group: 'cardio', weighted: false },
  { key: 'rowing_machine', name: 'ローイングマシン', group: 'cardio', weighted: false },
];

const BY_KEY = new Map(EQUIPMENT.map((item) => [item.key, item]));

export function findEquipment(key: string): Equipment | null {
  return BY_KEY.get(key) ?? null;
}

/** 部位ごとにまとめる。選択画面で見出しを付けるため */
export function groupEquipment(): { group: MuscleGroup; items: Equipment[] }[] {
  const order: MuscleGroup[] = ['chest', 'back', 'shoulder', 'arm', 'leg', 'core', 'cardio'];
  return order.map((group) => ({
    group,
    items: EQUIPMENT.filter((item) => item.group === group),
  }));
}

export type ExerciseSet = {
  weightKg: number | null;
  reps: number | null;
};

export type ExerciseDraft = {
  equipmentKey: string | null;
  name: string;
  weighted: boolean;
  sets: ExerciseSet[];
};

/** 総挙上重量（重さ × 回数の合計）。前回との比較に使う */
export function totalVolume(sets: ExerciseSet[]): number {
  return sets.reduce((sum, set) => sum + (set.weightKg ?? 0) * (set.reps ?? 0), 0);
}

/** 「60kg × 10回 × 3セット」のように、セットをまとめて1行で表す */
export function describeSets(sets: ExerciseSet[]): string {
  const filled = sets.filter((set) => (set.reps ?? 0) > 0 || (set.weightKg ?? 0) > 0);
  if (filled.length === 0) return '';

  // すべて同じ内容なら「60kg × 10回 × 3セット」とまとめる
  const first = filled[0];
  const same = filled.every((set) => set.weightKg === first.weightKg && set.reps === first.reps);
  if (same) {
    return `${describeSet(first)} × ${filled.length}セット`;
  }
  return filled.map(describeSet).join('、');
}

function describeSet(set: ExerciseSet): string {
  const weight = (set.weightKg ?? 0) > 0 ? `${set.weightKg}kg` : '';
  const reps = (set.reps ?? 0) > 0 ? `${set.reps}回` : '';
  if (weight && reps) return `${weight} × ${reps}`;
  return weight || reps;
}
