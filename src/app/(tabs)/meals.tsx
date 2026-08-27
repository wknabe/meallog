import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SegmentedControl } from '@/components/ui/controls';
import { Card, CardTitle, Divider, Row, Screen } from '@/components/ui/layout';
import {
  MACRO_KEYS,
  MINERAL_KEYS,
  NUTRIENT_LABELS,
  VITAMIN_KEYS,
  addNutrients,
  emptyNutrients,
} from '@/db/nutrients';
import { listMealsByDate } from '@/db/repo/meals';
import { useSelectableDate } from '@/hooks/use-today';
import { addDays, formatDayLabel, formatTime } from '@/lib/day';
import { photoUri } from '@/lib/photos';
import { formatGrams } from '@/lib/units';
import { MEAL_SLOT_LABELS, MEAL_SLOT_ORDER, type Meal, type MealSlot } from '@/lib/types';
import { useAppStore } from '@/store/app';
import { useMealDraftStore } from '@/store/meal-draft';
import { colors, fontSize, radius, spacing } from '@/theme/colors';

type Tab = 'list' | 'nutrition';

export default function MealsScreen() {
  const router = useRouter();
  const settings = useAppStore((s) => s.settings);
  const { date, todayKey, setDate } = useSelectableDate(settings.dayStartHour);
  const [tab, setTab] = useState<Tab>('list');
  const [meals, setMeals] = useState<Meal[]>([]);
  const startDraft = useMealDraftStore((s) => s.start);

  // 記録して戻ってきたときに最新化する
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      listMealsByDate(date)
        .then((loaded) => {
          if (!cancelled) setMeals(loaded);
        })
        .catch((error) => console.error('食事の読み込みに失敗しました', error));
      return () => {
        cancelled = true;
      };
    }, [date]),
  );

  const totals = meals
    .flatMap((meal) => meal.items.map((item) => item.nutrients))
    .reduce((sum, nutrients) => addNutrients(sum, nutrients), emptyNutrients());

  const mealsBySlot = new Map<MealSlot, Meal[]>();
  for (const meal of meals) {
    const list = mealsBySlot.get(meal.slot) ?? [];
    list.push(meal);
    mealsBySlot.set(meal.slot, list);
  }

  function openMeal(meal: Meal) {
    startDraft({
      mealId: meal.id,
      slot: meal.slot,
      eatenAt: meal.eatenAt,
      photoPath: meal.photoPath,
      memo: meal.memo ?? '',
      items: meal.items.map((item) => ({
        refType: item.refType,
        refId: item.refId,
        name: item.name,
        quantity: item.quantity,
        unitLabel: item.unitLabel,
        grams: item.grams,
        nutrients: item.nutrients,
      })),
    });
    router.push('/meal/edit');
  }

  return (
    <Screen>
      {/* 日付の切り替え */}
      <View style={styles.dateNav}>
        <Pressable onPress={() => setDate(addDays(date, -1))} hitSlop={8} style={styles.navButton}>
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </Pressable>
        <Pressable onPress={() => setDate(todayKey)}>
          <Text style={styles.dateLabel}>{formatDayLabel(date)}</Text>
        </Pressable>
        <Pressable onPress={() => setDate(addDays(date, 1))} hitSlop={8} style={styles.navButton}>
          <Ionicons name="chevron-forward" size={22} color={colors.primary} />
        </Pressable>
      </View>

      <SegmentedControl<Tab>
        options={[
          { value: 'list', label: '一覧' },
          { value: 'nutrition', label: '栄養' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'list' ? (
        <>
          {MEAL_SLOT_ORDER.map((slot) => {
            const slotMeals = mealsBySlot.get(slot) ?? [];
            const slotKcal = slotMeals.reduce(
              (sum, meal) => sum + meal.items.reduce((s, item) => s + item.nutrients.kcal, 0),
              0,
            );
            return (
              <Card key={slot}>
                <CardTitle
                  right={
                    slotMeals.length > 0 ? (
                      <Text style={styles.slotKcal}>{Math.round(slotKcal)} kcal</Text>
                    ) : undefined
                  }
                >
                  {MEAL_SLOT_LABELS[slot]}
                </CardTitle>

                {slotMeals.map((meal) => {
                  const uri = photoUri(meal.photoPath);
                  return (
                    <Pressable
                      key={meal.id}
                      onPress={() => openMeal(meal)}
                      style={({ pressed }) => [styles.meal, pressed && styles.pressed]}
                    >
                      {uri != null ? (
                        <Image source={{ uri }} style={styles.thumb} contentFit="cover" />
                      ) : (
                        <View style={[styles.thumb, styles.thumbEmpty]}>
                          <Ionicons name="restaurant-outline" size={20} color={colors.textFaint} />
                        </View>
                      )}
                      <View style={styles.flex}>
                        <Text style={styles.mealTime}>{formatTime(meal.eatenAt)}</Text>
                        <Text style={styles.mealItems} numberOfLines={2}>
                          {meal.items.map((item) => item.name).join('、')}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
                    </Pressable>
                  );
                })}

                <Pressable
                  onPress={() => router.push({ pathname: '/meal/new', params: { date, slot } })}
                  style={styles.addRow}
                >
                  <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                  <Text style={styles.addText}>{MEAL_SLOT_LABELS[slot]}を記録</Text>
                </Pressable>
              </Card>
            );
          })}

          <Card>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>合計</Text>
              <Text style={styles.totalValue}>{Math.round(totals.kcal).toLocaleString()} kcal</Text>
            </View>
          </Card>
        </>
      ) : (
        <>
          <Card>
            <CardTitle>主要栄養素</CardTitle>
            {MACRO_KEYS.map((key) => (
              <Row
                key={key}
                label={NUTRIENT_LABELS[key].label}
                value={`${key === 'kcal' ? Math.round(totals[key]).toLocaleString() : totals[key].toFixed(1)} ${NUTRIENT_LABELS[key].unit}`}
              />
            ))}
          </Card>

          <Card>
            <CardTitle>ビタミン</CardTitle>
            {VITAMIN_KEYS.map((key) => (
              <Row
                key={key}
                label={NUTRIENT_LABELS[key].label}
                value={`${totals[key].toFixed(totals[key] < 10 ? 2 : 0)} ${NUTRIENT_LABELS[key].unit}`}
              />
            ))}
          </Card>

          <Card>
            <CardTitle>ミネラル</CardTitle>
            {MINERAL_KEYS.map((key) => (
              <Row
                key={key}
                label={NUTRIENT_LABELS[key].label}
                value={`${totals[key].toFixed(totals[key] < 10 ? 2 : 0)} ${NUTRIENT_LABELS[key].unit}`}
              />
            ))}
          </Card>

          <Card>
            <CardTitle>食べたものの内訳</CardTitle>
            {meals.length === 0 ? (
              <Text style={styles.empty}>記録がありません</Text>
            ) : (
              meals.flatMap((meal) =>
                meal.items.map((item, index) => (
                  <View key={`${meal.id}-${item.id}`}>
                    {index > 0 && <Divider />}
                    <Row
                      label={item.name}
                      sub={item.unitLabel ?? formatGrams(item.grams)}
                      value={`${Math.round(item.nutrients.kcal)} kcal`}
                    />
                  </View>
                )),
              )
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  navButton: { padding: spacing.xs },
  dateLabel: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },

  slotKcal: { fontSize: fontSize.sm, color: colors.textSub, fontWeight: '600' },
  meal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  pressed: { opacity: 0.7 },
  thumb: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  mealTime: { fontSize: fontSize.xs, color: colors.textFaint },
  mealItems: { fontSize: fontSize.sm, color: colors.text, marginTop: 2 },

  addRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xs },
  addText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600' },

  totalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  totalLabel: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  totalValue: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  empty: {
    fontSize: fontSize.sm,
    color: colors.textFaint,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
});
