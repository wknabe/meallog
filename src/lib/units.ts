/**
 * 単位の換算と表示。
 *
 * 内部の分量は必ずグラムで保持し、「1パック」「1玉」といった単位は表示のときだけ使う。
 * これを守らないと、栄養の集計も買い物リストの数量合算もできなくなる。
 */

export type Unit = {
  name: string;
  grams: number;
  /** 買い物リストで使う購入単位か（キャベツ1玉、鮭1切れ など） */
  isPurchaseUnit: boolean;
};

/** 単位つきの数量をグラムに換算する */
export function toGrams(quantity: number, unit: Unit | null): number {
  if (!unit) return quantity;
  return quantity * unit.grams;
}

/** グラムを単位つきの数量に換算する */
export function fromGrams(grams: number, unit: Unit): number {
  if (unit.grams <= 0) return 0;
  return grams / unit.grams;
}

/**
 * グラムを表示用の文字列にする。
 * 1,000g以上はkg表記にして、買い物リストで「1200g」と出ないようにする。
 */
export function formatGrams(grams: number): string {
  if (grams >= 1000) {
    const kg = grams / 1000;
    // 1.20kg ではなく 1.2kg と出す
    return `${Number(kg.toFixed(2))}kg`;
  }
  return `${Math.round(grams)}g`;
}

/** 「1.5個」「2パック」のような表示。小数は不要な0を落とす */
export function formatQuantity(quantity: number, unitName: string): string {
  const rounded = Number(quantity.toFixed(2));
  return `${rounded}${unitName}`;
}

/** 数量と単位から表示文字列を作る。単位がなければグラム表記 */
export function formatAmount(quantity: number, unit: Unit | null): string {
  return unit ? formatQuantity(quantity, unit.name) : formatGrams(quantity);
}

export type PurchaseAmount = {
  /** 買う個数（切り上げ後） */
  quantity: number;
  /** 単位名。購入単位が無い食品では null */
  unitName: string | null;
  /** 献立から集計した必要量 */
  needGrams: number;
  /** 「1玉（必要 480g）」のような表示文字列 */
  label: string;
};

/**
 * 必要量を買い物の単位に変換する。
 *
 * 必要量を満たす最小の個数まで切り上げる。
 * 480gのキャベツが必要なら「1玉（必要 480g）」、1,300g必要なら「2玉」になる。
 * 購入単位が登録されていない食品は、そのままグラム／kg表記にする。
 */
export function toPurchaseAmount(needGrams: number, units: Unit[]): PurchaseAmount {
  const purchaseUnit = units.find((unit) => unit.isPurchaseUnit && unit.grams > 0);

  if (!purchaseUnit) {
    return {
      quantity: needGrams,
      unitName: null,
      needGrams,
      label: formatGrams(needGrams),
    };
  }

  // 1g単位で売られているもの（精肉など）は切り上げずグラム表記のままにする
  if (purchaseUnit.grams <= 1) {
    return {
      quantity: needGrams,
      unitName: null,
      needGrams,
      label: formatGrams(needGrams),
    };
  }

  const quantity = Math.max(1, Math.ceil(needGrams / purchaseUnit.grams));
  return {
    quantity,
    unitName: purchaseUnit.name,
    needGrams,
    label: `${quantity}${purchaseUnit.name}（必要 ${formatGrams(needGrams)}）`,
  };
}

/**
 * 廃棄率を考慮して、購入すべき重量を求める。
 * 例: 可食部100gのごぼうが必要で廃棄率が10%なら、約111g買う必要がある。
 */
export function withRefuse(edibleGrams: number, refusePct: number): number {
  if (refusePct <= 0 || refusePct >= 100) return edibleGrams;
  return edibleGrams / (1 - refusePct / 100);
}
