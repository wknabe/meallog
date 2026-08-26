/**
 * 編集中の料理の下書き。
 * 材料を選ぶときに食材検索の画面へ移るため、画面をまたいで保持する必要がある。
 */
import { create } from 'zustand';

import type { Nutrients } from '@/db/nutrients';
import type { Dish } from '@/db/repo/dishes';
import { nutrientsForDish } from '@/lib/nutrition';
import type { Cuisine, DishCategory, Effort, Taste, Volume } from '@/lib/types';

export type DraftIngredient = {
  key: string;
  foodId: number;
  foodName: string;
  grams: number;
  isSeasoning: boolean;
  /** 栄養価をその場で計算するために保持する */
  per100g: Nutrients;
};

type DishDraftState = {
  dishId: number | null;
  name: string;
  category: DishCategory;
  cuisine: Cuisine | null;
  effort: Effort | null;
  volume: Volume | null;
  tastes: Taste[];
  servings: string;
  cookMinutes: string;
  steps: string;
  ingredients: DraftIngredient[];

  startNew: () => void;
  startFrom: (dish: Dish) => void;
  patch: (values: Partial<Omit<DishDraftState, 'ingredients'>>) => void;
  toggleTaste: (taste: Taste) => void;
  addIngredient: (ingredient: Omit<DraftIngredient, 'key'>) => void;
  updateIngredient: (key: string, values: Partial<Omit<DraftIngredient, 'key'>>) => void;
  removeIngredient: (key: string) => void;
  clear: () => void;
};

let keyCounter = 0;
const nextKey = () => `ingredient-${++keyCounter}`;

const emptyState = {
  dishId: null,
  name: '',
  category: 'main' as DishCategory,
  cuisine: null,
  effort: null,
  volume: null,
  tastes: [] as Taste[],
  servings: '1',
  cookMinutes: '',
  steps: '',
  ingredients: [] as DraftIngredient[],
};

export const useDishDraftStore = create<DishDraftState>((set) => ({
  ...emptyState,

  startNew: () => set({ ...emptyState }),

  startFrom: (dish) =>
    set({
      dishId: dish.id,
      name: dish.name,
      category: dish.category,
      cuisine: dish.cuisine,
      effort: dish.effort,
      volume: dish.volume,
      tastes: dish.tastes,
      servings: String(dish.servings),
      cookMinutes: dish.cookMinutes != null ? String(dish.cookMinutes) : '',
      steps: dish.steps ?? '',
      ingredients: dish.ingredients.map((ingredient) => ({
        key: nextKey(),
        foodId: ingredient.foodId,
        foodName: ingredient.foodName,
        grams: ingredient.grams,
        isSeasoning: ingredient.isSeasoning,
        per100g: ingredient.per100g,
      })),
    }),

  patch: (values) => set(values as Partial<DishDraftState>),

  toggleTaste: (taste) =>
    set((state) => ({
      tastes: state.tastes.includes(taste)
        ? state.tastes.filter((value) => value !== taste)
        : [...state.tastes, taste],
    })),

  addIngredient: (ingredient) =>
    set((state) => ({ ingredients: [...state.ingredients, { ...ingredient, key: nextKey() }] })),

  updateIngredient: (key, values) =>
    set((state) => ({
      ingredients: state.ingredients.map((ingredient) =>
        ingredient.key === key ? { ...ingredient, ...values } : ingredient
      ),
    })),

  removeIngredient: (key) =>
    set((state) => ({
      ingredients: state.ingredients.filter((ingredient) => ingredient.key !== key),
    })),

  clear: () => set({ ...emptyState }),
}));

/** 下書きの1人前あたりの栄養価 */
export function draftDishNutrition(ingredients: DraftIngredient[], servings: number) {
  return nutrientsForDish(
    {
      id: 0,
      name: '',
      servings: servings > 0 ? servings : 1,
      ingredients: ingredients.map((ingredient) => ({
        food: { id: ingredient.foodId, name: ingredient.foodName, per100g: ingredient.per100g },
        grams: ingredient.grams,
      })),
    },
    1
  );
}
