/**
 * 「今日あと何を食べればいい？」の提案。
 *
 * 残りのカロリーとPFCに近づく候補を選ぶ。提案元は3種類あるが、
 * どれも「残りとの近さ」を同じ物差しで測り、上位を出すという作りは共通にしている。
 */
import type { Nutrients } from '../db/nutrients.ts';

export type Remaining = {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
};

/** 栄養価を持つ候補（料理・商品・食品のいずれでも使える） */
export type Candidate<T> = {
  item: T;
  nutrients: Nutrients;
};

/**
 * 残りとの近さを点数にする。小さいほど良い。
 *
 * 単位が違う栄養素をそのまま足すと、数値の大きい炭水化物ばかりが効いてしまうため、
 * 「残りに対する割合」に直してから足し合わせる。
 * カロリーは全体の帳尻なので重めに見る。
 */
export function distanceFromRemaining(nutrients: Nutrients, remaining: Remaining): number {
  const ratio = (actual: number, target: number) => {
    // 残りがほぼ無い栄養素は、少しでも足すと大きく外れる扱いにする
    const base = Math.max(Math.abs(target), 1);
    return (actual - target) / base;
  };

  const kcal = ratio(nutrients.kcal, remaining.kcal);
  const protein = ratio(nutrients.protein_g, remaining.proteinG);
  const fat = ratio(nutrients.fat_g, remaining.fatG);
  const carb = ratio(nutrients.carb_g, remaining.carbG);

  // 超過はより避けたいので、プラス側の誤差を重く見る
  const weigh = (value: number) => (value > 0 ? value * 1.5 : Math.abs(value));

  return weigh(kcal) * 2 + weigh(protein) + weigh(fat) + weigh(carb);
}

/** 残りに近い順に並べ替えて上位を返す */
export function rankByRemaining<T>(
  candidates: Candidate<T>[],
  remaining: Remaining,
  limit = 10
): { item: T; nutrients: Nutrients; score: number }[] {
  return candidates
    .map((candidate) => ({
      item: candidate.item,
      nutrients: candidate.nutrients,
      score: distanceFromRemaining(candidate.nutrients, remaining),
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, limit);
}

// ── 食材の組み合わせを作る ──

/** 組み合わせに使う食品。100gあたりの栄養価を持つ */
export type ComboFood = {
  id: number;
  name: string;
  per100g: Nutrients;
};

export type ComboItem = {
  food: ComboFood;
  grams: number;
};

export type ComboResult = {
  items: ComboItem[];
  totals: { kcal: number; proteinG: number; fatG: number; carbG: number };
};

/** グラム数の現実的な範囲。極端な量を提案しないための歯止め */
const LIMITS = {
  protein: { min: 30, max: 300 },
  staple: { min: 0, max: 400 },
  vegetable: { min: 50, max: 250 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 5g単位に丸める。1g単位で提案しても量れないため */
function roundGrams(value: number): number {
  return Math.round(value / 5) * 5;
}

/**
 * タンパク源・主食・野菜を組み合わせ、残りのPFCに合うグラム数を求める。
 *
 * 主食で炭水化物を、タンパク源でタンパク質を合わせる、という順で解く。
 * 連立方程式として厳密に解くこともできるが、
 * グラム数の上限・下限で頭打ちになる場合が多く、結果はほとんど変わらない。
 */
export function buildCombo(
  remaining: Remaining,
  selection: { protein: ComboFood; staple?: ComboFood; vegetable?: ComboFood }
): ComboResult {
  const items: ComboItem[] = [];

  // 野菜は量を固定する。ここを変数にすると解が不安定になり、提案が毎回ぶれる
  const vegetableGrams = selection.vegetable ? LIMITS.vegetable.min * 2 : 0;
  const vegetable = selection.vegetable
    ? { food: selection.vegetable, grams: vegetableGrams }
    : null;

  const contributed = (food: ComboFood, grams: number, key: keyof Nutrients) =>
    (food.per100g[key] * grams) / 100;

  const vegCarb = vegetable ? contributed(vegetable.food, vegetable.grams, 'carb_g') : 0;
  const vegProtein = vegetable ? contributed(vegetable.food, vegetable.grams, 'protein_g') : 0;

  // 主食で炭水化物を合わせる
  let stapleGrams = 0;
  if (selection.staple) {
    const carbPerGram = selection.staple.per100g.carb_g / 100;
    stapleGrams =
      carbPerGram > 0
        ? clamp(
            roundGrams((remaining.carbG - vegCarb) / carbPerGram),
            LIMITS.staple.min,
            LIMITS.staple.max
          )
        : 0;
  }
  const stapleProtein = selection.staple
    ? contributed(selection.staple, stapleGrams, 'protein_g')
    : 0;

  // 残ったタンパク質をタンパク源で埋める
  const proteinPerGram = selection.protein.per100g.protein_g / 100;
  const proteinGrams =
    proteinPerGram > 0
      ? clamp(
          roundGrams((remaining.proteinG - stapleProtein - vegProtein) / proteinPerGram),
          LIMITS.protein.min,
          LIMITS.protein.max
        )
      : LIMITS.protein.min;

  items.push({ food: selection.protein, grams: proteinGrams });
  if (selection.staple && stapleGrams > 0) {
    items.push({ food: selection.staple, grams: stapleGrams });
  }
  if (vegetable) items.push(vegetable);

  const totals = items.reduce(
    (sum, item) => ({
      kcal: sum.kcal + contributed(item.food, item.grams, 'kcal'),
      proteinG: sum.proteinG + contributed(item.food, item.grams, 'protein_g'),
      fatG: sum.fatG + contributed(item.food, item.grams, 'fat_g'),
      carbG: sum.carbG + contributed(item.food, item.grams, 'carb_g'),
    }),
    { kcal: 0, proteinG: 0, fatG: 0, carbG: 0 }
  );

  return { items, totals };
}

/**
 * 残りが少なすぎて提案する意味がないかを判定する。
 * 100kcalを切ったら「もう食べなくてよい」と伝えたほうが親切。
 */
export function isRemainingTooSmall(remaining: Remaining): boolean {
  return remaining.kcal < 100;
}
