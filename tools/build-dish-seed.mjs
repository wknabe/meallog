/**
 * data/dishes/*.json をアプリに同梱する assets/data/dishes.json へ変換する。
 *
 * 変換のついでに次を検証する。
 *  - 材料の食品番号が成分表に実在するか（存在しなければエラーで止める）
 *  - 料理名の重複がないか
 *  - 1人前あたりのカロリーが現実的な範囲か（明らかな桁違いを見つけるため）
 *
 * 実行: node tools/build-dish-seed.mjs
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';

const INPUT_DIR = 'data/dishes';
const FOODS = 'assets/data/foods.json';
const OUTPUT = 'assets/data/dishes.json';

const CATEGORIES = ['staple', 'main', 'side', 'soup', 'other'];
const CUISINES = ['japanese', 'western', 'chinese', 'ethnic'];
const EFFORTS = ['full', 'easy', 'heatonly', 'nocook'];
const VOLUMES = ['hearty', 'normal', 'light'];
const TASTES = ['light', 'rich', 'spicy', 'warm'];

/** 1人前あたりのカロリーがこの範囲を外れたら警告する */
const KCAL_RANGE = {
  staple: [100, 1200],
  main: [30, 900],
  side: [10, 450],
  soup: [10, 400],
  other: [0, 500],
};

const foods = JSON.parse(await readFile(FOODS, 'utf8'));
const col = (key) => foods.columns.indexOf(key);
const foodByCode = new Map(foods.rows.map((row) => [row[col('std_code')], row]));

const files = (await readdir(INPUT_DIR)).filter((name) => name.endsWith('.json')).sort();
const dishes = [];
const errors = [];
const warnings = [];
const seenNames = new Set();

for (const file of files) {
  const content = JSON.parse(await readFile(`${INPUT_DIR}/${file}`, 'utf8'));
  const fileCategory = content.category;

  if (fileCategory !== 'mixed' && !CATEGORIES.includes(fileCategory)) {
    errors.push(`${file}: category が不正です (${fileCategory})`);
    continue;
  }

  for (const dish of content.dishes) {
    const where = `${file} / ${dish.n}`;
    // 補充ファイルは1件ずつ ct でカテゴリを指定する
    const category = dish.ct ?? fileCategory;
    if (!CATEGORIES.includes(category)) {
      errors.push(`${where}: カテゴリが不正です (${category})`);
      continue;
    }

    if (seenNames.has(dish.n)) errors.push(`${where}: 料理名が重複しています`);
    seenNames.add(dish.n);

    if (dish.cu && !CUISINES.includes(dish.cu)) errors.push(`${where}: cu が不正 (${dish.cu})`);
    if (dish.ef && !EFFORTS.includes(dish.ef)) errors.push(`${where}: ef が不正 (${dish.ef})`);
    if (dish.vo && !VOLUMES.includes(dish.vo)) errors.push(`${where}: vo が不正 (${dish.vo})`);
    for (const taste of dish.ta ?? []) {
      if (!TASTES.includes(taste)) errors.push(`${where}: ta が不正 (${taste})`);
    }
    // dish_tastes は (dish_id, taste) が主キーなので、重複があると投入時に失敗する
    if (new Set(dish.ta ?? []).size !== (dish.ta ?? []).length) {
      errors.push(`${where}: ta に重複があります`);
    }
    if (!Array.isArray(dish.ig) || dish.ig.length === 0) {
      errors.push(`${where}: 材料がありません`);
      continue;
    }

    // 材料の検証と、1人前あたりの栄養価の計算
    let kcal = 0;
    let protein = 0;
    let fat = 0;
    let carb = 0;
    let grams = 0;
    const ingredients = [];

    for (const [code, gram, seasoning] of dish.ig) {
      const food = foodByCode.get(code);
      if (!food) {
        errors.push(`${where}: 食品番号 ${code} が成分表にありません`);
        continue;
      }
      if (!(gram > 0)) {
        errors.push(`${where}: ${food[col('name')]} のグラム数が不正 (${gram})`);
        continue;
      }
      const ratio = gram / 100;
      kcal += food[col('kcal')] * ratio;
      protein += food[col('protein_g')] * ratio;
      fat += food[col('fat_g')] * ratio;
      carb += food[col('carb_g')] * ratio;
      grams += gram;
      ingredients.push([code, gram, seasoning === 's' ? 1 : 0]);
    }

    const servings = dish.sv > 0 ? dish.sv : 1;
    const perServingKcal = kcal / servings;
    const [min, max] = KCAL_RANGE[category];
    if (perServingKcal < min || perServingKcal > max) {
      warnings.push(
        `${where}: 1人前 ${Math.round(perServingKcal)}kcal（${category} の想定は ${min}〜${max}）`
      );
    }

    dishes.push({
      row: [
        dish.n,
        category,
        dish.cu ?? null,
        dish.ef ?? null,
        dish.vo ?? null,
        servings,
        dish.cm ?? null,
        dish.ta ?? [],
        ingredients,
      ],
      summary: {
        name: dish.n,
        category,
        kcal: Math.round(perServingKcal),
        protein: Math.round((protein / servings) * 10) / 10,
        fat: Math.round((fat / servings) * 10) / 10,
        carb: Math.round((carb / servings) * 10) / 10,
        grams: Math.round(grams / servings),
      },
    });
  }
}

if (errors.length > 0) {
  console.error('エラー:');
  for (const error of errors) console.error(`  ${error}`);
  process.exit(1);
}

// ── 集計を表示して、内容がおかしくないか目視できるようにする ──
const byCategory = {};
for (const { summary } of dishes) {
  byCategory[summary.category] ??= [];
  byCategory[summary.category].push(summary);
}

console.log('カテゴリ別の件数と1人前あたりの平均');
for (const category of CATEGORIES) {
  const list = byCategory[category] ?? [];
  if (list.length === 0) continue;
  const avg = (key) => Math.round(list.reduce((sum, s) => sum + s[key], 0) / list.length);
  console.log(
    `  ${category.padEnd(7)} ${String(list.length).padStart(3)}品  ` +
      `${String(avg('kcal')).padStart(4)}kcal  P${avg('protein')} F${avg('fat')} C${avg('carb')}`
  );
}
console.log(`  合計    ${dishes.length}品`);

// 気分タグの組み合わせが偏っていないか確認する（献立生成で候補が枯れるのを防ぐ）
console.log('\n気分タグの分布');
for (const axis of [
  ['ジャンル', 2, CUISINES],
  ['手間', 3, EFFORTS],
  ['ボリューム', 4, VOLUMES],
]) {
  const [label, index, values] = axis;
  const counts = values.map(
    (value) => `${value}:${dishes.filter((d) => d.row[index] === value).length}`
  );
  console.log(`  ${label}: ${counts.join(' ')}`);
}
const tasteCounts = TASTES.map(
  (taste) => `${taste}:${dishes.filter((d) => d.row[7].includes(taste)).length}`
);
console.log(`  味: ${tasteCounts.join(' ')}`);

if (warnings.length > 0) {
  console.log(`\n確認したい値（${warnings.length}件）`);
  for (const warning of warnings) console.log(`  ${warning}`);
}

await writeFile(
  OUTPUT,
  JSON.stringify({
    columns: ['name', 'category', 'cuisine', 'effort', 'volume', 'servings', 'cook_minutes', 'tastes', 'ingredients'],
    rows: dishes.map((d) => d.row),
  })
);
console.log(`\n出力: ${OUTPUT}（${dishes.length}品）`);
