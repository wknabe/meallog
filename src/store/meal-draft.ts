/**
 * 記録中の食事の下書き。
 *
 * 「食材を検索 → 選ぶ → 記録画面に戻る」のように画面をまたぐため、
 * 画面のローカルstateではなくストアで保持する。保存すると破棄する。
 *
 * 日付は eatenAt（実際に食べた日時）だけを持ち、集計に使う論理日は
 * 区切り時刻を適用して都度求める。日付を二重に持つと片方だけ更新されて食い違うため。
 */
import { create } from 'zustand';

import type { MealItemInput } from '@/db/repo/meals';
import { deletePhoto } from '@/lib/photos';
import type { MealSlot } from '@/lib/types';

/** 一覧の並び替え・削除に使う一時的なキー（DBのidとは別物） */
export type DraftItem = MealItemInput & { key: string };

type MealDraftState = {
  /** 編集中の既存記録のid。新規なら null */
  mealId: number | null;
  slot: MealSlot;
  /** 実際に食べた日時（ISO8601） */
  eatenAt: string;
  photoPath: string | null;
  memo: string;
  items: DraftItem[];
  /**
   * 保存が成功したときに消す写真。
   * 差し替えや削除の時点でファイルを消すと、保存せずに戻ったときに
   * 記録だけが残って画像が消えてしまうため、コミットまで保留する。
   */
  pendingPhotoDeletes: string[];
  /** まだ記録に結び付いていない写真。下書きを捨てるときに削除する */
  uncommittedPhoto: string | null;

  start: (params: {
    mealId?: number | null;
    slot: MealSlot;
    eatenAt: string;
    photoPath?: string | null;
    /** photoPath が新規に撮った写真で、まだ保存されていない場合 true */
    photoUncommitted?: boolean;
    memo?: string;
    items?: MealItemInput[];
  }) => void;
  addItems: (items: MealItemInput[]) => void;
  updateItem: (key: string, patch: Partial<MealItemInput>) => void;
  removeItem: (key: string) => void;
  /** 写真を差し替える。古い写真の削除は保存時まで保留する */
  replacePhoto: (photoPath: string | null) => void;
  setSlot: (slot: MealSlot) => void;
  setEatenAt: (eatenAt: string) => void;
  setMemo: (memo: string) => void;
  /** 保存が成功したときに呼ぶ。保留していた写真を実際に削除して下書きを空にする */
  commit: () => void;
  /** 保存せずに破棄する。未コミットの写真を削除する */
  discard: () => void;
};

let keyCounter = 0;
const nextKey = () => `item-${++keyCounter}`;

const withKeys = (items: MealItemInput[]): DraftItem[] =>
  items.map((item) => ({ ...item, key: nextKey() }));

const emptyState = {
  mealId: null,
  slot: 'breakfast' as MealSlot,
  eatenAt: new Date().toISOString(),
  photoPath: null,
  memo: '',
  items: [] as DraftItem[],
  pendingPhotoDeletes: [] as string[],
  uncommittedPhoto: null,
};

function safeDelete(path: string | null) {
  if (!path) return;
  try {
    deletePhoto(path);
  } catch (error) {
    console.warn('写真の削除に失敗しました', error);
  }
}

export const useMealDraftStore = create<MealDraftState>((set, get) => ({
  ...emptyState,

  start: (params) => {
    // 前の下書きが写真を撮ったまま中断されていたら、その写真を残さない
    safeDelete(get().uncommittedPhoto);
    set({
      ...emptyState,
      mealId: params.mealId ?? null,
      slot: params.slot,
      eatenAt: params.eatenAt,
      photoPath: params.photoPath ?? null,
      uncommittedPhoto: params.photoUncommitted ? (params.photoPath ?? null) : null,
      memo: params.memo ?? '',
      items: withKeys(params.items ?? []),
    });
  },

  addItems: (items) => set((state) => ({ items: [...state.items, ...withKeys(items)] })),

  updateItem: (key, patch) =>
    set((state) => ({
      items: state.items.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    })),

  removeItem: (key) => set((state) => ({ items: state.items.filter((item) => item.key !== key) })),

  replacePhoto: (photoPath) =>
    set((state) => {
      // 未コミットの写真は記録に結び付いていないので、その場で消してよい
      if (state.uncommittedPhoto && state.uncommittedPhoto === state.photoPath) {
        safeDelete(state.uncommittedPhoto);
        return {
          photoPath,
          uncommittedPhoto: photoPath,
          pendingPhotoDeletes: state.pendingPhotoDeletes,
        };
      }
      return {
        photoPath,
        uncommittedPhoto: photoPath,
        pendingPhotoDeletes:
          state.photoPath != null
            ? [...state.pendingPhotoDeletes, state.photoPath]
            : state.pendingPhotoDeletes,
      };
    }),

  setSlot: (slot) => set({ slot }),
  setEatenAt: (eatenAt) => set({ eatenAt }),
  setMemo: (memo) => set({ memo }),

  commit: () => {
    for (const path of get().pendingPhotoDeletes) safeDelete(path);
    set({ ...emptyState });
  },

  discard: () => {
    safeDelete(get().uncommittedPhoto);
    set({ ...emptyState });
  },
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

/**
 * 指定した日付とスロットから、記録の日時を組み立てる。
 * 今日なら現在時刻、過去や未来の日付ならスロットに応じた代表的な時刻を使う。
 * これがないと、履歴で過去日を選んでから記録しても今日の日付で保存されてしまう。
 */
export function buildEatenAt(date: string, slot: MealSlot, todayKey: string): string {
  const now = new Date();
  if (date === todayKey) return now.toISOString();

  const defaultHours: Record<MealSlot, [number, number]> = {
    breakfast: [8, 0],
    lunch: [12, 30],
    dinner: [19, 0],
    snack: [15, 0],
  };
  const [hour, minute] = defaultHours[slot];
  const target = new Date(`${date}T00:00:00`);
  target.setHours(hour, minute, 0, 0);
  return target.toISOString();
}
