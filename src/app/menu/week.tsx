import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/controls';
import { Card, CardTitle, Divider, Row, Screen } from '@/components/ui/layout';
import { listPlanForRange, savePlanForDate, type PlanEntryRecord } from '@/db/repo/meal-plans';
import { generatePlan } from '@/db/repo/plan-generator';
import { useTodayKey } from '@/hooks/use-today';
import { showAlert } from '@/lib/alert';
import { addDays, dateRange, formatDayLabel, type DayKey } from '@/lib/day';
import { MEAL_SLOT_LABELS, MEAL_SLOT_ORDER, type MealSlot } from '@/lib/types';
import { useAppStore } from '@/store/app';
import { colors, fontSize, spacing } from '@/theme/colors';

const DAYS = 7;

export default function WeekPlanScreen() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const settings = useAppStore((s) => s.settings);
  const todayKey = useTodayKey(settings.dayStartHour);

  const from = todayKey;
  const to = addDays(todayKey, DAYS - 1);
  const days = dateRange(from, to);

  const [entries, setEntries] = useState<PlanEntryRecord[]>([]);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  // 画面を離れて戻ると state は初期化されるため、走行中かどうかは ref で持つ
  const runningRef = useRef(false);

  const reload = useCallback(async () => {
    setEntries(await listPlanForRange(from, to));
  }, [from, to]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const byDate = new Map<DayKey, PlanEntryRecord[]>();
  for (const entry of entries) {
    const list = byDate.get(entry.date) ?? [];
    list.push(entry);
    byDate.set(entry.date, list);
  }

  const filledDays = days.filter((date) => (byDate.get(date) ?? []).length > 0).length;

  async function generateWeek() {
    if (!profile || runningRef.current) return;
    runningRef.current = true;
    setGenerating(true);
    setProgress(0);
    try {
      for (const [index, date] of days.entries()) {
        // 日ごとに variant をずらし、7日間で同じ献立が並ばないようにする
        const plan = await generatePlan({
          date,
          target: {
            kcal: profile.targetKcal,
            proteinG: profile.targetProteinG,
            fatG: profile.targetFatG,
            carbG: profile.targetCarbG,
          },
          mood: {},
          variant: index * 3,
        });
        await savePlanForDate(
          date,
          plan.meals.flatMap((meal) =>
            meal.entries.map((entry) => ({
              slot: meal.slot,
              dishId: entry.dish.id,
              servings: entry.servings,
            })),
          ),
        );
        setProgress(index + 1);
      }
      await reload();
    } catch (error) {
      console.error('1週間の献立作成に失敗しました', error);
      showAlert('作成できませんでした', 'もう一度お試しください。');
    } finally {
      runningRef.current = false;
      setGenerating(false);
    }
  }

  function confirmGenerate() {
    if (filledDays === 0) {
      void generateWeek();
      return;
    }
    showAlert(
      '既存の献立を置き換えますか？',
      `${filledDays}日ぶんの献立が登録されています。作り直すと上書きされます。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '作り直す', onPress: () => void generateWeek() },
      ],
    );
  }

  return (
    <Screen>
      <Card>
        <CardTitle>
          {formatDayLabel(from)} 〜 {formatDayLabel(to)}
        </CardTitle>
        <Text style={styles.note}>
          7日分をまとめて作ります。日ごとに違う組み合わせになるよう調整しています。
        </Text>
        <Button
          title={generating ? `作成中… (${progress}/${DAYS})` : '1週間分を作る'}
          onPress={confirmGenerate}
          disabled={generating}
        />
      </Card>

      {days.map((date) => {
        const dayEntries = byDate.get(date) ?? [];
        const bySlot = new Map<MealSlot, PlanEntryRecord[]>();
        for (const entry of dayEntries) {
          const list = bySlot.get(entry.slot) ?? [];
          list.push(entry);
          bySlot.set(entry.slot, list);
        }

        return (
          <Pressable
            key={date}
            onPress={() => router.push({ pathname: '/menu/today', params: { date } })}
          >
            <Card>
              <CardTitle
                right={<Ionicons name="chevron-forward" size={16} color={colors.textFaint} />}
              >
                {formatDayLabel(date)}
              </CardTitle>

              {dayEntries.length === 0 ? (
                <Text style={styles.empty}>献立なし</Text>
              ) : (
                MEAL_SLOT_ORDER.filter((slot) => (bySlot.get(slot) ?? []).length > 0).map(
                  (slot, index) => (
                    <View key={slot}>
                      {index > 0 && <Divider />}
                      <Row
                        label={MEAL_SLOT_LABELS[slot]}
                        value={(bySlot.get(slot) ?? [])
                          .map((entry) => entry.dish?.name ?? '—')
                          .join('、')}
                      />
                    </View>
                  ),
                )
              )}
            </Card>
          </Pressable>
        );
      })}

      {filledDays > 0 && (
        <Button
          title="食材を集計する（買い物リスト）"
          onPress={() => router.push({ pathname: '/menu/shopping', params: { from, to } })}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: fontSize.sm, color: colors.textSub, lineHeight: 20 },
  empty: { fontSize: fontSize.sm, color: colors.textFaint, paddingVertical: spacing.xs },
});
