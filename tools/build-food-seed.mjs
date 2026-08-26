/**
 * 日本食品標準成分表（八訂）増補2023年のExcelを、アプリに同梱するJSONへ変換する。
 *
 *   入力: data/raw/seibunhyo_honhyo.xlsx（文部科学省が公開しているファイル）
 *   出力: assets/data/foods.json
 *
 * 実行: node tools/build-food-seed.mjs
 *
 * 出力はキー名を持たない配列形式にしている。2,500件ぶんのキー名を繰り返すと
 * ファイルが数倍に膨らみ、アプリの起動が遅くなるため。
 */
import ExcelJS from 'exceljs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const INPUT = 'data/raw/seibunhyo_honhyo.xlsx';
const OUTPUT = 'assets/data/foods.json';
const UNITS_OUTPUT = 'assets/data/food-units.json';
const DATA_START_ROW = 13;

/** 出力する列と、Excel上の列番号の対応 */
const COLUMNS = [
  ['std_code', 2],
  ['group_code', 1],
  ['name', 4],
  ['refuse_pct', 5],
  ['kcal', 7],
  ['protein_g', 10],
  ['fat_g', 13],
  ['carb_g', 21],
  ['fiber_g', 19],
  ['salt_g', 61],
  // ビタミン
  ['vit_a_ug', 43], // レチノール活性当量
  ['vit_d_ug', 44],
  ['vit_e_mg', 45], // α-トコフェロール
  ['vit_k_ug', 49],
  ['vit_b1_mg', 50],
  ['vit_b2_mg', 51],
  ['niacin_mg', 53], // ナイアシン当量（食事摂取基準はこちらを基準にしている）
  ['vit_b6_mg', 54],
  ['vit_b12_ug', 55],
  ['folate_ug', 56],
  ['pantothenic_mg', 57],
  ['biotin_ug', 58],
  ['vit_c_mg', 59],
  // ミネラル
  ['sodium_mg', 24],
  ['potassium_mg', 25],
  ['calcium_mg', 26],
  ['magnesium_mg', 27],
  ['phosphorus_mg', 28],
  ['iron_mg', 29],
  ['zinc_mg', 30],
  ['copper_mg', 31],
  ['manganese_mg', 32],
  ['iodine_ug', 34],
  ['selenium_ug', 35],
  ['chromium_ug', 36],
  ['molybdenum_ug', 37],
];

/** セルの文字列表現を取り出す（書式付き文字列にも対応する） */
function cellText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((t) => t.text).join('');
    if (value.text !== undefined) return String(value.text);
    if (value.result !== undefined) return String(value.result);
    return '';
  }
  return String(value);
}

/**
 * 成分値を数値に変換する。
 * 成分表では次のような表記が使われている。
 *   「Tr」= 微量（0として扱う）
 *   「-」 = 未測定（0として扱う）
 *   「(12)」= 推定値（括弧を外して使う）
 */
function parseNutrient(value) {
  if (typeof value === 'number') return round(value);
  const text = cellText(value).trim().replace(/\s/g, '');
  if (text === '' || text === '-' || text === '−' || text === 'Tr' || text === '(Tr)') return 0;
  const matched = text.replace(/[()（）]/g, '').replace(/,/g, '');
  const num = Number(matched);
  return Number.isFinite(num) ? round(num) : 0;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

/**
 * 食品名を整える。
 * 成分表の名称は「こめ　［水稲めし］　精白米　うるち米」のように全角空白で区切られている。
 * 区切りは半角空白に統一し、検索しやすくする。
 */
function normalizeName(value) {
  return cellText(value)
    .replace(/[　\s]+/g, ' ')
    .trim();
}

/** 検索用のテキスト。区切りや記号を落として部分一致しやすくする */
function searchText(name) {
  return name.replace(/[\s［］\[\]（）()・,、]/g, '');
}

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(INPUT);
const sheet = workbook.getWorksheet('表全体');
if (!sheet) throw new Error('シート「表全体」が見つかりません');

const rows = [];
let skipped = 0;

for (let r = DATA_START_ROW; r <= sheet.rowCount; r++) {
  const row = sheet.getRow(r);
  const stdCode = cellText(row.getCell(2).value).trim();
  const name = normalizeName(row.getCell(4).value);

  // 食品番号が5桁の数字でない行（空行や注記）は飛ばす
  if (!/^\d{5}$/.test(stdCode) || name === '') {
    skipped++;
    continue;
  }

  const record = COLUMNS.map(([key, col]) => {
    const raw = row.getCell(col).value;
    if (key === 'std_code') return stdCode;
    if (key === 'group_code') return cellText(raw).trim().padStart(2, '0');
    if (key === 'name') return name;
    return parseNutrient(raw);
  });
  record.push(searchText(name));
  rows.push(record);
}

// ── よく使う食品の別名と常用単位を反映する ──
// 成分表の名称は「にわとり ［若どり・主品目］ むね 皮なし 生」のような形式で、
// 「鶏むね肉」「玉ねぎ」といった日常語では検索できない。別名を検索用テキストへ足して補う。
const common = JSON.parse(await readFile('data/common-foods.json', 'utf8'));
const codeIndex = new Map(rows.map((row) => [row[0], row]));
const kanaIndex = COLUMNS.length; // kana は最後に push した列
const nameIndex = COLUMNS.findIndex(([key]) => key === 'name');

const unitRows = [];
const missing = [];

for (const entry of common.foods) {
  const row = codeIndex.get(entry.code);
  if (!row) {
    missing.push(entry.code);
    continue;
  }
  // 別名は | で囲む。検索時に「別名そのものと一致した」を判定して上位に出すため
  row[kanaIndex] = `${row[kanaIndex]}|${entry.aliases.join('|')}|`;
  for (const [order, unit] of (entry.units ?? []).entries()) {
    unitRows.push([entry.code, unit.name, unit.grams, unit.purchase ? 1 : 0, order]);
  }
  console.log(`  ${entry.code} ${row[nameIndex]}  ← ${entry.aliases.join('/')}`);
}

if (missing.length > 0) {
  throw new Error(`common-foods.json に存在しない食品番号があります: ${missing.join(', ')}`);
}

const output = {
  source: '日本食品標準成分表（八訂）増補2023年（文部科学省）',
  generatedAt: new Date().toISOString().slice(0, 10),
  // 検索用の正規化テキストは foods.kana 列に入れる
  columns: [...COLUMNS.map(([key]) => key), 'kana'],
  rows,
};

await mkdir('assets/data', { recursive: true });
await writeFile(OUTPUT, JSON.stringify(output));
await writeFile(
  UNITS_OUTPUT,
  JSON.stringify({ columns: ['std_code', 'name', 'grams', 'is_purchase_unit', 'sort_order'], rows: unitRows })
);

console.log(`変換しました: ${rows.length}件（除外 ${skipped}行）`);
console.log(`別名を付けた食品: ${common.foods.length}件 / 常用単位: ${unitRows.length}件`);
console.log(`出力: ${OUTPUT}, ${UNITS_OUTPUT}`);
