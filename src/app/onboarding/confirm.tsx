import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { OnboardingStep } from '@/components/onboarding-step';
import { Field, NumberInput } from '@/components/ui/controls';
import { Card, Divider, Row } from '@/components/ui/layout';
import { saveWeight } from '@/db/repo/weights';
import { toDayKey } from '@/lib/day';
import { calcTargets } from '@/lib/targets';
import type { Profile } from '@/lib/types';
import { useAppStore } from '@/store/app';
import { useOnboardingStore } from '@/store/onboarding';
import { colors, fontSize, radius, spacing } from '@/theme/colors';

/** ステップ4: 算出結果の確認と編集 */
export default function ConfirmStep() {
  const router = useRouter();
  const draft = useOnboardingStore();
  const resetDraft = useOnboardingStore((s) => s.reset);
  const updateProfile = useAppStore((s) => s.updateProfile);
  const refreshWeight = useAppStore((s) => s.refreshWeight);

  const weightKg = Number(draft.weightKg);

  const result = useMemo(
    () =>
      calcTargets({
        gender: draft.gender ?? 'male',
        birthDate: draft.birthDate ?? '1990-01-01',
        heightCm: Number(draft.heightCm),
        weightKg,
        activityLevel: draft.activityLevel ?? 3,
        targetWeightKg: draft.targetWeightKg ? Number(draft.targetWeightKg) : null,
        targetDate: draft.targetDate,
      }),
    [draft, weightKg],
  );

  // 算出値を初期値として持ち、書き換えられたら「手動上書き」として保存する
  const [kcal, setKcal] = useState(String(result.kcal));
  const [protein, setProtein] = useState(String(result.proteinG));
  const [fat, setFat] = useState(String(result.fatG));
  const [carb, setCarb] = useState(String(result.carbG));
  const [saving, setSaving] = useState(false);

  const overridden =
    kcal !== String(result.kcal) ||
    protein !== String(result.proteinG) ||
    fat !== String(result.fatG) ||
    carb !== String(result.carbG);

  const valid = Number(kcal) > 0 && Number(protein) >= 0 && Number(fat) >= 0 && Number(carb) >= 0;

  async function handleStart() {
    if (saving) return;
    setSaving(true);
    try {
      const profile: Profile = {
        gender: draft.gender ?? 'male',
        birthDate: draft.birthDate ?? '1990-01-01',
        heightCm: Number(draft.heightCm),
        activityLevel: draft.activityLevel ?? 3,
        targetWeightKg: draft.targetWeightKg ? Number(draft.targetWeightKg) : null,
        targetDate: draft.targetDate,
        targetKcal: Number(kcal),
        targetProteinG: Number(protein),
        targetFatG: Number(fat),
        targetCarbG: Number(carb),
        targetsOverridden: overridden,
      };
      // 入力してもらった現在の体重を、初日の記録として残す
      await saveWeight({ date: toDayKey(new Date()), weightKg });
      await updateProfile(profile);
      await refreshWeight();
      resetDraft();
      router.replace('/');
    } finally {
      setSaving(false);
    }
  }

  return (
    <OnboardingStep
      step={4}
      title="この内容で始めます"
      description="計算した目標値です。合わないと感じたら、その場で書き換えられます。"
      nextLabel={saving ? '保存中…' : '始める'}
      onNext={handleStart}
      nextDisabled={!valid || saving}
      onBack={() => router.back()}
    >
      <Card>
        <Row label="基礎代謝" value={`${Math.round(result.bmr).toLocaleString()} kcal`} />
        <Divider />
        <Row
          label="推定消費カロリー"
          value={`${Math.round(result.tdee).toLocaleString()} kcal`}
          sub="基礎代謝 × 身体活動レベル"
        />
        <Divider />
        <Row
          label="1日の目標赤字"
          value={`${result.dailyDeficit >= 0 ? '−' : '+'}${Math.abs(Math.round(result.dailyDeficit)).toLocaleString()} kcal`}
          sub="目標体重と達成希望日から逆算"
        />
      </Card>

      {result.warnings.map((warning) => (
        <View key={warning.kind} style={styles.warning}>
          <Text style={styles.warningText}>{warning.message}</Text>
        </View>
      ))}

      <Field label="1日の目標カロリー">
        <NumberInput value={kcal} onChangeText={setKcal} unit="kcal" />
      </Field>

      <View style={styles.macroRow}>
        <View style={styles.macroItem}>
          <Field label="タンパク質">
            <NumberInput value={protein} onChangeText={setProtein} unit="g" />
          </Field>
        </View>
        <View style={styles.macroItem}>
          <Field label="脂質">
            <NumberInput value={fat} onChangeText={setFat} unit="g" />
          </Field>
        </View>
        <View style={styles.macroItem}>
          <Field label="炭水化物">
            <NumberInput value={carb} onChangeText={setCarb} unit="g" />
          </Field>
        </View>
      </View>

      <Text style={styles.note}>
        タンパク質は体重×2g、脂質は総カロリーの25%、残りを炭水化物として割り振っています。
      </Text>
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  warning: {
    backgroundColor: '#FDF0E6',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  warningText: { fontSize: fontSize.sm, color: colors.textSub, lineHeight: 20 },
  macroRow: { flexDirection: 'row', gap: spacing.sm },
  macroItem: { flex: 1 },
  note: { fontSize: fontSize.xs, color: colors.textFaint, lineHeight: 18 },
});
