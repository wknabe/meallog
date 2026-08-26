/**
 * 1日の区切りの扱い。
 *
 * 深夜0時30分に食べたものを前日として集計するため、区切り時刻（既定4時）を設けている。
 * 日別の集計はすべてこのファイルの関数を経由させ、判定を1箇所に閉じ込める。
 */
import { addDays as addDaysFn, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';

/** YYYY-MM-DD 形式の「論理日」 */
export type DayKey = string;

/** Dateオブジェクトを YYYY-MM-DD に変換する（ローカルタイム基準） */
export function toDayKey(date: Date): DayKey {
  return format(date, 'yyyy-MM-dd');
}

/** YYYY-MM-DD をその日の0時のDateに変換する */
export function fromDayKey(day: DayKey): Date {
  return parseISO(`${day}T00:00:00`);
}

/**
 * 実際の日時から論理日を求める。
 * 区切り時刻より前の時刻は前日として扱う。
 */
export function logicalDate(instant: Date, dayStartHour: number): DayKey {
  const shifted = new Date(instant.getTime());
  if (shifted.getHours() < dayStartHour) {
    shifted.setDate(shifted.getDate() - 1);
  }
  return toDayKey(shifted);
}

/** 今日の論理日 */
export function today(dayStartHour: number): DayKey {
  return logicalDate(new Date(), dayStartHour);
}

/** 論理日が実際には何時から何時までかを返す */
export function dayBounds(day: DayKey, dayStartHour: number): { start: Date; end: Date } {
  const start = fromDayKey(day);
  start.setHours(dayStartHour, 0, 0, 0);
  const end = addDaysFn(start, 1);
  return { start, end };
}

export function addDays(day: DayKey, amount: number): DayKey {
  return toDayKey(addDaysFn(fromDayKey(day), amount));
}

/** to − from の日数。to のほうが後なら正の値になる */
export function differenceInDays(to: DayKey, from: DayKey): number {
  return differenceInCalendarDays(fromDayKey(to), fromDayKey(from));
}

/** from から to までの日付を配列で返す（両端を含む） */
export function dateRange(from: DayKey, to: DayKey): DayKey[] {
  const days = differenceInCalendarDays(fromDayKey(to), fromDayKey(from));
  return Array.from({ length: days + 1 }, (_, i) => addDays(from, i));
}

/** 直近n日分の日付（今日を含む・古い順） */
export function recentDays(endDay: DayKey, count: number): DayKey[] {
  return dateRange(addDays(endDay, -(count - 1)), endDay);
}

/** 「5月28日(火)」形式 */
export function formatDayLabel(day: DayKey): string {
  return format(fromDayKey(day), 'M月d日(E)', { locale: ja });
}

/** 「2026年5月28日(木)」形式 */
export function formatDayLabelWithYear(day: DayKey): string {
  return format(fromDayKey(day), 'yyyy年M月d日(E)', { locale: ja });
}

/** 「5/28」形式（グラフの軸ラベル用） */
export function formatDayShort(day: DayKey): string {
  return format(fromDayKey(day), 'M/d');
}

/** 曜日1文字（グラフの軸ラベル用） */
export function formatWeekdayShort(day: DayKey): string {
  return format(fromDayKey(day), 'E', { locale: ja });
}

/** 「7:30」形式 */
export function formatTime(isoString: string): string {
  return format(parseISO(isoString), 'H:mm');
}

/** 生年月日から年齢を求める */
export function calcAge(birthDate: string, at: Date = new Date()): number {
  const birth = fromDayKey(birthDate);
  let age = at.getFullYear() - birth.getFullYear();
  const monthDiff = at.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && at.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}
