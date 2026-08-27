import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Chip, ChipGroup, SegmentedControl } from '@/components/ui/controls';
import { Card, CardTitle, Divider, EmptyState, Row, Screen } from '@/components/ui/layout';
import { dishNutrition, listDishes, type Dish } from '@/db/repo/dishes';
import { FOOD_GROUP_SETS, listCommonFoods, type Food } from '@/db/repo/foods';
import { dishToMealItem, foodToMealItem } from '@/db/repo/meal-builder';
import { createMeal } from '@/db/repo/meals';
import { listProducts } from '@/db/repo/products';
import { getFood } from '@/db/repo/foods';
import { useTodayKey } from '@/hooks/use-today';
import { logicalDate } from '@/lib/day';
import { nutrientsForFood } from '@/lib/nutrition';
import {
  buildCombo,
  isRemainingTooSmall,
  rankByRemaining,
  type ComboResult,
  type Remaining,
} from '@/lib/suggest';
import {
  CUISINE_LABELS,
  EFFORT_LABELS,
  MEAL_SLOT_LABELS,
  MEAL_SLOT_ORDER,
  type Cuisine,
  type Effort,
  type MealSlot,
} from '@/lib/types';
import { useAppStore } from '@/store/app';
import { colors, fontSize, radius, spacing } from '@/theme/colors';

type Source = 'food' | 'dish' | 'product';

const CUISINES: Cuisine[] = ['japanese', 'western', 'chinese', 'ethnic'];
const EFFORTS: Effort[] = ['full', 'easy', 'heatonly', 'nocook'];

export default function SuggestScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    kcal?: string;
    protein?: string;
    fat?: string;
    carb?: string;
  }>();
  const settings = useAppStore((s) => s.settings);
  const todayKey = useTodayKey(settings.dayStartHour);

  const remaining: Remaining = {
    kcal: Number(params.kcal ?? 0),
    proteinG: Number(params.protein ?? 0),
    fatG: Number(params.fat ?? 0),
    carbG: Number(params.carb ?? 0),
  };

  const [source, setSource] = useState<Source>('food');
  const [slot, setSlot] = useState<MealSlot>('dinner');
  const [cuisine, setCuisine] = useState<Cuisine | null>(null);
  const [effort, setEffort] = useState<Effort | null>(null);
  const [saving, setSaving] = useState(false);

  const [combo, setCombo] = useState<ComboResult | null>(null);
  const [comboIndex, setComboIndex] = useState(0);
  const [pools, setPools] = useState<{ protein: Food[]; staple: Food[]; vegetable: Food[] }>({
    protein: [],
    staple: [],
    vegetable: [],
  });
  const [dishes, setDishes] = useState<{ dish: Dish; kcal: number }[]>([]);
  const [products, setProducts] = useState<
    { id: number; name: string; kcal: number; grams: number }[]
  >([]);

  // 食材の組み合わせ用に、日常語で呼べる食品だけを集めておく
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listCommonFoods([...FOOD_GROUP_SETS.protein], 40),
      listCommonFoods([...FOOD_GROUP_SETS.staple], 20),
      listCommonFoods([...FOOD_GROUP_SETS.vegetable], 30),
    ])
      .then(([protein, staple, vegetable]) => {
        if (!cancelled) setPools({ protein, staple, vegetable });
      })
      .catch((error) => console.error('食品の読み込みに失敗しました', error));
    return () => {
      cancelled = true;
    };
  }, []);

  // タンパク質が多い順に候補を並べ、切り替えボタンで別の組み合わせを出せるようにする
  const buildAt = useCallback(
    (index: number) => {
      const proteinPool = pools.protein
        .filter((food) => food.per100g.protein_g >= 8)
        .sort((a, b) => b.per100g.protein_g - a.per100g.protein_g);
      const staplePool = pools.staple.filter((food) => food.per100g.carb_g >= 10);
      const vegetablePool = pools.vegetable;
      if (proteinPool.length === 0) return null;

      return buildCombo(remaining, {
        protein: proteinPool[index % proteinPool.length],
        staple: staplePool.length > 0 ? staplePool[index % staplePool.length] : undefined,
        vegetable:
          vegetablePool.length > 0 ? vegetablePool[index % vegetablePool.length] : undefined,
      });
    },
    // remaining はパラメータ由来で毎回同じ値になる
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pools, remaining.kcal, remaining.proteinG, remaining.fatG, remaining.carbG],
  );

  useEffect(() => {
    setCombo(buildAt(comboIndex));
  }, [buildAt, comboIndex]);

  // 料理の候補
  useEffect(() => {
    if (source !== 'dish') return;
    let cancelled = false;
    listDishes({
      cuisine: cuisine ?? undefined,
      effort: effort ?? undefined,
      limit: 200,
    })
      .then((list) => {
        if (cancelled) return;
        const ranked = rankByRemaining(
          list.map((dish) => ({ item: dish, nutrients: dishNutrition(dish, 1).nutrients })),
          remaining,
          12,
        );
        setDishes(ranked.map((entry) => ({ dish: entry.item, kcal: entry.nutrients.kcal })));
      })
      .catch((error) => console.error('料理の読み込みに失敗しました', error));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    source,
    cuisine,
    effort,
    remaining.kcal,
    remaining.proteinG,
    remaining.fatG,
    remaining.carbG,
  ]);

  // 登録済み商品の候補
  useEffect(() => {
    if (source !== 'product') return;
    let cancelled = false;
    listProducts()
      .then(async (list) => {
        if (cancelled) return;
        const candidates = [];
        for (const product of list) {
          const food = await getFood(product.id);
          if (!food) continue;
          // 1食あたりの量が登録されていればその量で、なければ100gで比べる
          const grams = product.labelServingG ?? 100;
          candidates.push({
            item: { id: product.id, name: product.name, grams },
            nutrients: nutrientsForFood(
              { id: food.id, name: food.name, per100g: food.per100g },
              grams,
            ),
          });
        }
        if (cancelled) return;
        const ranked = rankByRemaining(candidates, remaining, 12);
        setProducts(
          ranked.map((entry) => ({
            id: entry.item.id,
            name: entry.item.name,
            kcal: entry.nutrients.kcal,
            // 表示に使った量と同じ量で記録する
            grams: entry.item.grams,
          })),
        );
      })
      .catch((error) => console.error('商品の読み込みに失敗しました', error));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, remaining.kcal, remaining.proteinG, remaining.fatG, remaining.carbG]);

  async function addCombo() {
    if (!combo || saving) return;
    setSaving(true);
    try {
      const now = new Date();
      const items = [];
      for (const item of combo.items) {
        const food = await getFood(item.food.id);
        if (!food) continue;
        items.push(foodToMealItem(food, item.grams, null));
      }
      if (items.length === 0) return;
      await createMeal({
        date: logicalDate(now, settings.dayStartHour),
        slot,
        eatenAt: now.toISOString(),
        photoPath: null,
        memo: null,
        items,
      });
      router.dismissAll();
      router.replace('/meals');
    } catch (error) {
      console.error('食事の追加に失敗しました', error);
      Alert.alert('追加できませんでした', 'もう一度お試しください。');
    } finally {
      setSaving(false);
    }
  }

  async function addDish(dish: Dish) {
    if (saving) return;
    setSaving(true);
    try {
      const now = new Date();
      await createMeal({
        date: logicalDate(now, settings.dayStartHour),
        slot,
        eatenAt: now.toISOString(),
        photoPath: null,
        memo: null,
        items: [dishToMealItem(dish, 1)],
      });
      router.dismissAll();
      router.replace('/meals');
    } catch (error) {
      console.error('食事の追加に失敗しました', error);
      Alert.alert('追加できませんでした', 'もう一度お試しください。');
    } finally {
      setSaving(false);
    }
  }

  async function addProduct(productId: number, grams: number) {
    if (saving) return;
    setSaving(true);
    try {
      const food = await getFood(productId);
      if (!food) return;
      const now = new Date();
      await createMeal({
        date: logicalDate(now, settings.dayStartHour),
        slot,
        eatenAt: now.toISOString(),
        photoPath: null,
        memo: null,
        items: [foodToMealItem(food, grams, null)],
      });
      router.dismissAll();
      router.replace('/meals');
    } catch (error) {
      console.error('食事の追加に失敗しました', error);
      Alert.alert('追加できませんでした', 'もう一度お試しください。');
    } finally {
      setSaving(false);
    }
  }

  if (isRemainingTooSmall(remaining)) {
    return (
      <Screen>
        <Card>
          <CardTitle>今日はもう十分です</CardTitle>
          <Text style={styles.note}>
            残りは {Math.max(0, Math.round(remaining.kcal))} kcal
            です。無理に食べる必要はありません。
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      {/* 残りの栄養目標 */}
      <View style={styles.remaining}>
        <Text style={styles.remainingTitle}>残りの栄養目標</Text>
        <View style={styles.remainingRow}>
          <Text style={styles.remainingKcal}>{Math.round(remaining.kcal).toLocaleString()}</Text>
          <Text style={styles.remainingUnit}>kcal</Text>
        </View>
        <View style={styles.remainingMacros}>
          <Text style={[styles.macro, { color: colors.protein }]}>
            P {Math.round(remaining.proteinG)}g
          </Text>
          <Text style={[styles.macro, { color: colors.fat }]}>F {Math.round(remaining.fatG)}g</Text>
          <Text style={[styles.macro, { color: colors.carb }]}>
            C {Math.round(remaining.carbG)}g
          </Text>
        </View>
      </View>

      <SegmentedControl<Source>
        options={[
          { value: 'food', label: '食材から' },
          { value: 'dish', label: '料理から' },
          { value: 'product', label: 'コンビニ・外食' },
        ]}
        value={source}
        onChange={setSource}
      />

      <Card>
        <CardTitle>どの食事として記録するか</CardTitle>
        <SegmentedControl<MealSlot>
          options={MEAL_SLOT_ORDER.map((value) => ({ value, label: MEAL_SLOT_LABELS[value] }))}
          value={slot}
          onChange={setSlot}
        />
      </Card>

      {source === 'food' ? (
        combo == null ? (
          <EmptyState title="候補を読み込んでいます" />
        ) : (
          <Card>
            <CardTitle
              right={
                <Pressable onPress={() => setComboIndex((value) => value + 1)} hitSlop={8}>
                  <View style={styles.reroll}>
                    <Ionicons name="refresh" size={14} color={colors.primary} />
                    <Text style={styles.rerollText}>別の組み合わせ</Text>
                  </View>
                </Pressable>
              }
            >
              おすすめの食事
            </CardTitle>

            {combo.items.map((item, index) => (
              <View key={`${item.food.id}-${index}`}>
                {index > 0 && <Divider />}
                <Row
                  label={item.food.name}
                  sub={`${item.grams}g`}
                  value={`${Math.round((item.food.per100g.kcal * item.grams) / 100)} kcal`}
                />
              </View>
            ))}

            <Divider />
            <Row
              label="合計"
              value={`${Math.round(combo.totals.kcal)} kcal`}
              sub={`P${Math.round(combo.totals.proteinG)} F${Math.round(combo.totals.fatG)} C${Math.round(combo.totals.carbG)}`}
            />

            <Button
              title={saving ? '追加中…' : '食事に追加する'}
              onPress={() => void addCombo()}
              disabled={saving}
            />
          </Card>
        )
      ) : source === 'dish' ? (
        <>
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
          </View>

          {dishes.length === 0 ? (
            <EmptyState title="候補がありません" description="絞り込みを外してみてください。" />
          ) : (
            dishes.map((entry) => (
              <Pressable
                key={entry.dish.id}
                onPress={() => void addDish(entry.dish)}
                disabled={saving}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <View style={styles.flex}>
                  <Text style={styles.name}>{entry.dish.name}</Text>
                  <Text style={styles.sub}>1人前 {Math.round(entry.kcal)} kcal</Text>
                </View>
                <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
              </Pressable>
            ))
          )}
        </>
      ) : products.length === 0 ? (
        <EmptyState
          title="登録した商品がありません"
          description="よく買うコンビニ商品の成分表を登録しておくと、残りに合うものを提案できます。"
        />
      ) : (
        products.map((product) => (
          <Pressable
            key={product.id}
            onPress={() => void addProduct(product.id, product.grams)}
            disabled={saving}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.flex}>
              <Text style={styles.name}>{product.name}</Text>
              <Text style={styles.sub}>
                {Math.round(product.grams)}gあたり {Math.round(product.kcal)} kcal
              </Text>
            </View>
            <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  remaining: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  remainingTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.primaryDark },
  remainingRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  remainingKcal: { fontSize: fontSize.display, fontWeight: '700', color: colors.primaryDark },
  remainingUnit: { fontSize: fontSize.md, color: colors.primaryDark },
  remainingMacros: { flexDirection: 'row', gap: spacing.lg },
  macro: { fontSize: fontSize.sm, fontWeight: '600' },
  filters: { gap: spacing.sm },
  reroll: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rerollText: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  pressed: { opacity: 0.7 },
  name: { fontSize: fontSize.md, color: colors.text },
  sub: { fontSize: fontSize.xs, color: colors.textFaint, marginTop: 2 },
  note: { fontSize: fontSize.sm, color: colors.textSub, lineHeight: 20 },
});
