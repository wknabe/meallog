/** 体重の読み書き。1日1件で、同じ日に再入力すると上書きになる */
import { getDatabase } from '@/db';
import type { DayKey } from '@/lib/day';

export type WeightRecord = {
  date: DayKey;
  weightKg: number;
  bodyFatPct: number | null;
  recordedAt: string;
};

type WeightRow = {
  date: string;
  weight_kg: number;
  body_fat_pct: number | null;
  recorded_at: string;
};

const toRecord = (row: WeightRow): WeightRecord => ({
  date: row.date,
  weightKg: row.weight_kg,
  bodyFatPct: row.body_fat_pct,
  recordedAt: row.recorded_at,
});

export async function saveWeight(record: {
  date: DayKey;
  weightKg: number;
  bodyFatPct?: number | null;
}): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    `INSERT INTO weights (date, weight_kg, body_fat_pct, recorded_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       weight_kg = excluded.weight_kg,
       body_fat_pct = excluded.body_fat_pct,
       recorded_at = excluded.recorded_at;`,
    [record.date, record.weightKg, record.bodyFatPct ?? null, new Date().toISOString()]
  );
}

export async function getWeight(date: DayKey): Promise<WeightRecord | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<WeightRow>('SELECT * FROM weights WHERE date = ?;', [date]);
  return row ? toRecord(row) : null;
}

/** 指定日以前で最も新しい体重。ホーム画面や目標算出で「現在の体重」として使う */
export async function getLatestWeight(onOrBefore?: DayKey): Promise<WeightRecord | null> {
  const db = getDatabase();
  const row = onOrBefore
    ? await db.getFirstAsync<WeightRow>(
        'SELECT * FROM weights WHERE date <= ? ORDER BY date DESC LIMIT 1;',
        [onOrBefore]
      )
    : await db.getFirstAsync<WeightRow>('SELECT * FROM weights ORDER BY date DESC LIMIT 1;');
  return row ? toRecord(row) : null;
}

export async function listWeights(from: DayKey, to: DayKey): Promise<WeightRecord[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<WeightRow>(
    'SELECT * FROM weights WHERE date BETWEEN ? AND ? ORDER BY date ASC;',
    [from, to]
  );
  return rows.map(toRecord);
}

export async function deleteWeight(date: DayKey): Promise<void> {
  const db = getDatabase();
  await db.runAsync('DELETE FROM weights WHERE date = ?;', [date]);
}
