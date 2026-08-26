import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/ui/header';
import { Card, CardTitle, Divider, ProgressBar, Row, Screen } from '@/components/ui/layout';
import { getActivityKcal, getHealthDaily, type HealthDaily } from '@/db/repo/activities';
import { getDailyTotals, type DailyTotals } from '@/db/repo/meals';
import { getWeight } from '@/db/repo/weights';
import { calcAge, formatDayLabel, today } from '@/lib/day';
import { estimateBurn, resolveBurn, type EstimatedBurn } from '@/lib/energy';
import { calcBmi } from '@/lib/targets';
import { useAppStore } from '@/store/app';
import { colors, fontSize, radius, spacing } from '@/theme/colors';

export default function HomeScreen() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const settings = useAppStore((s) => s.settings);
  const currentWeightKg = useAppStore((s) => s.currentWeightKg);

  const [totals, setTotals] = useState<DailyTotals | null>(null);
  const [exerciseKcal, setExerciseKcal] = useState(0);
  const [health, setHealth] = useState<HealthDaily | null>(null);
  const [todayWeight, setTodayWeight] = useState<number | null>(null);
  const [bodyFat, setBodyFat] = useState<number | null>(null);

  const day = today(settings.dayStartHour);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function load() {
        const [dailyTotals, kcal, healthRow, weightRow] = await Promise.all([
          getDailyTotals(day),
          getActivityKcal(day),
          getHealthDaily(day),
          getWeight(day),
        ]);
        if (cancelled) return;
        setTotals(dailyTotals);
        setExerciseKcal(kcal);
        setHealth(healthRow);
        setTodayWeight(weightRow?.weightKg ?? null);
        setBodyFat(weightRow?.bodyFatPct ?? null);
      }
      load().catch((error) => console.error('ホームの読み込みに失敗しました', error));
      return () => {
        cancelled = true;
      };
    }, [day])
  );

  if (!profile) return null;

  const intakeKcal = totals?.kcal ?? 0;
  const weightKg = todayWeight ?? currentWeightKg;

  const estimate: EstimatedBurn | null = weightKg
    ? estimateBurn({
        gender: profile.gender,
        ageYears: calcAge(profile.birthDate),
        heightCm: profile.heightCm,
        weightKg,
        activityLevel: profile.activityLevel,
      })
    : null;

  const burn = estimate
    ? resolveBurn(settings.burnSource, estimate, health)
    : null;

  const remaining = {
    kcal: profile.targetKcal - intakeKcal,
    proteinG: profile.targetProteinG - (totals?.proteinG ?? 0),
    fatG: profile.targetFatG - (totals?.fatG ?? 0),
    carbG: profile.targetCarbG - (totals?.carbG ?? 0),
  };

  return (
    <Screen>
      <ScreenHeader title="今日の状態" subtitle={formatDayLabel(day)} />

      {/* 摂取カロリー */}
      <Card>
        <CardTitle>摂取カロリー</CardTitle>
        <View style={styles.kcalRow}>
          <Text style={styles.kcalValue}>{Math.round(intakeKcal).toLocaleString()}</Text>
          <Text style={styles.kcalTarget}>/ {profile.targetKcal.toLocaleString()} kcal</Text>
        </View>
        <ProgressBar value={intakeKcal} max={profile.targetKcal} />
        <Text style={styles.percent}>
          {profile.targetKcal > 0 ? Math.round((intakeKcal / profile.targetKcal) * 100) : 0}%
        </Text>
      </Card>

      {/* PFC */}
      <Card>
        <CardTitle>PFCバランス</CardTitle>
        <MacroBar
          label="タンパク質"
          mark="P"
          value={totals?.proteinG ?? 0}
          target={profile.targetProteinG}
          color={colors.protein}
        />
        <MacroBar
          label="脂質"
          mark="F"
          value={totals?.fatG ?? 0}
          target={profile.targetFatG}
          color={colors.fat}
        />
        <MacroBar
          label="炭水化物"
          mark="C"
          value={totals?.carbG ?? 0}
          target={profile.targetCarbG}
          color={colors.carb}
        />
      </Card>

      {/* 消費カロリー */}
      <Card>
        <CardTitle
          right={
            burn?.fellBack ? <Text style={styles.fallback}>ウォッチ未取得のため推定値</Text> : undefined
          }>
          消費カロリー
        </CardTitle>
        <View style={styles.burnRow}>
          <View style={styles.burnBox}>
            <Text style={styles.burnLabel}>推定</Text>
            <Text style={styles.burnValue}>
              {estimate ? Math.round(estimate.total).toLocaleString() : '—'}
            </Text>
            <Text style={styles.burnUnit}>kcal</Text>
          </View>
          <View style={styles.burnBox}>
            <Text style={styles.burnLabel}>Watch</Text>
            <Text style={styles.burnValue}>
              {health?.totalKcal != null ? Math.round(health.totalKcal).toLocaleString() : '—'}
            </Text>
            <Text style={styles.burnUnit}>kcal</Text>
          </View>
        </View>

        {(exerciseKcal > 0 || health?.steps != null) && (
          <>
            <Divider />
            {health?.steps != null && (
              <Row label="歩数" value={`${health.steps.toLocaleString()} 歩`} />
            )}
            {exerciseKcal > 0 && (
              <Row label="運動による消費" value={`${Math.round(exerciseKcal)} kcal`} />
            )}
          </>
        )}

        {burn != null && (
          <Text style={styles.balance}>
            カロリー収支 {formatSigned(intakeKcal - burn.kcal)} kcal
          </Text>
        )}
      </Card>

      {/* 体重 */}
      <Pressable onPress={() => router.push('/weight')}>
        <Card>
          <CardTitle right={<Ionicons name="chevron-forward" size={18} color={colors.textFaint} />}>
            体重
          </CardTitle>
          <View style={styles.weightRow}>
            <Text style={styles.weightValue}>
              {weightKg != null ? weightKg.toFixed(1) : '—'}
              <Text style={styles.weightUnit}> kg</Text>
            </Text>
            <View style={styles.weightSide}>
              {bodyFat != null && (
                <View style={styles.sideBox}>
                  <Text style={styles.sideLabel}>体脂肪率</Text>
                  <Text style={styles.sideValue}>{bodyFat.toFixed(1)}%</Text>
                </View>
              )}
              {weightKg != null && (
                <View style={styles.sideBox}>
                  <Text style={styles.sideLabel}>BMI</Text>
                  <Text style={styles.sideValue}>
                    {calcBmi(weightKg, profile.heightCm).toFixed(1)}
                  </Text>
                </View>
              )}
            </View>
          </View>
          {todayWeight == null && (
            <Text style={styles.weightHint}>今日はまだ記録していません</Text>
          )}
        </Card>
      </Pressable>

      {/* 今日あと何を食べればいい？ */}
      <View style={styles.suggest}>
        <Text style={styles.suggestTitle}>今日あと何を食べればいい？</Text>
        <View style={styles.suggestRow}>
          <Text style={styles.suggestKcal}>{Math.round(Math.max(0, remaining.kcal)).toLocaleString()}</Text>
          <Text style={styles.suggestUnit}>kcal</Text>
        </View>
        <View style={styles.suggestMacros}>
          <Text style={styles.suggestMacro}>P {Math.round(Math.max(0, remaining.proteinG))}g</Text>
          <Text style={styles.suggestMacro}>F {Math.round(Math.max(0, remaining.fatG))}g</Text>
          <Text style={styles.suggestMacro}>C {Math.round(Math.max(0, remaining.carbG))}g</Text>
        </View>
        {remaining.kcal < 0 && (
          <Text style={styles.suggestOver}>
            目標を {Math.abs(Math.round(remaining.kcal))} kcal 超えています
          </Text>
        )}
      </View>

      {/* 記録への導線 */}
      <Pressable
        onPress={() => router.push({ pathname: '/meal/new', params: { date: day } })}
        style={({ pressed }) => [styles.record, pressed && styles.pressed]}>
        <Ionicons name="add-circle" size={22} color={colors.textOnPrimary} />
        <Text style={styles.recordText}>食事を記録する</Text>
      </Pressable>
    </Screen>
  );
}

function formatSigned(value: number): string {
  const rounded = Math.round(value);
  return rounded >= 0 ? `+${rounded.toLocaleString()}` : `−${Math.abs(rounded).toLocaleString()}`;
}

function MacroBar({
  label,
  mark,
  value,
  target,
  color,
}: {
  label: string;
  mark: string;
  value: number;
  target: number;
  color: string;
}) {
  return (
    <View style={styles.macro}>
      <View style={styles.macroHeader}>
        <View style={styles.macroLabelRow}>
          <View style={[styles.macroMark, { backgroundColor: color }]}>
            <Text style={styles.macroMarkText}>{mark}</Text>
          </View>
          <Text style={styles.macroLabel}>{label}</Text>
        </View>
        <Text style={styles.macroValue}>
          {Math.round(value)} / {Math.round(target)}g
        </Text>
      </View>
      <ProgressBar value={value} max={target} color={color} height={6} />
    </View>
  );
}

const styles = StyleSheet.create({
  kcalRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  kcalValue: { fontSize: fontSize.display, fontWeight: '700', color: colors.text },
  kcalTarget: { fontSize: fontSize.md, color: colors.textSub },
  percent: { fontSize: fontSize.xs, color: colors.textFaint, textAlign: 'right' },

  macro: { gap: spacing.xs },
  macroHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  macroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  macroMark: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  macroMarkText: { color: colors.textOnPrimary, fontSize: 10, fontWeight: '700' },
  macroLabel: { fontSize: fontSize.sm, color: colors.text },
  macroValue: { fontSize: fontSize.sm, color: colors.textSub, fontWeight: '600' },

  burnRow: { flexDirection: 'row', gap: spacing.md },
  burnBox: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  burnLabel: { fontSize: fontSize.xs, color: colors.textFaint },
  burnValue: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  burnUnit: { fontSize: fontSize.xs, color: colors.textFaint },
  fallback: { fontSize: fontSize.xs, color: colors.warning },
  balance: { fontSize: fontSize.sm, color: colors.textSub, textAlign: 'right', fontWeight: '600' },

  weightRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weightValue: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.text },
  weightUnit: { fontSize: fontSize.md, fontWeight: '600', color: colors.textSub },
  weightSide: { flexDirection: 'row', gap: spacing.lg },
  sideBox: { alignItems: 'flex-end' },
  sideLabel: { fontSize: fontSize.xs, color: colors.textFaint },
  sideValue: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  weightHint: { fontSize: fontSize.xs, color: colors.textFaint },

  suggest: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  suggestTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.primaryDark },
  suggestRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  suggestKcal: { fontSize: fontSize.display, fontWeight: '700', color: colors.primaryDark },
  suggestUnit: { fontSize: fontSize.md, color: colors.primaryDark },
  suggestMacros: { flexDirection: 'row', gap: spacing.lg },
  suggestMacro: { fontSize: fontSize.sm, color: colors.primaryDark, fontWeight: '600' },
  suggestOver: { fontSize: fontSize.sm, color: colors.danger, fontWeight: '600' },

  record: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
  },
  pressed: { opacity: 0.8 },
  recordText: { fontSize: fontSize.md, fontWeight: '700', color: colors.textOnPrimary },
});
