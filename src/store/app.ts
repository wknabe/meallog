/**
 * アプリ全体で共有する状態（プロフィール・設定・現在の体重）。
 * 画面ごとの一時的な状態はここに入れず、各画面のuseStateで持つ。
 */
import { create } from 'zustand';

import { initDatabase } from '@/db';
import { getProfile, getSettings, saveProfile, saveSettings, DEFAULT_SETTINGS } from '@/db/repo/settings';
import { getLatestWeight } from '@/db/repo/weights';
import { purgeExpiredPhotos } from '@/lib/photos';
import type { Profile, Settings } from '@/lib/types';

type AppState = {
  /** DBの初期化と読み込みが終わったか */
  ready: boolean;
  /** null ならオンボーディング未完了 */
  profile: Profile | null;
  settings: Settings;
  currentWeightKg: number | null;

  bootstrap: () => Promise<void>;
  refreshWeight: () => Promise<void>;
  updateProfile: (profile: Profile) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
};

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  profile: null,
  settings: DEFAULT_SETTINGS,
  currentWeightKg: null,

  bootstrap: async () => {
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
      purgeExpiredPhotos('meal', settings.mealPhotoRetentionDays);
      purgeExpiredPhotos('label', settings.labelPhotoRetentionDays);
    } catch (error) {
      console.warn('期限切れ画像の削除に失敗しました', error);
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
}));
