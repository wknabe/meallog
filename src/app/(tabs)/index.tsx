import { StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/ui/header';
import { Card, CardTitle, ProgressBar, Screen } from '@/components/ui/layout';
import { formatDayLabel, today } from '@/lib/day';
import { calcBmi } from '@/lib/targets';
import { useAppStore } from '@/store/app';
import { colors, fontSize, spacing } from '@/theme/colors';

/**
 * ホーム画面。
 * 今はまだ食事記録がないため摂取量は0で表示する。フェーズ2で実データに差し替える。
 */
export default function HomeScreen() {
  const profile = useAppStore((s) => s.profile);
  const settings = useAppStore((s) => s.settings);
  const currentWeightKg = useAppStore((s) => s.currentWeightKg);

  if (!profile) return null;

  const day = today(settings.dayStartHour);
  const intakeKcal = 0;

  return (
    <Screen>
      <ScreenHeader title="今日の状態" subtitle={formatDayLabel(day)} />

      <Card>
        <CardTitle>摂取カロリー</CardTitle>
        <View style={styles.kcalRow}>
          <Text style={styles.kcalValue}>{intakeKcal.toLocaleString()}</Text>
          <Text style={styles.kcalTarget}>/ {profile.targetKcal.toLocaleString()} kcal</Text>
        </View>
        <ProgressBar value={intakeKcal} max={profile.targetKcal} />
        <Text style={styles.percent}>
          {Math.round((intakeKcal / profile.targetKcal) * 100)}%
        </Text>
      </Card>

      <Card>
        <CardTitle>PFCバランス</CardTitle>
        <MacroBar label="タンパク質" mark="P" value={0} target={profile.targetProteinG} color={colors.protein} />
        <MacroBar label="脂質" mark="F" value={0} target={profile.targetFatG} color={colors.fat} />
        <MacroBar label="炭水化物" mark="C" value={0} target={profile.targetCarbG} color={colors.carb} />
      </Card>

      <Card>
        <CardTitle>体重</CardTitle>
        <View style={styles.weightRow}>
          <View>
            <Text style={styles.weightValue}>
              {currentWeightKg != null ? currentWeightKg.toFixed(1) : '—'}
              <Text style={styles.weightUnit}> kg</Text>
            </Text>
          </View>
          {currentWeightKg != null && (
            <View style={styles.bmiBox}>
              <Text style={styles.bmiLabel}>BMI</Text>
              <Text style={styles.bmiValue}>
                {calcBmi(currentWeightKg, profile.heightCm).toFixed(1)}
              </Text>
            </View>
          )}
        </View>
      </Card>

      <Text style={styles.note}>
        食事の記録・運動・献立はこれから追加していきます。
      </Text>
    </Screen>
  );
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
  macroMark: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  macroMarkText: { color: colors.textOnPrimary, fontSize: 10, fontWeight: '700' },
  macroLabel: { fontSize: fontSize.sm, color: colors.text },
  macroValue: { fontSize: fontSize.sm, color: colors.textSub, fontWeight: '600' },

  weightRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weightValue: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.text },
  weightUnit: { fontSize: fontSize.md, fontWeight: '600', color: colors.textSub },
  bmiBox: { alignItems: 'flex-end' },
  bmiLabel: { fontSize: fontSize.xs, color: colors.textFaint },
  bmiValue: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },

  note: { fontSize: fontSize.xs, color: colors.textFaint, textAlign: 'center', marginTop: spacing.sm },
});
