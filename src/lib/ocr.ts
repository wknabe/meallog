/**
 * 栄養成分表示の読み取り。
 *
 * いまは読み取りを行わず、空の下書きを返す。
 * 商品登録の画面は「撮影 → 確認・修正 → 保存」まで完成しているので、
 * 当面は撮影した画像を見ながら手で入力する。
 *
 * あとから Tesseract（端末内で動く文字認識）や Claude API を
 * recognizeNutritionLabel に差し込めば、画面を変えずに自動入力にできる。
 * そのため戻り値は「確定値」ではなく「下書き」という形にしてある。
 */
import type { Nutrients } from '../db/nutrients.ts';

/** 成分表が何を基準にした値かを表す */
export type LabelBasis = '100g' | 'serving';

export type NutritionDraft = {
  /** 読み取れた商品名。読めなければ null */
  name: string | null;
  /** 「100gあたり」か「1食あたり」か */
  basis: LabelBasis;
  /** 1食あたりの場合のグラム数 */
  servingGrams: number | null;
  /** 読み取れた栄養素だけを入れる。読めなかった項目は含めない */
  values: Partial<Nutrients>;
  /**
   * 読み取り処理が実際に動いたか。
   * false のときは画面側で「手で入力してください」と案内する。
   */
  recognized: boolean;
};

export function emptyDraft(): NutritionDraft {
  return { name: null, basis: '100g', servingGrams: null, values: {}, recognized: false };
}

/**
 * 成分表の画像から栄養価を読み取る。
 * 現時点では常に空の下書きを返す（読み取り処理は未実装）。
 */
export async function recognizeNutritionLabel(_imageUri: string): Promise<NutritionDraft> {
  return emptyDraft();
}

/** 読み取り機能が使えるかどうか。画面の案内文を切り替えるために使う */
export const OCR_AVAILABLE = false;
