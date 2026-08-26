/**
 * 記録中の食事の下書き。
 *
 * 「食材を検索 → 選ぶ → 記録画面に戻る」のように画面をまたぐため、
 * 画面のローカルstateではなくストアで保持する。保存すると破棄する。
 */
import { create } from 'zustand';

import type { MealItemInput } from '@/db/repo/meals';
import type { DayKey } from '@/lib/day';
import type { MealSlot } from '@/lib/types';

/** 一覧の並び替え・削除に使う一時的なキー（DBのidとは別物） */
export type DraftItem = MealItemInput & { key: string };

type MealDraftState = {
  /** 編集中の既存記録のid。新規なら null */
  mealId: number | null;
  date: DayKey;
  slot: MealSlot;
  eatenAt: string;
  photoPath: string | null;
  memo: string;
  items: DraftItem[];

  start: (params: {
    mealId?: number | null;
    date: DayKey;
    slot: MealSlot;
    eatenAt?: string;
    photoPath?: string | null;
    memo?: string;
    items?: MealItemInput[];
  }) => void;
  addItems: (items: MealItemInput[]) => void;
  updateItem: (key: string, patch: Partial<MealItemInput>) => void;
  removeItem: (key: string) => void;
  setPhoto: (photoPath: string | null) => void;
  setSlot: (slot: MealSlot) => void;
  setDateTime: (date: DayKey, eatenAt: string) => void;
  setMemo: (memo: string) => void;
  clear: () => void;
};

let keyCounter = 0;
const nextKey = () => `item-${++keyCounter}`;

const withKeys = (items: MealItemInput[]): DraftItem[] =>
  items.map((item) => ({ ...item, key: nextKey() }));

export const useMealDraftStore = create<MealDraftState>((set) => ({
  mealId: null,
  date: '',
  slot: 'breakfast',
  eatenAt: new Date().toISOString(),
  photoPath: null,
  memo: '',
  items: [],

  start: (params) =>
    set({
      mealId: params.mealId ?? null,
      date: params.date,
      slot: params.slot,
      eatenAt: params.eatenAt ?? new Date().toISOString(),
      photoPath: params.photoPath ?? null,
      memo: params.memo ?? '',
      items: withKeys(params.items ?? []),
    }),

  addItems: (items) =>
    set((state) => ({ items: [...state.items, ...withKeys(items)] })),

  updateItem: (key, patch) =>
    set((state) => ({
      items: state.items.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    })),

  removeItem: (key) => set((state) => ({ items: state.items.filter((item) => item.key !== key) })),

  setPhoto: (photoPath) => set({ photoPath }),
  setSlot: (slot) => set({ slot }),
  setDateTime: (date, eatenAt) => set({ date, eatenAt }),
  setMemo: (memo) => set({ memo }),

  clear: () =>
    set({
      mealId: null,
      date: '',
      slot: 'breakfast',
      eatenAt: new Date().toISOString(),
      photoPath: null,
      memo: '',
      items: [],
    }),
}));

/** 下書きの合計栄養価 */
export function draftTotals(items: DraftItem[]) {
  return items.reduce(
    (total, item) => ({
      kcal: total.kcal + item.nutrients.kcal,
      proteinG: total.proteinG + item.nutrients.protein_g,
      fatG: total.fatG + item.nutrients.fat_g,
      carbG: total.carbG + item.nutrients.carb_g,
    }),
    { kcal: 0, proteinG: 0, fatG: 0, carbG: 0 }
  );
}
