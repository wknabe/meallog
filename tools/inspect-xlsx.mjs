import ExcelJS from 'exceljs';
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile('data/raw/seibunhyo_honhyo.xlsx');
const ws = wb.getWorksheet('表全体');
const clean = (v) => (v === null || v === undefined ? '' : String(typeof v === 'object' && v.richText ? v.richText.map(t=>t.text).join('') : v).replace(/\s+/g, ''));

// 見出しは複数行にまたがるので、行4〜9を連結して列の意味を作る
console.log('--- 列の見出し（行4〜9を連結）---');
for (let c = 1; c <= ws.columnCount; c++) {
  const parts = [];
  for (let r = 4; r <= 9; r++) {
    const t = clean(ws.getRow(r).getCell(c).value);
    if (t && !parts.includes(t)) parts.push(t);
  }
  console.log(`${c}: ${parts.join('|')}`);
}
console.log('--- データ開始行を探す ---');
for (let r = 10; r <= 16; r++) {
  const row = ws.getRow(r);
  console.log(`R${r}:`, [1,2,3,4,5,6,7,8,10,13,19,21].map(c=>clean(row.getCell(c).value)).join(' / '));
}
