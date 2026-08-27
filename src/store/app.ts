/**
 * アプリ全体で共有する状態（プロフィール・設定・現在の体重）。
 * 画面ごとの一時的な状態はここに入れず、各画面のuseStateで持つ。
 */
import { create } from 'zustand';

import { getDatabase, initDatabase } from '@/db';
import { seedProductCatalog } from '@/db/seed/products';
import {
  getProfile,
  getSettings,
  saveProfile,
  saveSettings,
  DEFAULT_SETTINGS,
} from '@/db/repo/settings';
import { clearPhotoPaths } from '@/db/repo/meals';
import { getLatestWeight } from '@/db/repo/weights';
import { runAutoBackup } from '@/lib/backup';
import type { DayKey } from '@/lib/day';
import { syncTodayHealth } from '@/lib/health-sync';
import { purgeExpiredPhotos } from '@/lib/photos';
import type { Profile, Settings } from '@/lib/types';

type AppState = {
  /** DBの初期化と読み込みが終わったか */
  ready: boolean;
  /** 起動に失敗したときの内容。再試行の案内を出すために持つ */
  bootError: string | null;
  /** null ならオンボーディング未完了 */
  profile: Profile | null;
  settings: Settings;
  currentWeightKg: number | null;

  bootstrap: () => Promise<void>;
  refreshWeight: () => Promise<void>;
  updateProfile: (profile: Profile) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  /** 端末の健康アプリから今日ぶんを取り込む。取り込めたら true */
  syncHealth: (date: DayKey, options?: { force?: boolean }) => Promise<boolean>;
};

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  bootError: null,
  profile: null,
  settings: DEFAULT_SETTINGS,
  currentWeightKg: null,

  /**
   * DBを開き、プロフィールと設定を読み込む。
   * 失敗しても例外を投げず bootError に残し、画面から再試行できるようにする
   * （同梱データの投入で1度失敗しただけでアプリが真っ白のまま使えなくなるのを防ぐ）。
   */
  bootstrap: async () => {
    set({ bootError: null });
    try {
      await initDatabase();
      const [profile, settings, weight] = await Promise.all([
        getProfile(),
        getSettings(),
        getLatestWeight(),
      ]);
      set({
        ready: true,
        profile,
        settings,
        currentWeightKg: weight?.weightKg ?? null,
      });

      // 保存期間を過ぎた画像を消す。失敗しても起動は止めない
      try {
        const removed = [
          ...purgeExpiredPhotos('meal', settings.mealPhotoRetentionDays),
          ...purgeExpiredPhotos('label', settings.labelPhotoRetentionDays),
        ];
        // 実ファイルを消したら参照も外す。残すと中身のない枠が表示され続ける
        await clearPhotoPaths(removed);
      } catch (error) {
        console.warn('期限切れ画像の削除に失敗しました', error);
      }

      // 市販商品のカタログを裏で入れる。4千件あるので起動を待たせない。
      // 途中で閉じられても、次の起動で続きから入る
      void seedProductCatalog(getDatabase()).catch((error) =>
        console.warn('商品カタログの投入に失敗しました', error),
      );

      // 週1回、端末内に記録データを書き出しておく（アプリ側の不具合からの復旧用）。
      // 起動を待たせないよう、結果は待たずに進める
      void runAutoBackup(settings.lastAutoBackupAt)
        .then(async (uri) => {
          if (uri == null) return;
          const next = { ...settings, lastAutoBackupAt: new Date().toISOString() };
          await saveSettings(next);
          set({ settings: next });
        })
        .catch((error) => console.warn('自動バックアップに失敗しました', error));
    } catch (error) {
      console.error('起動処理に失敗しました', error);
      set({
        ready: false,
        bootError: error instanceof Error ? error.message : String(error),
      });
    }
  },

  refreshWeight: async () => {
    const weight = await getLatestWeight();
    set({ currentWeightKg: weight?.weightKg ?? null });
  },

  updateProfile: async (profile) => {
    await saveProfile(profile);
    set({ profile });
  },

  updateSettings: async (patch) => {
    const next = { ...get().settings, ...patch };
    await saveSettings(next);
    set({ settings: next });
  },

  syncHealth: async (date, options = {}) => {
    const result = await syncTodayHealth(date, get().settings, options);
    if (!result.synced) return false;
    // 取り込めたときだけ時刻を残す。失敗を成功として記録すると次の機会を潰してしまう
    await get().updateSettings({ lastHealthSyncAt: result.lastSyncAt });
    return true;
  },
}));
