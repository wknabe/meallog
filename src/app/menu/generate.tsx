import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Button, Chip, ChipGroup, Field } from '@/components/ui/controls';
import { Card, CardTitle, Divider, EmptyState, Row, Screen } from '@/components/ui/layout';
import { savePlanForDate } from '@/db/repo/meal-plans';
import { generatePlan } from '@/db/repo/plan-generator';
import { useTodayKey } from '@/hooks/use-today';
import { showAlert } from '@/lib/alert';
import { formatDayLabel } from '@/lib/day';
import type { DayPlan } from '@/lib/mealplan';
import {
  CUISINE_LABELS,
  EFFORT_LABELS,
  MEAL_SLOT_LABELS,
  TASTE_LABELS,
  VOLUME_LABELS,
  type Cuisine,
  type Effort,
  type Taste,
  type Volume,
} from '@/lib/types';
import { useAppStore } from '@/store/app';
import { colors, fontSize, radius, spacing } from '@/theme/colors';

const CUISINES: Cuisine[] = ['japanese', 'western', 'chinese', 'ethnic'];
const EFFORTS: Effort[] = ['full', 'easy', 'heatonly', 'nocook'];
const VOLUMES: Volume[] = ['hearty', 'normal', 'light'];
const TASTES: Taste[] = ['light', 'rich', 'spicy', 'warm'];

export default function GeneratePlanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string; usePantry?: string }>();
  const profile = useAppStore((s) => s.profile);
  const settings = useAppStore((s) => s.settings);
  const todayKey = useTodayKey(settings.dayStartHour);
  const date = params.date ?? todayKey;

  // 未選択＝こだわらない。全部選ばなくても献立は出る
  const [cuisine, setCuisine] = useState<Cuisine | null>(null);
  const [effort, setEffort] = useState<Effort | null>(null);
  const [volume, setVolume] = useState<Volume | null>(null);
  const [tastes, setTastes] = useState<Taste[]>([]);
  const [usePantry, setUsePantry] = useState(params.usePantry === '1');
  const [variant, setVariant] = useState(0);
  const [plan, setPlan] = useState<DayPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // 条件を素早く切り替えたとき、古い結果が新しい結果を上書きしないようにする
  const requestIdRef = useRef(0);

  const run = useCallback(
    async (nextVariant: number) => {
      if (!profile) return;
      const requestId = ++requestIdRef.current;
      setLoading(true);
      try {
        const result = await generatePlan({
          date,
          target: {
            kcal: profile.targetKcal,
            proteinG: profile.targetProteinG,
            fatG: profile.targetFatG,
            carbG: profile.targetCarbG,
          },
          mood: {
            cuisine: cuisine ?? undefined,
            effort: effort ?? undefined,
            volume: volume ?? undefined,
            tastes: tastes.length > 0 ? tastes : undefined,
          },
          variant: nextVariant,
          usePantry,
        });
        if (requestId !== requestIdRef.current) return;
        setPlan(result);
      } catch (error) {
        if (requestId !== requestIdRef.current) return;
        console.error('献立の作成に失敗しました', error);
        showAlert('作成できませんでした', 'もう一度お試しください。');
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [profile, date, cuisine, effort, volume, tastes, usePantry],
  );

  // 条件を変えたら作り直す
  useEffect(() => {
    setVariant(0);
    void run(0);
  }, [run]);

  async function handleSave() {
    if (!plan || saving) return;
    setSaving(true);
    try {
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
      router.replace('/menu/today');
    } catch (error) {
      console.error('献立の保存に失敗しました', error);
      showAlert('保存できませんでした', 'もう一度お試しください。');
    } finally {
      setSaving(false);
    }
  }

  if (!profile) return null;

  return (
    <Screen>
      <Card>
        <CardTitle>目標</CardTitle>
        <Row label={formatDayLabel(date)} value={`${profile.targetKcal.toLocaleString()} kcal`} />
        <Text style={styles.macroLine}>
          P {profile.targetProteinG}g ／ F {profile.targetFatG}g ／ C {profile.targetCarbG}g
        </Text>
      </Card>

      {/* 気分の4軸。未選択のままでも作れる */}
      <Card>
        <CardTitle>今の気分</CardTitle>
        <Text style={styles.hint}>選ばなければ「こだわらない」として扱います。</Text>

        <Field label="ジャンル">
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
        </Field>

        <Field label="手間">
          <ChipGroup>
            {EFFORTS.map((value) => (
              <Chip
                key={value}
                label={EFFORT_LABELS[value]}
                selected={effort === value}
                onPress={() => setEffort(effort === value ? null : value)}
              />
            ))}
          </ChipGroup>
        </Field>

        <Field label="ボリューム">
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
        </Field>

        <Field label="味の方向" hint="複数選べます">
          <ChipGroup>
            {TASTES.map((value) => (
              <Chip
                key={value}
                label={TASTE_LABELS[value]}
                selected={tastes.includes(value)}
                onPress={() =>
                  setTastes(
                    tastes.includes(value)
                      ? tastes.filter((taste) => taste !== value)
                      : [...tastes, value],
                  )
                }
              />
            ))}
          </ChipGroup>
        </Field>

        <Row
          label="冷蔵庫の食材を優先する"
          value={
            <Switch
              value={usePantry}
              onValueChange={setUsePantry}
              trackColor={{ true: colors.primary }}
            />
          }
        />
      </Card>

      {loading ? (
        <EmptyState title="組み立てています…" />
      ) : plan == null || plan.meals.every((meal) => meal.entries.length === 0) ? (
        <EmptyState
          title="献立を作れませんでした"
          description="料理データが足りない可能性があります。条件を外して試してください。"
        />
      ) : (
        <>
          {plan.reasons.length > 0 && (
            <View style={styles.reasons}>
              {plan.reasons.map((reason) => (
                <View key={reason} style={styles.reasonRow}>
                  <Ionicons name="information-circle" size={14} color={colors.primaryDark} />
                  <Text style={styles.reasonText}>{reason}</Text>
                </View>
              ))}
            </View>
          )}

          {plan.meals.map((meal) => {
            const mealTotals = meal.entries.reduce(
              (sum, entry) => ({
                kcal: sum.kcal + entry.dish.perServing.kcal * entry.servings,
                proteinG: sum.proteinG + entry.dish.perServing.protein_g * entry.servings,
                fatG: sum.fatG + entry.dish.perServing.fat_g * entry.servings,
                carbG: sum.carbG + entry.dish.perServing.carb_g * entry.servings,
              }),
              { kcal: 0, proteinG: 0, fatG: 0, carbG: 0 },
            );
            return (
              <Card key={meal.slot}>
                <CardTitle
                  right={<Text style={styles.mealKcal}>{Math.round(mealTotals.kcal)} kcal</Text>}
                >
                  {MEAL_SLOT_LABELS[meal.slot]}
                </CardTitle>
                {meal.entries.map((entry) => (
                  <Row
                    key={entry.dish.id}
                    label={entry.dish.name}
                    sub={entry.servings !== 1 ? `${entry.servings}人前` : undefined}
                    value={`${Math.round(entry.dish.perServing.kcal * entry.servings)} kcal`}
                  />
                ))}
                <Text style={styles.mealMacros}>
                  P {Math.round(mealTotals.proteinG)}g ／ F {Math.round(mealTotals.fatG)}g ／ C{' '}
                  {Math.round(mealTotals.carbG)}g
                </Text>
              </Card>
            );
          })}

          <Card>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>合計</Text>
              <Text style={styles.totalValue}>
                {Math.round(plan.totals.kcal).toLocaleString()} kcal
              </Text>
            </View>
            <Divider />
            <Row label="目標との差" value={formatDiff(plan.totals.kcal - profile.targetKcal)} />
            <Text style={styles.mealMacros}>
              P {Math.round(plan.totals.proteinG)}g ／ F {Math.round(plan.totals.fatG)}g ／ C{' '}
              {Math.round(plan.totals.carbG)}g
            </Text>
          </Card>

          <Pressable
            onPress={() => {
              const next = variant + 1;
              setVariant(next);
              void run(next);
            }}
            style={styles.reroll}
          >
            <Ionicons name="refresh" size={16} color={colors.primary} />
            <Text style={styles.rerollText}>別の献立にする</Text>
          </Pressable>

          <Button
            title={saving ? '保存中…' : 'この献立を保存'}
            onPress={() => void handleSave()}
            disabled={saving}
          />
        </>
      )}
    </Screen>
  );
}

function formatDiff(value: number): string {
  const rounded = Math.round(value);
  return rounded >= 0 ? `+${rounded} kcal` : `−${Math.abs(rounded)} kcal`;
}

const styles = StyleSheet.create({
  macroLine: { fontSize: fontSize.sm, color: colors.textSub },
  hint: { fontSize: fontSize.xs, color: colors.textFaint, lineHeight: 18 },
  reasons: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  reasonText: { flex: 1, fontSize: fontSize.sm, color: colors.primaryDark, lineHeight: 18 },
  mealKcal: { fontSize: fontSize.sm, color: colors.textSub, fontWeight: '600' },
  mealMacros: { fontSize: fontSize.xs, color: colors.textFaint },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  totalLabel: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  totalValue: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  reroll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  rerollText: { fontSize: fontSize.md, color: colors.primary, fontWeight: '600' },
});
