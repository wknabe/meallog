/**
 * アプリ全体の配色定義。
 * モックアップの緑基調・白背景カード型に合わせている。
 * ダークモード対応を後から入れられるよう、色はすべてここに集約する。
 */
export const colors = {
  /** メインカラー（濃緑）。ボタン・進捗バー・アクティブなタブに使う */
  primary: '#2E7D5B',
  primaryDark: '#1F5C42',
  /** 淡い緑。カードの背景やハイライトに使う */
  primaryLight: '#E8F5EE',

  /** 画面全体の背景（薄いグレー） */
  background: '#F5F6F7',
  /** カードの背景 */
  surface: '#FFFFFF',
  /** カード内の区切りや控えめな背景 */
  surfaceMuted: '#F2F3F5',

  /** 本文の文字色 */
  text: '#1A1D1A',
  /** 補足の文字色 */
  textSub: '#6B7280',
  /** さらに薄い文字色（単位・注記など） */
  textFaint: '#9CA3AF',
  /** 反転文字色（緑背景の上） */
  textOnPrimary: '#FFFFFF',

  /** 罫線 */
  border: '#E5E7EB',

  /** PFCの色分け（モックアップ準拠） */
  protein: '#2E9E63',
  fat: '#E8912D',
  carb: '#3A82D6',

  /** 状態色 */
  danger: '#D64545',
  warning: '#E8912D',
  success: '#2E9E63',

  /** グラフ用 */
  chartIntake: '#E8912D',
  chartBurn: '#3A82D6',
  chartWeight: '#2E7D5B',
  chartGrid: '#E5E7EB',
} as const;

/** 余白の基準値。4の倍数で統一する */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** 角丸の基準値 */
export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

/** 文字サイズ */
export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 28,
  display: 34,
} as const;

/** カードの影（iOS/Android両対応） */
export const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;
