/**
 * 端末の健康アプリからデータを取り込む。
 *
 * Android は Health Connect、iOS は HealthKit を使う。
 * どちらも他のアプリ（Google Fit、各メーカーの健康アプリ、スマートウォッチ）の
 * 歩数を集約しているので、ウォッチを持っていなくてもスマホの歩数が取れる。
 *
 * どちらもネイティブの機能なので Expo Go では動かない。
 * 読み込み時に落ちないよう、モジュールの読み込みと呼び出しをすべて包んであり、
 * 使えない環境では「使えない理由」を返して画面に案内を出す。
 */
import { Platform } from 'react-native';

import type { DayKey } from './day.ts';

export type HealthAvailability =
  | { available: true }
  | {
      available: false;
      reason: 'expo-go' | 'not-installed' | 'update-required' | 'unsupported';
    };

export type HealthDailyValues = {
  steps: number | null;
  distanceKm: number | null;
  activeKcal: number | null;
  totalKcal: number | null;
  exerciseMin: number | null;
  restingHr: number | null;
  sleepMin: number | null;
};

/** 取り込みたいデータの種類（Android） */
const READ_PERMISSIONS = [
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'Distance' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'read', recordType: 'TotalCaloriesBurned' },
  { accessType: 'read', recordType: 'ExerciseSession' },
  { accessType: 'read', recordType: 'RestingHeartRate' },
  { accessType: 'read', recordType: 'SleepSession' },
] as const;

/** 取り込みたいデータの種類（iOS） */
const HEALTHKIT_READ = [
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierBasalEnergyBurned',
  'HKQuantityTypeIdentifierAppleExerciseTime',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKCategoryTypeIdentifierSleepAnalysis',
] as const;

/** Health Connect が利用できる状態を表す値 */
const SDK_AVAILABLE = 3;
const SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED = 2;

type HealthConnectModule = typeof import('react-native-health-connect');
type HealthKitModule = typeof import('@kingstinct/react-native-healthkit');

/**
 * ネイティブモジュールを読み込む。
 * Expo Go では読み込めないので null を返す。
 */
function loadAndroid(): HealthConnectModule | null {
  if (Platform.OS !== 'android') return null;
  try {
    // 静的 import にすると、モジュールが無い環境でアプリ全体が起動できなくなる
    return require('react-native-health-connect') as HealthConnectModule;
  } catch {
    return null;
  }
}

function loadIos(): HealthKitModule | null {
  if (Platform.OS !== 'ios') return null;
  try {
    return require('@kingstinct/react-native-healthkit') as HealthKitModule;
  } catch {
    return null;
  }
}

export async function checkAvailability(): Promise<HealthAvailability> {
  if (Platform.OS === 'ios') {
    const module = loadIos();
    if (!module) return { available: false, reason: 'expo-go' };
    try {
      // iPad などヘルスケアを持たない端末がある
      return module.isHealthDataAvailable()
        ? { available: true }
        : { available: false, reason: 'unsupported' };
    } catch {
      return { available: false, reason: 'expo-go' };
    }
  }

  if (Platform.OS !== 'android') return { available: false, reason: 'unsupported' };

  const module = loadAndroid();
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
  const ios = loadIos();
  if (ios) {
    try {
      const granted = await ios.requestAuthorization({ toRead: HEALTHKIT_READ as never });
      // iOS は「どれを許可したか」をアプリに教えない仕様。
      // 要求が通ったかどうかしか分からないので、件数は要求した数で代用する
      return granted ? HEALTHKIT_READ.length : 0;
    } catch {
      return 0;
    }
  }

  const android = loadAndroid();
  if (!android) return 0;

  await android.initialize();
  // 型は本体側で厳密に定義されているが、ここでは定数配列を渡すだけなので合わせる
  const granted = await android.requestPermission(READ_PERMISSIONS as never);
  return granted.length;
}

export async function grantedPermissionCount(): Promise<number> {
  const ios = loadIos();
  if (ios) {
    try {
      // iOS は読み取り許可の状態を返さない（プライバシー保護のため）。
      // 実際に読めるかどうかは取得してみるまで分からないので、ここでは要求済みとみなす
      const status = await ios.getRequestStatusForAuthorization({
        toRead: HEALTHKIT_READ as never,
      });
      // 0 = 未要求。それ以外は一度は聞いている
      return status === 0 ? 0 : HEALTHKIT_READ.length;
    } catch {
      return 0;
    }
  }

  const android = loadAndroid();
  if (!android) return 0;
  try {
    await android.initialize();
    return (await android.getGrantedPermissions()).length;
  } catch {
    return 0;
  }
}

/** 健康アプリの設定画面を開く。iOS は端末の設定アプリから開くしかないので何もしない */
export function openHealthSettings(): void {
  loadAndroid()?.openHealthConnectSettings();
}

/**
 * 指定した論理日ぶんのデータを読む。
 * 集計の範囲は、アプリの1日の区切り時刻に合わせる。
 */
export async function readDailyHealth(
  date: DayKey,
  dayStartHour: number,
): Promise<HealthDailyValues | null> {
  const start = new Date(`${date}T00:00:00`);
  start.setHours(dayStartHour, 0, 0, 0);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  if (Platform.OS === 'ios') return readFromHealthKit(start, end);
  return readFromHealthConnect(start, end);
}

async function readFromHealthConnect(start: Date, end: Date): Promise<HealthDailyValues | null> {
  const module = loadAndroid();
  if (!module) return null;

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

async function readFromHealthKit(start: Date, end: Date): Promise<HealthDailyValues | null> {
  const module = loadIos();
  if (!module) return null;

  const filter = { date: { startDate: start, endDate: end } };

  /** 合計値を1つ取る。取れなければ null */
  const sum = async (identifier: string, unit: string): Promise<number | null> => {
    try {
      const result = await module.queryStatisticsForQuantity(
        identifier as never,
        ['cumulativeSum'],
        { filter, unit } as never,
      );
      const quantity = result.sumQuantity?.quantity;
      return typeof quantity === 'number' && Number.isFinite(quantity) ? quantity : null;
    } catch {
      return null;
    }
  };

  const average = async (identifier: string, unit: string): Promise<number | null> => {
    try {
      const result = await module.queryStatisticsForQuantity(
        identifier as never,
        ['discreteAverage'],
        { filter, unit } as never,
      );
      const quantity = result.averageQuantity?.quantity;
      return typeof quantity === 'number' && Number.isFinite(quantity) ? quantity : null;
    } catch {
      return null;
    }
  };

  try {
    const [steps, distanceKm, activeKcal, basalKcal, exerciseMin, restingHr, sleepMin] =
      await Promise.all([
        sum('HKQuantityTypeIdentifierStepCount', 'count'),
        sum('HKQuantityTypeIdentifierDistanceWalkingRunning', 'km'),
        sum('HKQuantityTypeIdentifierActiveEnergyBurned', 'kcal'),
        sum('HKQuantityTypeIdentifierBasalEnergyBurned', 'kcal'),
        sum('HKQuantityTypeIdentifierAppleExerciseTime', 'min'),
        average('HKQuantityTypeIdentifierRestingHeartRate', 'count/min'),
        readSleepMinutes(module, start, end),
      ]);

    // HealthKit には Android の「総消費」に当たる値がないので、
    // 基礎代謝ぶんと活動ぶんを足して同じ意味の数字にする
    const totalKcal =
      activeKcal == null && basalKcal == null ? null : (activeKcal ?? 0) + (basalKcal ?? 0);

    return { steps, distanceKm, activeKcal, totalKcal, exerciseMin, restingHr, sleepMin };
  } catch (error) {
    console.warn('ヘルスデータの取得に失敗しました', error);
    return null;
  }
}

/** 睡眠は区分データなので、眠っていた区間の長さを足し合わせる */
async function readSleepMinutes(
  module: HealthKitModule,
  start: Date,
  end: Date,
): Promise<number | null> {
  try {
    const samples = await module.queryCategorySamples(
      'HKCategoryTypeIdentifierSleepAnalysis' as never,
      { filter: { date: { startDate: start, endDate: end } } } as never,
    );
    if (samples.length === 0) return null;

    // 0 は「寝床にいた」で、実際に眠った区間ではない
    const asleep = samples.filter((sample) => sample.value !== 0);
    if (asleep.length === 0) return null;

    const minutes = asleep.reduce(
      (total, sample) =>
        total + (sample.endDate.getTime() - sample.startDate.getTime()) / 1000 / 60,
      0,
    );
    return minutes > 0 ? minutes : null;
  } catch {
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
    case 'expo-go':
      return 'Expo Goでは連携できません。専用のアプリをビルドすると使えるようになります。';
    case 'not-installed':
      return 'この端末に Health Connect が入っていません。Google Play から入れてください。';
    case 'update-required':
      return 'Health Connect の更新が必要です。Google Play から更新してください。';
    case 'unsupported':
      return 'この端末では健康データを取得できません。';
  }
}

/** 取得元の呼び名。画面の見出しに使う */
export const HEALTH_SOURCE_NAME = Platform.OS === 'ios' ? 'ヘルスケア' : 'Health Connect';
