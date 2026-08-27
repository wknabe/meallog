/**
 * スマートウォッチのデータ取り込み（Android の Health Connect）。
 *
 * Health Connect はネイティブの機能なので Expo Go では動かない。
 * 読み込み時に落ちないよう、モジュールの読み込みと呼び出しをすべて包んであり、
 * 使えない環境では「使えない理由」を返して画面に案内を出す。
 *
 * iOS（HealthKit）は Apple Developer への登録が必要なため、まだ対応していない。
 */
import { Platform } from 'react-native';

import type { DayKey } from './day.ts';

export type HealthAvailability =
  | { available: true }
  | { available: false; reason: 'ios' | 'expo-go' | 'not-installed' | 'update-required' };

export type HealthDailyValues = {
  steps: number | null;
  distanceKm: number | null;
  activeKcal: number | null;
  totalKcal: number | null;
  exerciseMin: number | null;
  restingHr: number | null;
  sleepMin: number | null;
};

/** 取り込みたいデータの種類 */
const READ_PERMISSIONS = [
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'Distance' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'read', recordType: 'TotalCaloriesBurned' },
  { accessType: 'read', recordType: 'ExerciseSession' },
  { accessType: 'read', recordType: 'RestingHeartRate' },
  { accessType: 'read', recordType: 'SleepSession' },
] as const;

/** Health Connect が利用できる状態を表す値 */
const SDK_AVAILABLE = 3;
const SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED = 2;

type HealthConnectModule = typeof import('react-native-health-connect');

/**
 * ネイティブモジュールを読み込む。
 * Expo Go や iOS では読み込めないので null を返す。
 */
function loadModule(): HealthConnectModule | null {
  if (Platform.OS !== 'android') return null;
  try {
    // 静的 import にすると、モジュールが無い環境でアプリ全体が起動できなくなる
    return require('react-native-health-connect') as HealthConnectModule;
  } catch {
    return null;
  }
}

export async function checkAvailability(): Promise<HealthAvailability> {
  if (Platform.OS === 'ios') return { available: false, reason: 'ios' };

  const module = loadModule();
  if (!module) return { available: false, reason: 'expo-go' };

  try {
    const status = await module.getSdkStatus();
    if (status === SDK_AVAILABLE) return { available: true };
    if (status === SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
      return { available: false, reason: 'update-required' };
    }
    return { available: false, reason: 'not-installed' };
  } catch {
    // ネイティブ側が無い（Expo Go）と、この呼び出しで例外になる
    return { available: false, reason: 'expo-go' };
  }
}

/** 権限を要求する。許可された種類の数を返す */
export async function requestHealthPermissions(): Promise<number> {
  const module = loadModule();
  if (!module) return 0;

  await module.initialize();
  // 型は本体側で厳密に定義されているが、ここでは定数配列を渡すだけなので合わせる
  const granted = await module.requestPermission(READ_PERMISSIONS as never);
  return granted.length;
}

export async function grantedPermissionCount(): Promise<number> {
  const module = loadModule();
  if (!module) return 0;
  try {
    await module.initialize();
    return (await module.getGrantedPermissions()).length;
  } catch {
    return 0;
  }
}

/** Health Connect の設定画面を開く */
export function openHealthSettings(): void {
  loadModule()?.openHealthConnectSettings();
}

/**
 * 指定した論理日ぶんのデータを読む。
 * 集計の範囲は、アプリの1日の区切り時刻に合わせる。
 */
export async function readDailyHealth(
  date: DayKey,
  dayStartHour: number,
): Promise<HealthDailyValues | null> {
  const module = loadModule();
  if (!module) return null;

  const start = new Date(`${date}T00:00:00`);
  start.setHours(dayStartHour, 0, 0, 0);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  const timeRangeFilter = {
    operator: 'between' as const,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  };

  try {
    await module.initialize();

    // 種類ごとに失敗しうるので、1つ落ちても他は取れるようにする
    const read = async <T>(fn: () => Promise<T>): Promise<T | null> => {
      try {
        return await fn();
      } catch {
        return null;
      }
    };

    const [steps, distance, active, total, exercise, restingHr, sleep] = await Promise.all([
      read(() => module.aggregateRecord({ recordType: 'Steps', timeRangeFilter })),
      read(() => module.aggregateRecord({ recordType: 'Distance', timeRangeFilter })),
      read(() => module.aggregateRecord({ recordType: 'ActiveCaloriesBurned', timeRangeFilter })),
      read(() => module.aggregateRecord({ recordType: 'TotalCaloriesBurned', timeRangeFilter })),
      read(() => module.aggregateRecord({ recordType: 'ExerciseSession', timeRangeFilter })),
      read(() => module.aggregateRecord({ recordType: 'RestingHeartRate', timeRangeFilter })),
      read(() => module.aggregateRecord({ recordType: 'SleepSession', timeRangeFilter })),
    ]);

    return {
      steps: pickNumber(steps, 'COUNT_TOTAL'),
      distanceKm: toKm(pickUnit(distance, 'DISTANCE')),
      activeKcal: toKcal(pickUnit(active, 'ENERGY_TOTAL')),
      totalKcal: toKcal(pickUnit(total, 'ENERGY_TOTAL')),
      exerciseMin: toMinutes(pickNumber(exercise, 'EXERCISE_DURATION_TOTAL')),
      restingHr: pickNumber(restingHr, 'BPM_AVG'),
      sleepMin: toMinutes(pickNumber(sleep, 'SLEEP_DURATION_TOTAL')),
    };
  } catch (error) {
    console.warn('ヘルスデータの取得に失敗しました', error);
    return null;
  }
}

/** 集計結果から数値を取り出す。項目が無ければ null */
function pickNumber(result: unknown, key: string): number | null {
  if (result == null || typeof result !== 'object') return null;
  const value = (result as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** 距離やエネルギーは { inMeters } のような単位つきの形で返ってくる */
function pickUnit(result: unknown, key: string): Record<string, unknown> | null {
  if (result == null || typeof result !== 'object') return null;
  const value = (result as Record<string, unknown>)[key];
  return value != null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function toKm(value: Record<string, unknown> | null): number | null {
  if (!value) return null;
  if (typeof value.inKilometers === 'number') return value.inKilometers;
  if (typeof value.inMeters === 'number') return value.inMeters / 1000;
  return null;
}

function toKcal(value: Record<string, unknown> | null): number | null {
  if (!value) return null;
  if (typeof value.inKilocalories === 'number') return value.inKilocalories;
  if (typeof value.inCalories === 'number') return value.inCalories / 1000;
  return null;
}

/** Health Connect の時間はミリ秒または秒で返るため、分に直す */
function toMinutes(value: number | null): number | null {
  if (value == null) return null;
  // 1日を超える値はミリ秒とみなす
  return value > 24 * 60 * 60 ? value / 1000 / 60 : value / 60;
}

/** 画面に出す案内文 */
export function availabilityMessage(availability: HealthAvailability): string {
  if (availability.available) return '連携できます';
  switch (availability.reason) {
    case 'ios':
      return 'iPhoneのヘルスケア連携は準備中です。Androidでは Health Connect と連携できます。';
    case 'expo-go':
      return 'Expo Goでは連携できません。専用のアプリをビルドすると使えるようになります。';
    case 'not-installed':
      return 'この端末に Health Connect が入っていません。Google Play から入れてください。';
    case 'update-required':
      return 'Health Connect の更新が必要です。Google Play から更新してください。';
  }
}
