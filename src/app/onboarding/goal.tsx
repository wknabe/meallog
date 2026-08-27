import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { OnboardingStep } from '@/components/onboarding-step';
import { Field, NumberInput, OptionList } from '@/components/ui/controls';
import { DateField } from '@/components/ui/date-field';
import { addDays, differenceInDays, formatDayLabelWithYear, toDayKey } from '@/lib/day';
import { PACE_PRESETS, type PaceKey } from '@/lib/targets';
import { useOnboardingStore } from '@/store/onboarding';
import { colors, fontSize, radius, spacing } from '@/theme/colors';

/** ステップ2: 目標体重とペース */
export default function GoalStep() {
  const router = useRouter();
  const { weightKg, targetWeightKg, paceKey, targetDate, set, recalcTargetDate } =
    useOnboardingStore();

  // 目標体重かペースが変わったら達成希望日を引き直す
  useEffect(() => {
    recalcTargetDate();
  }, [targetWeightKg, paceKey, recalcTargetDate]);

  const current = Number(weightKg);
  const target = Number(targetWeightKg);
  const canProceed = target > 0 && targetDate != null;

  const diffKg = current && target ? current - target : 0;
  const days = targetDate ? differenceInDays(targetDate, toDayKey(new Date())) : 0;
  const kgPerWeek = days > 0 ? (diffKg / days) * 7 : 0;
  const tooFast = Math.abs(kgPerWeek) > 1;

  return (
    <OnboardingStep
      step={2}
      title="目標を決めましょう"
      description="目標体重と達成したい時期から、1日の目標カロリーを逆算します。"
      onNext={() => router.push('/onboarding/activity')}
      nextDisabled={!canProceed}
      onBack={() => router.back()}
    >
      <Field label="目標体重">
        <NumberInput
          value={targetWeightKg}
          onChangeText={(value) => set({ targetWeightKg: value })}
          unit="kg"
          placeholder={current ? String(current - 5) : '60.0'}
        />
      </Field>

      <Field label="ペース">
        <OptionList<PaceKey>
          options={PACE_PRESETS.map((preset) => ({
            value: preset.key,
            label: `${preset.label}（月${preset.kgPerMonth}kg）`,
            description: preset.note,
          }))}
          value={paceKey}
          onChange={(value) => set({ paceKey: value })}
        />
      </Field>

      <Field label="達成希望日" hint="ペースから自動で計算しています。直接指定することもできます。">
        <DateField
          value={targetDate}
          onChange={(value) => set({ targetDate: value })}
          minimumDate={new Date()}
        />
      </Field>

      {canProceed && (
        <View style={[styles.summary, tooFast && styles.summaryWarning]}>
          {tooFast ? (
            <>
              <Text style={styles.warningTitle}>ペースが速すぎます</Text>
              <Text style={styles.warningText}>
                週{Math.abs(kgPerWeek).toFixed(1)}
                kgのペースになります。体脂肪1kgは約7,200kcalに相当するため、
                食事だけで達成するのは現実的ではありません。達成希望日を延ばすことをおすすめします。
              </Text>
            </>
          ) : (
            <Text style={styles.summaryText}>
              {formatDayLabelWithYear(targetDate)}まで{days}日 ／ 週{Math.abs(kgPerWeek).toFixed(2)}
              kgのペース
            </Text>
          )}
        </View>
      )}
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  summary: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  summaryText: { fontSize: fontSize.sm, color: colors.primaryDark, fontWeight: '600' },
  summaryWarning: { backgroundColor: '#FDF0E6' },
  warningTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.warning },
  warningText: { fontSize: fontSize.sm, color: colors.textSub, lineHeight: 20 },
});
