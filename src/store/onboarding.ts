/** オンボーディング中だけ使う下書き。保存はステップ4の完了時にまとめて行う */
import { create } from 'zustand';

import { addDays, toDayKey } from '@/lib/day';
import { paceToTargetDate, type PaceKey } from '@/lib/targets';
import type { ActivityLevel, Gender } from '@/lib/types';

type OnboardingState = {
  gender: Gender;
  birthDate: string | null;
  heightCm: string;
  weightKg: string;
  targetWeightKg: string;
  paceKey: PaceKey;
  targetDate: string | null;
  activityLevel: ActivityLevel | null;

  set: (patch: Partial<OnboardingState>) => void;
  reset: () => void;
  /** ペースまたは体重が変わったときに達成希望日を引き直す */
  recalcTargetDate: () => void;
};

const initial = {
  // 画面では最初から「男性」が選ばれて見えるので、状態も合わせておく。
  // null のままだと、選び直さないと次へ進めない
  gender: 'male' as Gender,
  birthDate: null,
  heightCm: '',
  weightKg: '',
  targetWeightKg: '',
  paceKey: 'normal' as PaceKey,
  targetDate: null,
  activityLevel: null,
};

const PACE_KG_PER_MONTH: Record<PaceKey, number> = { slow: 1, normal: 2, fast: 3 };

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  ...initial,

  set: (patch) => set(patch),
  reset: () => set(initial),

  recalcTargetDate: () => {
    const state = get();
    const current = Number(state.weightKg);
    const target = Number(state.targetWeightKg);
    if (!current || !target) {
      set({ targetDate: null });
      return;
    }
    if (current === target) {
      set({ targetDate: addDays(toDayKey(new Date()), 30) });
      return;
    }
    set({
      targetDate: paceToTargetDate(current, target, PACE_KG_PER_MONTH[state.paceKey]),
    });
  },
}));
