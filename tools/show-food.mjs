import { readFile } from 'node:fs/promises';
const seed = JSON.parse(await readFile('assets/data/foods.json', 'utf8'));
const i = (k) => seed.columns.indexOf(k);
for (const code of process.argv.slice(2)) {
  const r = seed.rows.find((row) => row[i('std_code')] === code);
  console.log(code, r ? `${r[i('name')]} | ${r[i('kcal')]}kcal P${r[i('protein_g')]} F${r[i('fat_g')]} C${r[i('carb_g')]}` : '見つかりません');
}
