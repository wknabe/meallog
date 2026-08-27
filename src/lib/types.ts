/** アプリ全体で使う型と、選択肢のラベル定義 */

// テストを素のNodeで動かせるよう、lib配下は相対パスで参照する
import type { Nutrients } from '../db/nutrients.ts';

// ── プロフィール ────────────────────────────────
export type Gender = 'male' | 'female';

/** 身体活動レベル（1=低い 〜 5=非常に高い） */
export type ActivityLevel = 1 | 2 | 3 | 4 | 5;

export type Profile = {
  gender: Gender;
  birthDate: string; // YYYY-MM-DD
  heightCm: number;
  activityLevel: ActivityLevel;
  targetWeightKg: number | null;
  targetDate: string | null;
  targetKcal: number;
  targetProteinG: number;
  targetFatG: number;
  targetCarbG: number;
  targetsOverridden: boolean;
};

// ── 設定 ──────────────────────────────────────
export type AdjustmentDistribution = 'even' | 'front';
export type BurnSource = 'estimate' | 'watch';

export type Settings = {
  dayStartHour: number; // 0|3|4|5
  adjustmentEnabled: boolean;
  adjustmentDays: number; // 3|5|7|14
  adjustmentCapPct: number; // 10|15|20|0(=制限なし)
  adjustmentDistribution: AdjustmentDistribution;
  burnSource: BurnSource;
  addExerciseToTarget: boolean;
  exerciseAddRatio: number; // 100|50
  /** 運動の内容にメッツの数字を出すか。false なら体感の言葉で出す */
  showMets: boolean;
  /** 端末の健康アプリから自動で取り込むか */
  autoSyncHealth: boolean;
  lastHealthSyncAt: string | null;
  mealPhotoRetentionDays: number; // 0=無期限
  labelPhotoRetentionDays: number; // 0=無期限, -1=保存しない
  lastBackupAt: string | null;
  lastAutoBackupAt: string | null;
};

// ── 食事 ──────────────────────────────────────
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: '朝食',
  lunch: '昼食',
  dinner: '夕食',
  snack: '間食',
};

export const MEAL_SLOT_ORDER: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export type RefType = 'food' | 'dish';

export type MealItem = {
  id: number;
  refType: RefType;
  refId: number;
  name: string;
  quantity: number; // foodはグラム数、dishは人数分
  unitLabel: string | null;
  grams: number;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  fiberG: number;
  nutrients: Nutrients;
};

export type Meal = {
  id: number;
  date: string;
  slot: MealSlot;
  eatenAt: string;
  photoPath: string | null;
  memo: string | null;
  items: MealItem[];
};

// ── 料理の分類と気分タグ ──────────────────────────
export type DishCategory = 'staple' | 'main' | 'side' | 'soup' | 'other';
export type Cuisine = 'japanese' | 'western' | 'chinese' | 'ethnic';
export type Effort = 'full' | 'easy' | 'heatonly' | 'nocook';
export type Volume = 'hearty' | 'normal' | 'light';
export type Taste = 'light' | 'rich' | 'spicy' | 'warm';

export const DISH_CATEGORY_LABELS: Record<DishCategory, string> = {
  staple: '主食',
  main: '主菜',
  side: '副菜',
  soup: '汁物',
  other: 'その他',
};

export const CUISINE_LABELS: Record<Cuisine, string> = {
  japanese: '和食',
  western: '洋食',
  chinese: '中華',
  ethnic: 'エスニック',
};

export const EFFORT_LABELS: Record<Effort, string> = {
  full: 'しっかり作る',
  easy: '簡単（15分以内）',
  heatonly: '加熱だけ',
  nocook: '作らない',
};

export const VOLUME_LABELS: Record<Volume, string> = {
  hearty: 'がっつり',
  normal: '普通',
  light: '軽め',
};

export const TASTE_LABELS: Record<Taste, string> = {
  light: 'さっぱり',
  rich: 'こってり',
  spicy: '辛いもの',
  warm: '温かいもの',
};

/** 献立作成で選ぶ「今の気分」。未選択の軸は絞り込みに使わない */
export type MoodFilter = {
  cuisine?: Cuisine;
  effort?: Effort;
  volume?: Volume;
  tastes?: Taste[];
};

// ── 運動 ──────────────────────────────────────
export type ActivityType = 'walk' | 'run' | 'strength' | 'other';

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  walk: 'ウォーキング',
  run: 'ランニング',
  strength: '筋トレ',
  other: 'その他の運動',
};

// ── 目標値 ────────────────────────────────────
export type MacroTargets = {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
};
