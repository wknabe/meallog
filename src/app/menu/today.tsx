import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '@/components/ui/controls';
import { Card, CardTitle, Divider, EmptyState, Row, Screen } from '@/components/ui/layout';
import { dishNutrition } from '@/db/repo/dishes';
import { dishToMealItem } from '@/db/repo/meal-builder';
import {
  deletePlanForDate,
  listPlanForDate,
  markCooked,
  planTotals,
  type PlanEntryRecord,
} from '@/db/repo/meal-plans';
import { createMeal } from '@/db/repo/meals';
import { useTodayKey } from '@/hooks/use-today';
import { formatDayLabel, fromDayKey } from '@/lib/day';
import { MEAL_SLOT_LABELS, MEAL_SLOT_ORDER, type MealSlot } from '@/lib/types';
import { useAppStore } from '@/store/app';
import { colors, fontSize, spacing } from '@/theme/colors';

export default function TodayPlanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const profile = useAppStore((s) => s.profile);
  const settings = useAppStore((s) => s.settings);
  const todayKey = useTodayKey(settings.dayStartHour);
  const date = params.date ?? todayKey;

  const [entries, setEntries] = useState<PlanEntryRecord[]>([]);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setEntries(await listPlanForDate(date));
  }, [date]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  const totals = planTotals(entries);
  const bySlot = new Map<MealSlot, PlanEntryRecord[]>();
  for (const entry of entries) {
    const list = bySlot.get(entry.slot) ?? [];
    list.push(entry);
    bySlot.set(entry.slot, list);
  }

  async function toggleCooked(entry: PlanEntryRecord, cooked: boolean) {
    await markCooked(entry.id, cooked);
    await reload();
  }

  /** 献立どおりに食べたものを、そのまま食事記録にする */
  async function recordMeal(slot: MealSlot) {
    if (busy) return;
    const slotEntries = (bySlot.get(slot) ?? []).filter((entry) => entry.dish != null);
    if (slotEntries.length === 0) return;

    setBusy(true);
    try {
      const at = fromDayKey(date);
      const hours: Record<MealSlot, number> = { breakfast: 8, lunch: 12, dinner: 19, snack: 15 };
      at.setHours(hours[slot], 0, 0, 0);

      await createMeal({
        date,
        slot,
        eatenAt: at.toISOString(),
        photoPath: null,
        memo: null,
        items: slotEntries.map((entry) => dishToMealItem(entry.dish!, entry.servings)),
      });
      Alert.alert('記録しました', `${MEAL_SLOT_LABELS[slot]}として食事に追加しました。`);
    } catch (error) {
      console.error('食事の記録に失敗しました', error);
      Alert.alert('記録できませんでした', 'もう一度お試しください。');
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    Alert.alert('この日の献立を削除しますか？', formatDayLabel(date), [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除する',
        style: 'destructive',
        onPress: async () => {
          await deletePlanForDate(date);
          await reload();
        },
      },
    ]);
  }

  if (entries.length === 0) {
    return (
      <Screen>
        <EmptyState
          title="この日の献立はありません"
          description="気分と直近の栄養バランスから組み立てられます。"
        />
        <Button
          title="献立を作る"
          onPress={() => router.replace({ pathname: '/menu/generate', params: { date } })}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <CardTitle
          right={<Text style={styles.total}>{Math.round(totals.kcal).toLocaleString()} kcal</Text>}>
          {formatDayLabel(date)}
        </CardTitle>
        {profile != null && (
          <Text style={styles.compare}>
            目標 {profile.targetKcal.toLocaleString()} kcal との差{' '}
            {formatDiff(totals.kcal - profile.targetKcal)}
          </Text>
        )}
        <Text style={styles.macros}>
          P {Math.round(totals.proteinG)}g ／ F {Math.round(totals.fatG)}g ／ C{' '}
          {Math.round(totals.carbG)}g
        </Text>
      </Card>

      {MEAL_SLOT_ORDER.filter((slot) => (bySlot.get(slot) ?? []).length > 0).map((slot) => (
        <Card key={slot}>
          <CardTitle>{MEAL_SLOT_LABELS[slot]}</CardTitle>

          {(bySlot.get(slot) ?? []).map((entry, index) => (
            <View key={entry.id}>
              {index > 0 && <Divider />}
              <View style={styles.entry}>
                <View style={styles.flex}>
                  <Text style={styles.dishName}>{entry.dish?.name ?? '（削除された料理）'}</Text>
                  <Text style={styles.dishSub}>
                    {entry.servings !== 1 ? `${entry.servings}人前 ・ ` : ''}
                    {entry.dish != null
                      ? `${Math.round(dishNutrition(entry.dish, entry.servings).nutrients.kcal)} kcal`
                      : ''}
                  </Text>
                </View>
                <View style={styles.cooked}>
                  <Text style={styles.cookedLabel}>作った</Text>
                  <Switch
                    value={entry.cooked}
                    onValueChange={(value) => void toggleCooked(entry, value)}
                    trackColor={{ true: colors.primary }}
                  />
                </View>
              </View>
            </View>
          ))}

          <Pressable
            onPress={() => void recordMeal(slot)}
            disabled={busy}
            style={styles.recordRow}>
            <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
            <Text style={styles.recordText}>この内容で食事を記録する</Text>
          </Pressable>
        </Card>
      ))}

      <Text style={styles.note}>
        「作った」を付けると、その料理の材料ぶんだけ冷蔵庫の在庫が減ります。
      </Text>

      <Button
        title="献立を作り直す"
        variant="secondary"
        onPress={() => router.replace({ pathname: '/menu/generate', params: { date } })}
      />
      <Button title="この日の献立を削除" variant="ghost" onPress={confirmDelete} />
    </Screen>
  );
}

function formatDiff(value: number): string {
  const rounded = Math.round(value);
  return rounded >= 0 ? `+${rounded}` : `−${Math.abs(rounded)}`;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  total: { fontSize: fontSize.sm, color: colors.textSub, fontWeight: '600' },
  compare: { fontSize: fontSize.sm, color: colors.textSub },
  macros: { fontSize: fontSize.xs, color: colors.textFaint },
  entry: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  dishName: { fontSize: fontSize.md, color: colors.text },
  dishSub: { fontSize: fontSize.xs, color: colors.textFaint, marginTop: 2 },
  cooked: { alignItems: 'center', gap: 2 },
  cookedLabel: { fontSize: fontSize.xs, color: colors.textFaint },
  recordRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingTop: spacing.xs },
  recordText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600' },
  note: { fontSize: fontSize.xs, color: colors.textFaint, lineHeight: 18 },
});
