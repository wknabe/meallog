import { readFile } from 'node:fs/promises';
const seed = JSON.parse(await readFile('assets/data/foods.json', 'utf8'));
const i = (k) => seed.columns.indexOf(k);
const limit = Number(process.env.LIMIT ?? 4);
for (const q of process.argv.slice(2)) {
  const key = q.replace(/\s/g, '');
  const hits = seed.rows.filter((r) => r[i('kana')].includes(key));
  console.log(`# ${q} (${hits.length})`);
  hits
    .slice(0, limit)
    .forEach((r) => console.log(`  ${r[i('std_code')]} ${r[i('name')]} ${r[i('kcal')]}`));
}
