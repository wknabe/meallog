/** 運動記録（手入力）の読み書き */
import { getDatabase } from '@/db';
import type { DayKey } from '@/lib/day';
import type { ExerciseDraft, ExerciseSet } from '@/lib/equipment';
import type { ActivityType } from '@/lib/types';

export type Activity = {
  id: number;
  date: DayKey;
  type: ActivityType;
  name: string | null;
  durationMin: number | null;
  distanceKm: number | null;
  reps: number | null;
  sets: number | null;
  kcal: number | null;
  memo: string | null;
};

export type ActivityInput = Omit<Activity, 'id'>;

type ActivityRow = {
  id: number;
  date: string;
  type: string;
  name: string | null;
  duration_min: number | null;
  distance_km: number | null;
  reps: number | null;
  sets: number | null;
  kcal: number | null;
  memo: string | null;
};

const toActivity = (row: ActivityRow): Activity => ({
  id: row.id,
  date: row.date,
  type: row.type as ActivityType,
  name: row.name,
  durationMin: row.duration_min,
  distanceKm: row.distance_km,
  reps: row.reps,
  sets: row.sets,
  kcal: row.kcal,
  memo: row.memo,
});

export async function createActivity(input: ActivityInput): Promise<number> {
  const db = getDatabase();
  const result = await db.runAsync(
    `INSERT INTO activities (date, type, name, duration_min, distance_km, reps, sets, kcal, memo, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      input.date,
      input.type,
      input.name,
      input.durationMin,
      input.distanceKm,
      input.reps,
      input.sets,
      input.kcal,
      input.memo,
      new Date().toISOString(),
    ],
  );
  return result.lastInsertRowId;
}

export async function listActivities(date: DayKey): Promise<Activity[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<ActivityRow>(
    'SELECT * FROM activities WHERE date = ? ORDER BY id ASC;',
    [date],
  );
  return rows.map(toActivity);
}

export async function listActivitiesInRange(from: DayKey, to: DayKey): Promise<Activity[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<ActivityRow>(
    'SELECT * FROM activities WHERE date BETWEEN ? AND ? ORDER BY date DESC, id DESC;',
    [from, to],
  );
  return rows.map(toActivity);
}

export async function deleteActivity(id: number): Promise<void> {
  const db = getDatabase();
  await db.runAsync('DELETE FROM activities WHERE id = ?;', [id]);
}

// ── 筋トレの種目別記録 ────────────────────────────

/**
 * 1回のトレーニングに、種目とそのセットをまとめて保存する。
 * 種目だけ入って中身が無い、といった中途半端な形が残らないよう、
 * 呼び出し側が開いたトランザクションの接続を受け取れるようにしている。
 */
export async function saveExercises(activityId: number, exercises: ExerciseDraft[]): Promise<void> {
  const db = getDatabase();
  await db.withExclusiveTransactionAsync(async (txn) => {
    // 作り直しの形にする。編集で種目が減った場合にも対応できる
    await txn.runAsync('DELETE FROM activity_exercises WHERE activity_id = ?;', [activityId]);

    const now = new Date().toISOString();
    for (const [index, exercise] of exercises.entries()) {
      const filled = exercise.sets.filter((set) => (set.reps ?? 0) > 0 || (set.weightKg ?? 0) > 0);
      if (exercise.name.trim() === '' && filled.length === 0) continue;

      const result = await txn.runAsync(
        `INSERT INTO activity_exercises (activity_id, equipment_key, name, position, created_at)
         VALUES (?, ?, ?, ?, ?);`,
        [activityId, exercise.equipmentKey, exercise.name.trim(), index, now],
      );
      for (const [setIndex, set] of filled.entries()) {
        await txn.runAsync(
          `INSERT INTO activity_sets (exercise_id, position, weight_kg, reps)
           VALUES (?, ?, ?, ?);`,
          [result.lastInsertRowId, setIndex, set.weightKg, set.reps],
        );
      }
    }
  });
}

export type ExerciseRecord = {
  id: number;
  equipmentKey: string | null;
  name: string;
  sets: ExerciseSet[];
};

export async function listExercises(activityId: number): Promise<ExerciseRecord[]> {
  const db = getDatabase();
  const exercises = await db.getAllAsync<{
    id: number;
    equipment_key: string | null;
    name: string;
  }>(
    'SELECT id, equipment_key, name FROM activity_exercises WHERE activity_id = ? ORDER BY position ASC;',
    [activityId],
  );
  if (exercises.length === 0) return [];

  const placeholders = exercises.map(() => '?').join(',');
  const sets = await db.getAllAsync<{
    exercise_id: number;
    weight_kg: number | null;
    reps: number | null;
  }>(
    `SELECT exercise_id, weight_kg, reps FROM activity_sets
     WHERE exercise_id IN (${placeholders}) ORDER BY position ASC;`,
    exercises.map((row) => row.id),
  );

  const byExercise = new Map<number, ExerciseSet[]>();
  for (const row of sets) {
    const list = byExercise.get(row.exercise_id) ?? [];
    list.push({ weightKg: row.weight_kg, reps: row.reps });
    byExercise.set(row.exercise_id, list);
  }

  return exercises.map((row) => ({
    id: row.id,
    equipmentKey: row.equipment_key,
    name: row.name,
    sets: byExercise.get(row.id) ?? [],
  }));
}

/**
 * ある種目の前回の記録を探す。「前回より上がったか」を出すために使う。
 * 同じ日の記録は比較対象にしない（同じトレーニングの続きなので）。
 */
export async function findPreviousExercise(
  equipmentKey: string,
  beforeDate: DayKey,
): Promise<{ date: DayKey; sets: ExerciseSet[] } | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ id: number; date: string }>(
    `SELECT e.id, a.date FROM activity_exercises e
     JOIN activities a ON a.id = e.activity_id
     WHERE e.equipment_key = ? AND a.date < ?
     ORDER BY a.date DESC, e.id DESC LIMIT 1;`,
    [equipmentKey, beforeDate],
  );
  if (!row) return null;

  const sets = await db.getAllAsync<{ weight_kg: number | null; reps: number | null }>(
    'SELECT weight_kg, reps FROM activity_sets WHERE exercise_id = ? ORDER BY position ASC;',
    [row.id],
  );
  return {
    date: row.date,
    sets: sets.map((set) => ({ weightKg: set.weight_kg, reps: set.reps })),
  };
}

// ── GPSの軌跡 ────────────────────────────────────

export type TrackPoint = { lat: number; lng: number; recordedAt: string };

export async function saveTrack(activityId: number, points: TrackPoint[]): Promise<void> {
  if (points.length === 0) return;
  const db = getDatabase();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('DELETE FROM activity_tracks WHERE activity_id = ?;', [activityId]);
    for (const [index, point] of points.entries()) {
      await txn.runAsync(
        `INSERT INTO activity_tracks (activity_id, position, lat, lng, recorded_at)
         VALUES (?, ?, ?, ?, ?);`,
        [activityId, index, point.lat, point.lng, point.recordedAt],
      );
    }
  });
}

export async function listTrack(activityId: number): Promise<TrackPoint[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<{ lat: number; lng: number; recorded_at: string }>(
    'SELECT lat, lng, recorded_at FROM activity_tracks WHERE activity_id = ? ORDER BY position ASC;',
    [activityId],
  );
  return rows.map((row) => ({ lat: row.lat, lng: row.lng, recordedAt: row.recorded_at }));
}

/** その日の運動による消費カロリーの合計 */
export async function getActivityKcal(date: DayKey): Promise<number> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ total: number | null }>(
    'SELECT SUM(kcal) AS total FROM activities WHERE date = ?;',
    [date],
  );
  return row?.total ?? 0;
}

/** 期間内の日別の運動消費カロリー */
export async function listDailyActivityKcal(
  from: DayKey,
  to: DayKey,
): Promise<{ date: DayKey; kcal: number }[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<{ date: string; kcal: number | null }>(
    `SELECT date, SUM(kcal) AS kcal FROM activities
     WHERE date BETWEEN ? AND ?
     GROUP BY date ORDER BY date ASC;`,
    [from, to],
  );
  return rows.map((row) => ({ date: row.date, kcal: row.kcal ?? 0 }));
}

// ── スマートウォッチ由来のデータ（フェーズ6で書き込む）──

export type HealthDaily = {
  date: DayKey;
  steps: number | null;
  distanceKm: number | null;
  activeKcal: number | null;
  totalKcal: number | null;
  exerciseMin: number | null;
  restingHr: number | null;
  sleepMin: number | null;
  source: string | null;
};

export async function getHealthDaily(date: DayKey): Promise<HealthDaily | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{
    date: string;
    steps: number | null;
    distance_km: number | null;
    active_kcal: number | null;
    total_kcal: number | null;
    exercise_min: number | null;
    resting_hr: number | null;
    sleep_min: number | null;
    source: string | null;
  }>('SELECT * FROM health_daily WHERE date = ?;', [date]);
  if (!row) return null;
  return {
    date: row.date,
    steps: row.steps,
    distanceKm: row.distance_km,
    activeKcal: row.active_kcal,
    totalKcal: row.total_kcal,
    exerciseMin: row.exercise_min,
    restingHr: row.resting_hr,
    sleepMin: row.sleep_min,
    source: row.source,
  };
}

/** 期間内のスマートウォッチ由来データ */
export async function listHealthDaily(from: DayKey, to: DayKey): Promise<HealthDaily[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<{
    date: string;
    steps: number | null;
    distance_km: number | null;
    active_kcal: number | null;
    total_kcal: number | null;
    exercise_min: number | null;
    resting_hr: number | null;
    sleep_min: number | null;
    source: string | null;
  }>('SELECT * FROM health_daily WHERE date BETWEEN ? AND ? ORDER BY date ASC;', [from, to]);
  return rows.map((row) => ({
    date: row.date,
    steps: row.steps,
    distanceKm: row.distance_km,
    activeKcal: row.active_kcal,
    totalKcal: row.total_kcal,
    exerciseMin: row.exercise_min,
    restingHr: row.resting_hr,
    sleepMin: row.sleep_min,
    source: row.source,
  }));
}

/**
 * スマートウォッチから取り込んだ1日ぶんのデータを保存する。
 * 推定値とは別テーブルに入れ、合算しない（企画書の方針をテーブルで担保している）。
 */
export async function saveHealthDaily(
  date: DayKey,
  values: Omit<HealthDaily, 'date' | 'source'>,
  source: string,
): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    `INSERT INTO health_daily
       (date, steps, distance_km, active_kcal, total_kcal, exercise_min, resting_hr, sleep_min, source, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       steps = excluded.steps,
       distance_km = excluded.distance_km,
       active_kcal = excluded.active_kcal,
       total_kcal = excluded.total_kcal,
       exercise_min = excluded.exercise_min,
       resting_hr = excluded.resting_hr,
       sleep_min = excluded.sleep_min,
       source = excluded.source,
       synced_at = excluded.synced_at;`,
    [
      date,
      values.steps,
      values.distanceKm,
      values.activeKcal,
      values.totalKcal,
      values.exerciseMin,
      values.restingHr,
      values.sleepMin,
      source,
      new Date().toISOString(),
    ],
  );
}
