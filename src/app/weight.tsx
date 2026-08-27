import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';

import { Button, Field, NumberInput } from '@/components/ui/controls';
import { DateField } from '@/components/ui/date-field';
import { Card, CardTitle, Divider, Row, Screen } from '@/components/ui/layout';
import { listWeights, saveWeight, type WeightRecord } from '@/db/repo/weights';
import { addDays, formatDayLabel, today } from '@/lib/day';
import { calcBmi } from '@/lib/targets';
import { useAppStore } from '@/store/app';
import { colors, fontSize, spacing } from '@/theme/colors';

export default function WeightScreen() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const settings = useAppStore((s) => s.settings);
  const refreshWeight = useAppStore((s) => s.refreshWeight);

  const [date, setDate] = useState(() => today(settings.dayStartHour));
  const [weight, setWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [history, setHistory] = useState<WeightRecord[]>([]);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    const to = today(settings.dayStartHour);
    setHistory((await listWeights(addDays(to, -29), to)).reverse());
  }, [settings.dayStartHour]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const weightValue = Number(weight);
  const bmi = profile && weightValue > 0 ? calcBmi(weightValue, profile.heightCm) : null;

  async function handleSave() {
    if (saving || weightValue <= 0) return;
    setSaving(true);
    try {
      await saveWeight({
        date,
        weightKg: weightValue,
        bodyFatPct: bodyFat.trim() === '' ? null : Number(bodyFat),
      });
      await refreshWeight();
      await reload();
      setWeight('');
      setBodyFat('');
      router.back();
    } catch (error) {
      console.error('体重の保存に失敗しました', error);
      Alert.alert('保存できませんでした', 'もう一度お試しください。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Card>
        <CardTitle>体重を記録</CardTitle>

        <Field label="日付" hint="同じ日に記録すると上書きされます">
          <DateField value={date} onChange={setDate} maximumDate={new Date()} />
        </Field>

        <Field label="体重">
          <NumberInput value={weight} onChangeText={setWeight} unit="kg" placeholder="82.5" />
        </Field>

        <Field label="体脂肪率（任意）">
          <NumberInput value={bodyFat} onChangeText={setBodyFat} unit="%" placeholder="20.1" />
        </Field>

        {bmi != null && <Text style={styles.bmi}>BMI {bmi.toFixed(1)}</Text>}

        <Button
          title={saving ? '保存中…' : '保存する'}
          onPress={() => void handleSave()}
          disabled={saving || weightValue <= 0}
        />
      </Card>

      <Card>
        <CardTitle>最近の記録</CardTitle>
        {history.length === 0 ? (
          <Text style={styles.empty}>まだ記録がありません</Text>
        ) : (
          history.map((record, index) => (
            <Card key={record.date} style={styles.plain}>
              {index > 0 && <Divider />}
              <Row
                label={formatDayLabel(record.date)}
                sub={record.bodyFatPct != null ? `体脂肪率 ${record.bodyFatPct}%` : undefined}
                value={`${record.weightKg.toFixed(1)} kg`}
              />
            </Card>
          ))
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bmi: { fontSize: fontSize.sm, color: colors.textSub, textAlign: 'right' },
  empty: {
    fontSize: fontSize.sm,
    color: colors.textFaint,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  plain: { backgroundColor: 'transparent', padding: 0, gap: 0, shadowOpacity: 0, elevation: 0 },
});
