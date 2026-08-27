/**
 * 端末の健康アプリからの自動取り込み。
 *
 * 手で「取り込む」を押すのを忘れると歩数が入らないままになるので、
 * アプリを開いたときに裏で取りに行く。
 * ただし画面を切り替えるたびに読みに行くと重いので、間隔を空ける。
 */
import { saveHealthDaily } from '@/db/repo/activities';
import type { DayKey } from '@/lib/day';
import { checkAvailability, grantedPermissionCount, readDailyHealth } from '@/lib/health';
import type { Settings } from '@/lib/types';

/** 前回の取り込みからこれだけ経っていれば、また取りに行く */
const MIN_INTERVAL_MS = 15 * 60 * 1000;

export type SyncResult =
  | { synced: true; lastSyncAt: string }
  | { synced: false; reason: 'disabled' | 'too-soon' | 'unavailable' | 'not-granted' | 'no-data' };

/**
 * 今日ぶんを取り込む。
 * 自動取り込みは「できなければ黙って諦める」のが正しいので、
 * 失敗の理由は返すだけで、画面に出すかどうかは呼び出し側が決める。
 */
export async function syncTodayHealth(
  date: DayKey,
  settings: Settings,
  options: { force?: boolean } = {},
): Promise<SyncResult> {
  if (!options.force && !settings.autoSyncHealth) return { synced: false, reason: 'disabled' };

  if (!options.force && settings.lastHealthSyncAt != null) {
    const elapsed = Date.now() - new Date(settings.lastHealthSyncAt).getTime();
    // 端末の時計が戻された場合に永久に同期しなくならないよう、負の値は経過とみなす
    if (elapsed >= 0 && elapsed < MIN_INTERVAL_MS) return { synced: false, reason: 'too-soon' };
  }

  const availability = await checkAvailability();
  if (!availability.available) return { synced: false, reason: 'unavailable' };

  // 権限を求めるのは利用者が明示的に操作したときだけ。
  // 起動のたびに許可を聞かれるのは煩わしいので、自動取り込みでは聞かない
  if ((await grantedPermissionCount()) === 0) return { synced: false, reason: 'not-granted' };

  const values = await readDailyHealth(date, settings.dayStartHour);
  if (values == null) return { synced: false, reason: 'no-data' };

  await saveHealthDaily(date, values, options.force ? 'manual' : 'auto');

  // 取り込んだ時刻の保存は呼び出し側（ストア）に任せる。
  // ここで設定を書くと、画面が持っている設定と食い違ってしまう
  return { synced: true, lastSyncAt: new Date().toISOString() };
}
