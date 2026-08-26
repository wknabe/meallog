import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Chip, ChipGroup, SegmentedControl } from '@/components/ui/controls';
import { EmptyState, Screen } from '@/components/ui/layout';
import { dishNutrition, listDishes, type Dish } from '@/db/repo/dishes';
import {
  CUISINE_LABELS,
  DISH_CATEGORY_LABELS,
  EFFORT_LABELS,
  VOLUME_LABELS,
  type Cuisine,
  type DishCategory,
  type Effort,
  type Volume,
} from '@/lib/types';
import { useDishDraftStore } from '@/store/dish-draft';
import { colors, fontSize, radius, spacing } from '@/theme/colors';

const CATEGORIES: DishCategory[] = ['staple', 'main', 'side', 'soup', 'other'];
const CUISINES: Cuisine[] = ['japanese', 'western', 'chinese', 'ethnic'];
const EFFORTS: Effort[] = ['full', 'easy', 'heatonly', 'nocook'];
const VOLUMES: Volume[] = ['hearty', 'normal', 'light'];

export default function DishesScreen() {
  const router = useRouter();
  const startNew = useDishDraftStore((s) => s.startNew);
  const startFrom = useDishDraftStore((s) => s.startFrom);

  const [category, setCategory] = useState<DishCategory>('main');
  const [cuisine, setCuisine] = useState<Cuisine | null>(null);
  const [effort, setEffort] = useState<Effort | null>(null);
  const [volume, setVolume] = useState<Volume | null>(null);
  const [keyword, setKeyword] = useState('');
  // 1文字ごとに全件取り直すと重いので、打ち終わりを待ってから検索する
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [dishes, setDishes] = useState<Dish[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedKeyword(keyword), 250);
    return () => clearTimeout(timer);
  }, [keyword]);

  const reload = useCallback(async () => {
    setDishes(
      await listDishes({
        category,
        cuisine: cuisine ?? undefined,
        effort: effort ?? undefined,
        volume: volume ?? undefined,
        keyword: debouncedKeyword,
        limit: 200,
      })
    );
  }, [category, cuisine, effort, volume, debouncedKeyword]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  return (
    <Screen>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={colors.textFaint} />
        <TextInput
          value={keyword}
          onChangeText={setKeyword}
          placeholder="料理名で絞り込む"
          placeholderTextColor={colors.textFaint}
          style={styles.searchInput}
        />
      </View>

      <SegmentedControl<DishCategory>
        options={CATEGORIES.map((value) => ({ value, label: DISH_CATEGORY_LABELS[value] }))}
        value={category}
        onChange={setCategory}
      />

      {/* 気分の絞り込み。もう一度押すと解除される */}
      <View style={styles.filters}>
        <ChipGroup>
          {CUISINES.map((value) => (
            <Chip
              key={value}
              label={CUISINE_LABELS[value]}
              selected={cuisine === value}
              onPress={() => setCuisine(cuisine === value ? null : value)}
            />
          ))}
        </ChipGroup>
        <ChipGroup>
          {EFFORTS.map((value) => (
            <Chip
              key={value}
              label={EFFORT_LABELS[value].replace('（15分以内）', '')}
              selected={effort === value}
              onPress={() => setEffort(effort === value ? null : value)}
            />
          ))}
        </ChipGroup>
        <ChipGroup>
          {VOLUMES.map((value) => (
            <Chip
              key={value}
              label={VOLUME_LABELS[value]}
              selected={volume === value}
              onPress={() => setVolume(volume === value ? null : value)}
            />
          ))}
        </ChipGroup>
      </View>

      <Button
        title="料理を追加"
        variant="secondary"
        onPress={() => {
          startNew();
          router.push('/library/dish-edit');
        }}
      />

      <Text style={styles.count}>{dishes.length}件</Text>

      {dishes.length === 0 ? (
        <EmptyState
          title="該当する料理がありません"
          description="絞り込みを外すか、料理を追加してください。"
        />
      ) : (
        dishes.map((dish) => {
          const nutrition = dishNutrition(dish, 1);
          return (
            <Pressable
              key={dish.id}
              onPress={() => {
                startFrom(dish);
                router.push('/library/dish-edit');
              }}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <View style={styles.flex}>
                <Text style={styles.name}>{dish.name}</Text>
                <Text style={styles.sub}>
                  1人前 {Math.round(nutrition.nutrients.kcal)}kcal ／ P
                  {nutrition.nutrients.protein_g.toFixed(1)} F{nutrition.nutrients.fat_g.toFixed(1)} C
                  {nutrition.nutrients.carb_g.toFixed(1)}
                </Text>
                <Text style={styles.tags}>
                  {[
                    dish.cuisine ? CUISINE_LABELS[dish.cuisine] : null,
                    dish.effort ? EFFORT_LABELS[dish.effort].replace('（15分以内）', '') : null,
                    dish.volume ? VOLUME_LABELS[dish.volume] : null,
                    dish.cookMinutes != null ? `${dish.cookMinutes}分` : null,
                    dish.source === 'user' ? '自分で追加' : dish.isCustomized ? '編集済み' : null,
                  ]
                    .filter(Boolean)
                    .join(' ・ ')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: fontSize.md, color: colors.text },
  filters: { gap: spacing.sm },
  count: { fontSize: fontSize.xs, color: colors.textFaint, textAlign: 'right' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  pressed: { opacity: 0.7 },
  name: { fontSize: fontSize.md, color: colors.text, fontWeight: '600' },
  sub: { fontSize: fontSize.xs, color: colors.textSub, marginTop: 2 },
  tags: { fontSize: fontSize.xs, color: colors.textFaint, marginTop: 2 },
});
