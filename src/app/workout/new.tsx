import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button, Field, NumberInput, OptionList, SegmentedControl, TextField } from '@/components/ui/controls';
import { DateField } from '@/components/ui/date-field';
import { Card, CardTitle, Screen } from '@/components/ui/layout';
import { createActivity } from '@/db/repo/activities';
import { today } from '@/lib/day';
import { METS, estimateExerciseKcal } from '@/lib/energy';
import { ACTIVITY_TYPE_LABELS, type ActivityType } from '@/lib/types';
import { useAppStore } from '@/store/app';
import { colors, fontSize, spacing } from '@/theme/colors';

const TYPE_ORDER: ActivityType[] = ['walk', 'run', 'strength', 'other'];

/** 種別ごとに、よく使うMETsの候補を出す */
const METS_BY_TYPE: Record<ActivityType, string[]> = {
  walk: ['walk_slow', 'walk', 'walk_fast'],
  run: ['jog', 'run', 'run_fast'],
  strength: ['strength_light', 'strength'],
  other: ['cycling', 'swim', 'stretch', 'housework'],
};

export default function NewWorkoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const settings = useAppStore((s) => s.settings);
  const currentWeightKg = useAppStore((s) => s.currentWeightKg);

  const [date, setDate] = useState(params.date ?? today(settings.dayStartHour));
  const [type, setType] = useState<ActivityType>('run');
  const [metsKey, setMetsKey] = useState<string>('run');
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState('');
  const [distance, setDistance] = useState('');
  const [reps, setReps] = useState('');
  const [sets, setSets] = useState('');
  const [kcalText, setKcalText] = useState('');
  const [saving, setSaving] = useState(false);

  const minutesValue = Number(minutes) || 0;

  // 体重とMETsから消費カロリーを推定する。手で書き換えられる
  const estimatedKcal = useMemo(() => {
    const mets = METS[metsKey]?.mets ?? 0;
    if (!currentWeightKg || minutesValue <= 0 || mets <= 0) return 0;
    return estimateExerciseKcal(mets, currentWeightKg, minutesValue);
  }, [metsKey, currentWeightKg, minutesValue]);

  const kcalValue = kcalText.trim() === '' ? estimatedKcal : Number(kcalText) || 0;
  const canSave = minutesValue > 0 || Number(reps) > 0 || Number(distance) > 0;

  async function handleSave() {
    if (saving || !canSave) return;
    setSaving(true);
    try {
      await createActivity({
        date,
        type,
        name: name.trim() === '' ? (METS[metsKey]?.label ?? null) : name.trim(),
        durationMin: minutesValue > 0 ? minutesValue : null,
        distanceKm: Number(distance) > 0 ? Number(distance) : null,
        reps: Number(reps) > 0 ? Number(reps) : null,
        sets: Number(sets) > 0 ? Number(sets) : null,
        kcal: kcalValue > 0 ? Math.round(kcalValue) : null,
        memo: null,
      });
      router.back();
    } catch (error) {
      console.error('運動の保存に失敗しました', error);
      Alert.alert('保存できませんでした', 'もう一度お試しください。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Card>
        <Field label="日付">
          <DateField value={date} onChange={setDate} maximumDate={new Date()} />
        </Field>

        <Field label="種別">
          <SegmentedControl<ActivityType>
            options={TYPE_ORDER.map((value) => ({
              value,
              label: ACTIVITY_TYPE_LABELS[value].replace('その他の運動', 'その他'),
            }))}
            value={type}
            onChange={(value) => {
              setType(value);
              setMetsKey(METS_BY_TYPE[value][0]);
            }}
          />
        </Field>

        <Field label="内容" hint="消費カロリーの推定に使います">
          <OptionList<string>
            options={METS_BY_TYPE[type].map((key) => ({
              value: key,
              label: METS[key].label,
              description: `${METS[key].mets} メッツ`,
            }))}
            value={metsKey}
            onChange={setMetsKey}
          />
        </Field>

        <Field label="名前（任意）">
          <TextField value={name} onChangeText={setName} placeholder="例: 腹筋ローラー" />
        </Field>
      </Card>

      <Card>
        <CardTitle>記録</CardTitle>

        <View style={styles.row}>
          <View style={styles.col}>
            <Field label="時間">
              <NumberInput value={minutes} onChangeText={setMinutes} unit="分" placeholder="30" />
            </Field>
          </View>
          {(type === 'run' || type === 'walk') && (
            <View style={styles.col}>
              <Field label="距離">
                <NumberInput value={distance} onChangeText={setDistance} unit="km" placeholder="5.0" />
              </Field>
            </View>
          )}
        </View>

        {type === 'strength' && (
          <View style={styles.row}>
            <View style={styles.col}>
              <Field label="回数">
                <NumberInput value={reps} onChangeText={setReps} unit="回" placeholder="10" />
              </Field>
            </View>
            <View style={styles.col}>
              <Field label="セット">
                <NumberInput value={sets} onChangeText={setSets} unit="セット" placeholder="3" />
              </Field>
            </View>
          </View>
        )}

        <Field
          label="消費カロリー"
          hint={
            kcalText.trim() === ''
              ? currentWeightKg
                ? `体重とメッツから推定しています（${Math.round(estimatedKcal)} kcal）`
                : '体重が未登録のため推定できません。直接入力してください。'
              : undefined
          }>
          <NumberInput
            value={kcalText}
            onChangeText={setKcalText}
            unit="kcal"
            placeholder={String(Math.round(estimatedKcal))}
          />
        </Field>
      </Card>

      <Text style={styles.note}>
        運動の消費カロリーは、設定で「目標に加算する」をオンにしない限り、目標カロリーには足されません。
      </Text>

      <Button
        title={saving ? '保存中…' : '保存する'}
        onPress={handleSave}
        disabled={saving || !canSave}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  col: { flex: 1 },
  note: { fontSize: fontSize.xs, color: colors.textFaint, lineHeight: 18 },
});
