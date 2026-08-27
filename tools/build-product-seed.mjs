/**
 * Open Food Facts の公開ダンプから、日本で売られている商品を抜き出して同梱データを作る。
 *
 * 各社の通販サイトを巡回して集めるのではなくこちらを使うのは、
 * Open Food Facts のデータが ODbL で再配布を明示的に許可しているため。
 * 小売各社のサイトは規約で収集・再配布を禁じていることが多く、
 * ページの作りが変わるたびに壊れるので、同梱データの元にはできない。
 *
 * 使い方:
 *   node tools/build-product-seed.mjs <products.csv.gz のパス>
 *
 * ダンプは https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz
 * （タブ区切り・約1.3GB）。展開しながら流し読みするので、展開後のファイルは作らない。
 */
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = resolve(ROOT, 'assets/data/products.json');

/** 使う列。ダンプの列は211個あるので、必要なものだけ番号で拾う */
const COLUMN = {
  code: 0,
  name: 10,
  quantity: 13,
  brands: 18,
  categories: 22,
  countries: 40,
  servingSize: 50,
  servingQuantity: 51,
  kcal: 89,
  fat: 92,
  carb: 129,
  sugar: 130,
  fiber: 146,
  protein: 150,
  salt: 154,
};

/** 明らかに入力ミスと分かる値を弾く。100gあたりの上限 */
const LIMIT = { kcal: 900, protein: 100, fat: 100, carb: 100, fiber: 100, salt: 100 };

const source = process.argv[2];
if (!source) {
  console.error('使い方: node tools/build-product-seed.mjs <products.csv.gz のパス>');
  process.exit(1);
}

const stream = createReadStream(source).pipe(createGunzip());
const lines = createInterface({ input: stream, crlfDelay: Infinity });

/** バーコードごとに1件。同じ商品が複数行あることがあるので、新しいものを残す */
const products = new Map();

let total = 0;
let japanese = 0;
let skippedNoName = 0;
let skippedNoNutrition = 0;
let skippedOutOfRange = 0;
let header = true;

for await (const line of lines) {
  if (header) {
    header = false;
    continue;
  }
  total++;
  if (total % 500_000 === 0) {
    process.stdout.write(`  ${total.toLocaleString()}行 / 採用 ${products.size}件\r`);
  }

  const cells = line.split('\t');
  // 引用符の中に改行が入った行は列数が合わない。数件のために全体を遅くしたくないので捨てる
  if (cells.length < COLUMN.salt + 1) continue;

  if (!cells[COLUMN.countries]?.includes('en:japan')) continue;
  japanese++;

  const name = clean(cells[COLUMN.name]);
  if (name === '') {
    skippedNoName++;
    continue;
  }

  const kcal = toNumber(cells[COLUMN.kcal]);
  if (kcal == null) {
    skippedNoNutrition++;
    continue;
  }

  const nutrition = {
    kcal,
    protein: toNumber(cells[COLUMN.protein]) ?? 0,
    fat: toNumber(cells[COLUMN.fat]) ?? 0,
    carb: toNumber(cells[COLUMN.carb]) ?? 0,
    fiber: toNumber(cells[COLUMN.fiber]),
    sugar: toNumber(cells[COLUMN.sugar]),
    salt: toNumber(cells[COLUMN.salt]),
  };

  if (outOfRange(nutrition)) {
    skippedOutOfRange++;
    continue;
  }

  const code = clean(cells[COLUMN.code]);
  if (code === '') continue;

  products.set(code, {
    c: code,
    n: name,
    m: clean(cells[COLUMN.brands]).split(',')[0] ?? '',
    q: clean(cells[COLUMN.quantity]),
    // 1食あたりのグラム数。分かるものだけ入れる
    s: toNumber(cells[COLUMN.servingQuantity]),
    k: round(nutrition.kcal),
    p: round(nutrition.protein),
    f: round(nutrition.fat),
    b: round(nutrition.carb),
    i: nutrition.fiber == null ? null : round(nutrition.fiber),
    u: nutrition.sugar == null ? null : round(nutrition.sugar),
    l: nutrition.salt == null ? null : round(nutrition.salt, 2),
  });
}

process.stdout.write('\n');

const list = [...products.values()].sort((a, b) => a.n.localeCompare(b.n, 'ja'));

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(
  OUTPUT,
  JSON.stringify({
    source: 'Open Food Facts',
    licence: 'Open Database License (ODbL) v1.0',
    url: 'https://world.openfoodfacts.org/',
    generatedAt: new Date().toISOString().slice(0, 10),
    products: list,
  }),
);

console.log(`読んだ行            ${total.toLocaleString()}`);
console.log(`日本の商品          ${japanese.toLocaleString()}`);
console.log(`  名前なしで除外    ${skippedNoName.toLocaleString()}`);
console.log(`  栄養なしで除外    ${skippedNoNutrition.toLocaleString()}`);
console.log(`  値がおかしく除外  ${skippedOutOfRange.toLocaleString()}`);
console.log(`書き出し            ${list.length.toLocaleString()}件 → ${OUTPUT}`);

function clean(value) {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

function toNumber(value) {
  if (value == null || value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * 100gあたりの値としてありえない商品を落とす。
 * 誰でも登録できるデータなので、単位を取り違えた入力がそれなりに混ざっている。
 */
function outOfRange(n) {
  if (n.kcal > LIMIT.kcal) return true;
  if (n.protein > LIMIT.protein || n.fat > LIMIT.fat || n.carb > LIMIT.carb) return true;
  if (n.fiber != null && n.fiber > LIMIT.fiber) return true;
  if (n.salt != null && n.salt > LIMIT.salt) return true;
  // P+F+C が100gを超えるのは計算が合わない
  if (n.protein + n.fat + n.carb > 105) return true;
  // 三大栄養素から計算したカロリーと、書かれたカロリーが大きくずれるものも捨てる
  const computed = n.protein * 4 + n.fat * 9 + n.carb * 4;
  if (computed > 0 && (n.kcal > computed * 2 + 50 || n.kcal < computed / 2 - 50)) return true;
  return false;
}
