import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/ui/header';
import { ProgressRing } from '@/components/ui/charts';
import { Card, CardTitle, Divider, ProgressBar, Row, Screen } from '@/components/ui/layout';
import {
  getActivityKcal,
  getHealthDaily,
  listDailyActivityKcal,
  type HealthDaily,
} from '@/db/repo/activities';
import { getDailyTotals, listDailyTotals, type DailyTotals } from '@/db/repo/meals';
import { getWeight } from '@/db/repo/weights';
import { useTodayKey } from '@/hooks/use-today';
import { addDays, calcAge, formatDayLabel } from '@/lib/day';
import { adjustedTarget, computeAdjustment, type AdjustmentResult } from '@/lib/adjustment';
import { estimateBurn, exerciseBonus, resolveBurn, type EstimatedBurn } from '@/lib/energy';
import { calcBmi } from '@/lib/targets';
import { useAppStore } from '@/store/app';
import { colors, fontSize, radius, spacing } from '@/theme/colors';

export default function HomeScreen() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const settings = useAppStore((s) => s.settings);
  const currentWeightKg = useAppStore((s) => s.currentWeightKg);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const [totals, setTotals] = useState<DailyTotals | null>(null);
  const [exerciseKcal, setExerciseKcal] = useState(0);
  const [health, setHealth] = useState<HealthDaily | null>(null);
  const [todayWeight, setTodayWeight] = useState<number | null>(null);
  const [bodyFat, setBodyFat] = useState<number | null>(null);
  const [adjustment, setAdjustment] = useState<AdjustmentResult | null>(null);

  const day = useTodayKey(settings.dayStartHour);
  // フックの依存に使うため、プロフィールが無い場合も値を取り出しておく
  const profileTargetKcal = profile?.targetKcal ?? 0;

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function load() {
        // 食べ過ぎ調整は今日より前の記録だけを見る
        const historyFrom = addDays(day, -settings.adjustmentDays);
        const [dailyTotals, kcal, healthRow, weightRow, history, historyExercise] =
          await Promise.all([
            getDailyTotals(day),
            getActivityKcal(day),
            getHealthDaily(day),
            getWeight(day),
            listDailyTotals(historyFrom, addDays(day, -1)),
            listDailyActivityKcal(historyFrom, addDays(day, -1)),
          ]);
        if (cancelled) return;
        setTotals(dailyTotals);
        setExerciseKcal(kcal);
        setHealth(healthRow);
        setTodayWeight(weightRow?.weightKg ?? null);
        setBodyFat(weightRow?.bodyFatPct ?? null);
        // 過去の日も、当時その日の画面に出ていた目標（＝運動ぶんを上乗せした値）と比べる
        const exerciseByDate = new Map(historyExercise.map((row) => [row.date, row.kcal]));
        const bonusSettings = {
          addExerciseToTarget: settings.addExerciseToTarget,
          exerciseAddRatio: settings.exerciseAddRatio,
        };
        setAdjustment(
          computeAdjustment({
            targetKcal: profileTargetKcal,
            // listDailyTotals は記録のある日だけを返すので、そのまま渡してよい
            history: history.map((row) => ({
              date: row.date,
              intakeKcal: row.kcal,
              recorded: true,
              bonusKcal: exerciseBonus(exerciseByDate.get(row.date) ?? 0, bonusSettings),
            })),
            settings: {
              enabled: settings.adjustmentEnabled,
              days: settings.adjustmentDays,
              capPct: settings.adjustmentCapPct,
              distribution: settings.adjustmentDistribution,
            },
          }),
        );
      }
      load().catch((error) => console.error('ホームの読み込みに失敗しました', error));
      return () => {
        cancelled = true;
      };
    }, [
      day,
      profileTargetKcal,
      settings.addExerciseToTarget,
      settings.exerciseAddRatio,
      settings.adjustmentEnabled,
      settings.adjustmentDays,
      settings.adjustmentCapPct,
      settings.adjustmentDistribution,
    ]),
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

  const burn = estimate ? resolveBurn(settings.burnSource, estimate, health) : null;

  // 設定で「運動した分を目標に加算する」をオンにしている場合だけ上乗せする
  const bonusKcal = exerciseBonus(exerciseKcal, settings);
  // 直近の食べ過ぎ・食べ足りない分の補正
  const adjustmentKcal = adjustment?.adjustmentKcal ?? 0;
  const adjustedTargetKcal = adjustedTarget(profile.targetKcal + bonusKcal, adjustmentKcal);

  const overTarget = adjustedTargetKcal > 0 && intakeKcal > adjustedTargetKcal;

  const remaining = {
    kcal: adjustedTargetKcal - intakeKcal,
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

        <ProgressRing value={intakeKcal} max={adjustedTargetKcal}>
          <Text style={[styles.ringValue, overTarget && styles.ringValueOver]}>
            {Math.round(intakeKcal).toLocaleString()}
          </Text>
          <Text style={styles.ringUnit}>
            / {Math.round(adjustedTargetKcal).toLocaleString()} kcal
          </Text>
          {overTarget ? (
            <Text style={styles.ringOver}>
              {Math.round(intakeKcal - adjustedTargetKcal).toLocaleString()} kcal 超過
            </Text>
          ) : (
            <Text style={styles.ringRemain}>
              あと {Math.round(adjustedTargetKcal - intakeKcal).toLocaleString()} kcal
            </Text>
          )}
        </ProgressRing>

        <View style={styles.kcalFooter}>
          <View style={styles.adjustNotes}>
            {bonusKcal > 0 && (
              <Text style={styles.bonus}>運動分 +{Math.round(bonusKcal)} kcal</Text>
            )}
            {adjustmentKcal !== 0 && (
              <Text style={[styles.bonus, adjustmentKcal < 0 && { color: colors.warning }]}>
                調整 {adjustmentKcal > 0 ? '+' : '−'}
                {Math.abs(adjustmentKcal)} kcal
              </Text>
            )}
          </View>
          <Text style={[styles.percent, overTarget && styles.percentOver]}>
            {adjustedTargetKcal > 0 ? Math.round((intakeKcal / adjustedTargetKcal) * 100) : 0}%
          </Text>
        </View>

        {exerciseKcal > 0 && (
          <>
            <Divider />
            <Row
              label="運動した分を目標に足す"
              sub={
                settings.addExerciseToTarget
                  ? `今日の運動 ${Math.round(exerciseKcal)} kcal のうち ${Math.round(bonusKcal)} kcal を足しています`
                  : `今日の運動 ${Math.round(exerciseKcal)} kcal は足していません`
              }
              value={
                <Switch
                  value={settings.addExerciseToTarget}
                  onValueChange={(value) => void updateSettings({ addExerciseToTarget: value })}
                  trackColor={{ true: colors.primary }}
                />
              }
            />
          </>
        )}
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
            burn?.fellBack ? (
              <Text style={styles.fallback}>ウォッチ未取得のため推定値</Text>
            ) : undefined
          }
        >
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
          {todayWeight == null && <Text style={styles.weightHint}>今日はまだ記録していません</Text>}
        </Card>
      </Pressable>

      {/* 今日あと何を食べればいい？ */}
      <Pressable
        onPress={() =>
          router.push({
            pathname: '/suggest',
            params: {
              kcal: Math.max(0, Math.round(remaining.kcal)),
              protein: Math.max(0, Math.round(remaining.proteinG)),
              fat: Math.max(0, Math.round(remaining.fatG)),
              carb: Math.max(0, Math.round(remaining.carbG)),
            },
          })
        }
        style={styles.suggest}
      >
        <Text style={styles.suggestTitle}>今日あと何を食べればいい？</Text>
        <View style={styles.suggestRow}>
          <Text style={styles.suggestKcal}>
            {Math.round(Math.max(0, remaining.kcal)).toLocaleString()}
          </Text>
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
        <View style={styles.suggestAction}>
          <Text style={styles.suggestActionText}>おすすめを見る</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.primaryDark} />
        </View>
      </Pressable>

      {/* 記録への導線 */}
      <Pressable
        onPress={() => router.push({ pathname: '/meal/new', params: { date: day } })}
        style={({ pressed }) => [styles.record, pressed && styles.pressed]}
      >
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
  ringValue: { fontSize: fontSize.display, fontWeight: '800', color: colors.text },
  ringValueOver: { color: colors.danger },
  ringUnit: { fontSize: fontSize.sm, color: colors.textSub },
  ringRemain: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '700', marginTop: 2 },
  ringOver: { fontSize: fontSize.xs, color: colors.danger, fontWeight: '700', marginTop: 2 },
  kcalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  adjustNotes: { flexDirection: 'row', gap: spacing.md },
  bonus: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '600' },
  percent: {
    fontSize: fontSize.xs,
    color: colors.textFaint,
    textAlign: 'right',
  },
  percentOver: { color: colors.danger, fontWeight: '700' },

  macro: { gap: spacing.xs },
  macroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  macroLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  macroMark: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  macroMarkText: {
    color: colors.textOnPrimary,
    fontSize: 10,
    fontWeight: '700',
  },
  macroLabel: { fontSize: fontSize.sm, color: colors.text },
  macroValue: {
    fontSize: fontSize.sm,
    color: colors.textSub,
    fontWeight: '600',
  },

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
  balance: {
    fontSize: fontSize.sm,
    color: colors.textSub,
    textAlign: 'right',
    fontWeight: '600',
  },

  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weightValue: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
  },
  weightUnit: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textSub,
  },
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
  suggestTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  suggestRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  suggestKcal: {
    fontSize: fontSize.display,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  suggestUnit: { fontSize: fontSize.md, color: colors.primaryDark },
  suggestMacros: { flexDirection: 'row', gap: spacing.lg },
  suggestMacro: {
    fontSize: fontSize.sm,
    color: colors.primaryDark,
    fontWeight: '600',
  },
  suggestOver: {
    fontSize: fontSize.sm,
    color: colors.danger,
    fontWeight: '600',
  },
  suggestAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
  },
  suggestActionText: {
    fontSize: fontSize.sm,
    color: colors.primaryDark,
    fontWeight: '700',
  },

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
  recordText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textOnPrimary,
  },
});
