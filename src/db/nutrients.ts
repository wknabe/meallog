/**
 * 栄養素の定義。
 * 日本食品標準成分表（八訂）の収載項目のうち、アプリで扱うものを列挙する。
 * DBの列名とTypeScriptのキーを一致させ、計算処理でループできるようにしている。
 */

/** 主要栄養素。画面の中心に出すのはこの4つ（kcal・P・F・C） */
export const MACRO_KEYS = [
  'kcal',
  'protein_g',
  'fat_g',
  'carb_g',
  'fiber_g',
  'salt_g',
] as const;

/** ビタミン類 */
export const VITAMIN_KEYS = [
  'vit_a_ug',
  'vit_d_ug',
  'vit_e_mg',
  'vit_k_ug',
  'vit_b1_mg',
  'vit_b2_mg',
  'niacin_mg',
  'vit_b6_mg',
  'vit_b12_ug',
  'folate_ug',
  'pantothenic_mg',
  'biotin_ug',
  'vit_c_mg',
] as const;

/** ミネラル類 */
export const MINERAL_KEYS = [
  'sodium_mg',
  'potassium_mg',
  'calcium_mg',
  'magnesium_mg',
  'phosphorus_mg',
  'iron_mg',
  'zinc_mg',
  'copper_mg',
  'manganese_mg',
  'iodine_ug',
  'selenium_ug',
  'chromium_ug',
  'molybdenum_ug',
] as const;

export const NUTRIENT_KEYS = [...MACRO_KEYS, ...VITAMIN_KEYS, ...MINERAL_KEYS] as const;

export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

/** 全栄養素の値を持つオブジェクト */
export type Nutrients = Record<NutrientKey, number>;

/** 表示名と単位。設定画面や詳細表示で使う */
export const NUTRIENT_LABELS: Record<NutrientKey, { label: string; unit: string }> = {
  kcal: { label: 'エネルギー', unit: 'kcal' },
  protein_g: { label: 'たんぱく質', unit: 'g' },
  fat_g: { label: '脂質', unit: 'g' },
  carb_g: { label: '炭水化物', unit: 'g' },
  fiber_g: { label: '食物繊維', unit: 'g' },
  salt_g: { label: '食塩相当量', unit: 'g' },

  vit_a_ug: { label: 'ビタミンA', unit: 'μg' },
  vit_d_ug: { label: 'ビタミンD', unit: 'μg' },
  vit_e_mg: { label: 'ビタミンE', unit: 'mg' },
  vit_k_ug: { label: 'ビタミンK', unit: 'μg' },
  vit_b1_mg: { label: 'ビタミンB1', unit: 'mg' },
  vit_b2_mg: { label: 'ビタミンB2', unit: 'mg' },
  niacin_mg: { label: 'ナイアシン', unit: 'mg' },
  vit_b6_mg: { label: 'ビタミンB6', unit: 'mg' },
  vit_b12_ug: { label: 'ビタミンB12', unit: 'μg' },
  folate_ug: { label: '葉酸', unit: 'μg' },
  pantothenic_mg: { label: 'パントテン酸', unit: 'mg' },
  biotin_ug: { label: 'ビオチン', unit: 'μg' },
  vit_c_mg: { label: 'ビタミンC', unit: 'mg' },

  sodium_mg: { label: 'ナトリウム', unit: 'mg' },
  potassium_mg: { label: 'カリウム', unit: 'mg' },
  calcium_mg: { label: 'カルシウム', unit: 'mg' },
  magnesium_mg: { label: 'マグネシウム', unit: 'mg' },
  phosphorus_mg: { label: 'リン', unit: 'mg' },
  iron_mg: { label: '鉄', unit: 'mg' },
  zinc_mg: { label: '亜鉛', unit: 'mg' },
  copper_mg: { label: '銅', unit: 'mg' },
  manganese_mg: { label: 'マンガン', unit: 'mg' },
  iodine_ug: { label: 'ヨウ素', unit: 'μg' },
  selenium_ug: { label: 'セレン', unit: 'μg' },
  chromium_ug: { label: 'クロム', unit: 'μg' },
  molybdenum_ug: { label: 'モリブデン', unit: 'μg' },
};

/** すべて0の栄養素オブジェクトを作る */
export function emptyNutrients(): Nutrients {
  const result = {} as Nutrients;
  for (const key of NUTRIENT_KEYS) result[key] = 0;
  return result;
}

/** 100gあたりの値から、指定グラム数ぶんの値を計算する */
export function scaleNutrients(per100g: Partial<Nutrients>, grams: number): Nutrients {
  const ratio = grams / 100;
  const result = emptyNutrients();
  for (const key of NUTRIENT_KEYS) result[key] = (per100g[key] ?? 0) * ratio;
  return result;
}

/** 栄養素を足し合わせる */
export function addNutrients(...list: Partial<Nutrients>[]): Nutrients {
  const result = emptyNutrients();
  for (const item of list) {
    for (const key of NUTRIENT_KEYS) result[key] += item[key] ?? 0;
  }
  return result;
}

/** 栄養素を定数倍する */
export function multiplyNutrients(n: Partial<Nutrients>, factor: number): Nutrients {
  const result = emptyNutrients();
  for (const key of NUTRIENT_KEYS) result[key] = (n[key] ?? 0) * factor;
  return result;
}
