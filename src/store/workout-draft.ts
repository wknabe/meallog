/**
 * 筋トレの種目の下書き。
 * 器具を選ぶ画面へ移るため、画面をまたいで保持する必要がある。
 */
import { create } from 'zustand';

import { findEquipment, type ExerciseDraft, type ExerciseSet } from '@/lib/equipment';

/**
 * 入力中は文字列のまま持つ。
 * 数値に正規化して書き戻すと「62.5」を打つ途中の「62.」が「62」に戻ってしまう。
 */
export type DraftSet = { weight: string; reps: string };

export type DraftExercise = {
  key: string;
  equipmentKey: string | null;
  name: string;
  weighted: boolean;
  sets: DraftSet[];
};

const emptySet = (): DraftSet => ({ weight: '', reps: '' });

let counter = 0;
const nextKey = (): string => `ex-${++counter}`;

type WorkoutDraftState = {
  exercises: DraftExercise[];

  clear: () => void;
  addEquipment: (equipmentKey: string) => void;
  addCustom: (name: string) => void;
  remove: (key: string) => void;
  rename: (key: string, name: string) => void;
  addSet: (key: string) => void;
  removeSet: (key: string, index: number) => void;
  patchSet: (key: string, index: number, patch: Partial<DraftSet>) => void;
};

export const useWorkoutDraft = create<WorkoutDraftState>((set) => ({
  exercises: [],

  clear: () => set({ exercises: [] }),

  addEquipment: (equipmentKey) =>
    set((state) => {
      // 同じ器具を二重に足さない。セットを増やしたいだけのことが多いため
      if (state.exercises.some((item) => item.equipmentKey === equipmentKey)) return state;
      const equipment = findEquipment(equipmentKey);
      if (!equipment) return state;
      return {
        exercises: [
          ...state.exercises,
          {
            key: nextKey(),
            equipmentKey,
            name: equipment.name,
            weighted: equipment.weighted,
            sets: [emptySet()],
          },
        ],
      };
    }),

  addCustom: (name) =>
    set((state) => ({
      exercises: [
        ...state.exercises,
        { key: nextKey(), equipmentKey: null, name, weighted: true, sets: [emptySet()] },
      ],
    })),

  remove: (key) =>
    set((state) => ({ exercises: state.exercises.filter((item) => item.key !== key) })),

  rename: (key, name) =>
    set((state) => ({
      exercises: state.exercises.map((item) => (item.key === key ? { ...item, name } : item)),
    })),

  addSet: (key) =>
    set((state) => ({
      exercises: state.exercises.map((item) =>
        item.key === key
          ? {
              ...item,
              // 直前のセットの重さを引き継ぐ。同じ重さで続けることが多い
              sets: [...item.sets, { ...(item.sets[item.sets.length - 1] ?? emptySet()) }],
            }
          : item,
      ),
    })),

  removeSet: (key, index) =>
    set((state) => ({
      exercises: state.exercises.map((item) =>
        item.key === key ? { ...item, sets: item.sets.filter((_, i) => i !== index) } : item,
      ),
    })),

  patchSet: (key, index, patch) =>
    set((state) => ({
      exercises: state.exercises.map((item) =>
        item.key === key
          ? {
              ...item,
              sets: item.sets.map((set, i) => (i === index ? { ...set, ...patch } : set)),
            }
          : item,
      ),
    })),
}));

const toNumber = (text: string): number | null => {
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : null;
};

const toSet = (set: DraftSet): ExerciseSet => ({
  weightKg: toNumber(set.weight),
  reps: toNumber(set.reps),
});

/** 保存できる形に直す */
export function toExerciseDrafts(exercises: DraftExercise[]): ExerciseDraft[] {
  return exercises.map((exercise) => ({
    equipmentKey: exercise.equipmentKey,
    name: exercise.name,
    weighted: exercise.weighted,
    sets: exercise.sets.map(toSet),
  }));
}

/** 記録として意味のある種目が1つでもあるか */
export function hasAnySet(exercises: DraftExercise[]): boolean {
  return exercises.some((exercise) =>
    exercise.sets.some((set) => toNumber(set.reps) != null || toNumber(set.weight) != null),
  );
}
