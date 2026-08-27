/** プロフィールと設定の読み書き（どちらも単一行テーブル） */
import { getDatabase } from '@/db';
import type {
  ActivityLevel,
  AdjustmentDistribution,
  BurnSource,
  Gender,
  Profile,
  Settings,
} from '@/lib/types';

type ProfileRow = {
  gender: string;
  birth_date: string;
  height_cm: number;
  activity_level: number;
  target_weight_kg: number | null;
  target_date: string | null;
  target_kcal: number;
  target_protein_g: number;
  target_fat_g: number;
  target_carb_g: number;
  targets_overridden: number;
};

export const DEFAULT_SETTINGS: Settings = {
  dayStartHour: 4,
  adjustmentEnabled: true,
  adjustmentDays: 7,
  adjustmentCapPct: 15,
  adjustmentDistribution: 'even',
  burnSource: 'estimate',
  addExerciseToTarget: false,
  exerciseAddRatio: 100,
  mealPhotoRetentionDays: 0,
  labelPhotoRetentionDays: 180,
  showMets: false,
  autoSyncHealth: true,
  countStepsAsBurn: true,
  lastHealthSyncAt: null,
  lastBackupAt: null,
  lastAutoBackupAt: null,
};

export async function getProfile(): Promise<Profile | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<ProfileRow>('SELECT * FROM profile WHERE id = 1;');
  if (!row) return null;
  return {
    gender: row.gender as Gender,
    birthDate: row.birth_date,
    heightCm: row.height_cm,
    activityLevel: row.activity_level as ActivityLevel,
    targetWeightKg: row.target_weight_kg,
    targetDate: row.target_date,
    targetKcal: row.target_kcal,
    targetProteinG: row.target_protein_g,
    targetFatG: row.target_fat_g,
    targetCarbG: row.target_carb_g,
    targetsOverridden: row.targets_overridden === 1,
  };
}

export async function saveProfile(profile: Profile): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO profile (
       id, gender, birth_date, height_cm, activity_level,
       target_weight_kg, target_date,
       target_kcal, target_protein_g, target_fat_g, target_carb_g,
       targets_overridden, created_at, updated_at
     ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       gender = excluded.gender,
       birth_date = excluded.birth_date,
       height_cm = excluded.height_cm,
       activity_level = excluded.activity_level,
       target_weight_kg = excluded.target_weight_kg,
       target_date = excluded.target_date,
       target_kcal = excluded.target_kcal,
       target_protein_g = excluded.target_protein_g,
       target_fat_g = excluded.target_fat_g,
       target_carb_g = excluded.target_carb_g,
       targets_overridden = excluded.targets_overridden,
       updated_at = excluded.updated_at;`,
    [
      profile.gender,
      profile.birthDate,
      profile.heightCm,
      profile.activityLevel,
      profile.targetWeightKg,
      profile.targetDate,
      profile.targetKcal,
      profile.targetProteinG,
      profile.targetFatG,
      profile.targetCarbG,
      profile.targetsOverridden ? 1 : 0,
      now,
      now,
    ],
  );
}

type SettingsRow = {
  day_start_hour: number;
  adjustment_enabled: number;
  adjustment_days: number;
  adjustment_cap_pct: number;
  adjustment_distribution: string;
  burn_source: string;
  add_exercise_to_target: number;
  exercise_add_ratio: number;
  meal_photo_retention_days: number;
  label_photo_retention_days: number;
  show_mets: number;
  auto_sync_health: number;
  count_steps_as_burn: number;
  last_health_sync_at: string | null;
  last_backup_at: string | null;
  last_auto_backup_at: string | null;
};

/** 設定を取得する。まだ行がなければ既定値で作成する */
export async function getSettings(): Promise<Settings> {
  const db = getDatabase();
  const row = await db.getFirstAsync<SettingsRow>('SELECT * FROM settings WHERE id = 1;');
  if (!row) {
    await saveSettings(DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }
  return {
    dayStartHour: row.day_start_hour,
    adjustmentEnabled: row.adjustment_enabled === 1,
    adjustmentDays: row.adjustment_days,
    adjustmentCapPct: row.adjustment_cap_pct,
    adjustmentDistribution: row.adjustment_distribution as AdjustmentDistribution,
    burnSource: row.burn_source as BurnSource,
    addExerciseToTarget: row.add_exercise_to_target === 1,
    exerciseAddRatio: row.exercise_add_ratio,
    mealPhotoRetentionDays: row.meal_photo_retention_days,
    labelPhotoRetentionDays: row.label_photo_retention_days,
    showMets: row.show_mets === 1,
    autoSyncHealth: row.auto_sync_health === 1,
    countStepsAsBurn: row.count_steps_as_burn === 1,
    lastHealthSyncAt: row.last_health_sync_at,
    lastBackupAt: row.last_backup_at,
    lastAutoBackupAt: row.last_auto_backup_at,
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    `INSERT INTO settings (
       id, day_start_hour,
       adjustment_enabled, adjustment_days, adjustment_cap_pct, adjustment_distribution,
       burn_source, add_exercise_to_target, exercise_add_ratio,
       meal_photo_retention_days, label_photo_retention_days, show_mets,
       auto_sync_health, count_steps_as_burn, last_health_sync_at,
       last_backup_at, last_auto_backup_at, updated_at
     ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       day_start_hour = excluded.day_start_hour,
       adjustment_enabled = excluded.adjustment_enabled,
       adjustment_days = excluded.adjustment_days,
       adjustment_cap_pct = excluded.adjustment_cap_pct,
       adjustment_distribution = excluded.adjustment_distribution,
       burn_source = excluded.burn_source,
       add_exercise_to_target = excluded.add_exercise_to_target,
       exercise_add_ratio = excluded.exercise_add_ratio,
       meal_photo_retention_days = excluded.meal_photo_retention_days,
       label_photo_retention_days = excluded.label_photo_retention_days,
       show_mets = excluded.show_mets,
       auto_sync_health = excluded.auto_sync_health,
       count_steps_as_burn = excluded.count_steps_as_burn,
       last_health_sync_at = excluded.last_health_sync_at,
       last_backup_at = excluded.last_backup_at,
       last_auto_backup_at = excluded.last_auto_backup_at,
       updated_at = excluded.updated_at;`,
    [
      settings.dayStartHour,
      settings.adjustmentEnabled ? 1 : 0,
      settings.adjustmentDays,
      settings.adjustmentCapPct,
      settings.adjustmentDistribution,
      settings.burnSource,
      settings.addExerciseToTarget ? 1 : 0,
      settings.exerciseAddRatio,
      settings.mealPhotoRetentionDays,
      settings.labelPhotoRetentionDays,
      settings.showMets ? 1 : 0,
      settings.autoSyncHealth ? 1 : 0,
      settings.countStepsAsBurn ? 1 : 0,
      settings.lastHealthSyncAt,
      settings.lastBackupAt,
      settings.lastAutoBackupAt,
      new Date().toISOString(),
    ],
  );
}
