import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Button,
  Field,
  NumberInput,
  OptionList,
  SegmentedControl,
  TextField,
} from '@/components/ui/controls';
import { DateField } from '@/components/ui/date-field';
import { Card, CardTitle, Divider, Screen } from '@/components/ui/layout';
import {
  createActivity,
  findPreviousExercise,
  getActivity,
  saveExercises,
  updateActivity,
} from '@/db/repo/activities';
import { formatDayLabel, today } from '@/lib/day';
import {
  METS,
  estimateExerciseKcal,
  estimateStepsKcal,
  intensityLabel,
  stepsToKm,
} from '@/lib/energy';
import { describeSets, totalVolume } from '@/lib/equipment';
import { ACTIVITY_TYPE_LABELS, type ActivityType } from '@/lib/types';
import { useAppStore } from '@/store/app';
import {
  hasAnySet,
  toExerciseDrafts,
  useWorkoutDraft,
  type DraftExercise,
} from '@/store/workout-draft';
import { colors, fontSize, radius, spacing } from '@/theme/colors';

const TYPE_ORDER: ActivityType[] = ['walk', 'run', 'strength', 'other'];

/**
 * 4つ並べる切り替えでは「ウォーキング」は入りきらず、途中で折り返してしまう。
 * 一覧では正式な名前を使い、ここだけ短い言い方にする。
 */
const SHORT_TYPE_LABELS: Record<ActivityType, string> = {
  walk: '歩く',
  run: '走る',
  strength: '筋トレ',
  other: 'その他',
};

/** 種別ごとに、よく使うMETsの候補を出す */
const METS_BY_TYPE: Record<ActivityType, string[]> = {
  walk: ['walk_slow', 'walk', 'walk_fast'],
  run: ['jog', 'run', 'run_fast'],
  strength: ['strength_light', 'strength'],
  other: ['cycling', 'swim', 'stretch', 'housework'],
};

/**
 * 種別ごとの入力例。
 * どの種別でも「例: 腹筋ローラー」だと、歩いた記録に何を書けばよいのか分からない。
 * 時間や距離も、歩きと走りでは目安が違うので分けている。
 */
const EXAMPLES: Record<ActivityType, { name: string; minutes: string; distance: string }> = {
  walk: { name: '例: 散歩、通勤の徒歩', minutes: '40', distance: '3.0' },
  run: { name: '例: マラソン、河川敷ラン', minutes: '30', distance: '5.0' },
  strength: { name: '例: 腹筋ローラー、懸垂', minutes: '45', distance: '' },
  other: { name: '例: ヨガ、自転車通勤', minutes: '30', distance: '' },
};

/** 筋トレの記録の仕方 */
type StrengthMode = 'simple' | 'detail';

export default function NewWorkoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string; id?: string }>();
  const editingId = params.id != null ? Number(params.id) : null;
  const profile = useAppStore((s) => s.profile);
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const currentWeightKg = useAppStore((s) => s.currentWeightKg);

  const exercises = useWorkoutDraft((s) => s.exercises);
  const clearExercises = useWorkoutDraft((s) => s.clear);

  const [date, setDate] = useState(params.date ?? today(settings.dayStartHour));
  const [type, setType] = useState<ActivityType>('run');
  const [metsKey, setMetsKey] = useState<string>('run');
  const [strengthMode, setStrengthMode] = useState<StrengthMode>('detail');
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState('');
  const [distance, setDistance] = useState('');
  const [reps, setReps] = useState('');
  const [sets, setSets] = useState('');
  const [stepsText, setStepsText] = useState('');
  const [kcalText, setKcalText] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(editingId == null);

  const minutesValue = Number(minutes) || 0;
  const stepsValue = Number(stepsText) || 0;

  // 記録し直しに来たときは、保存されている内容を読み込む
  useEffect(() => {
    if (editingId == null) return;
    let cancelled = false;
    getActivity(editingId)
      .then((activity) => {
        if (cancelled || activity == null) return;
        setDate(activity.date);
        setType(activity.type);
        setMetsKey(METS_BY_TYPE[activity.type][0]);
        setName(activity.name ?? '');
        setMinutes(activity.durationMin != null ? String(activity.durationMin) : '');
        setDistance(activity.distanceKm != null ? String(activity.distanceKm) : '');
        setStepsText(activity.steps != null ? String(activity.steps) : '');
        setReps(activity.reps != null ? String(activity.reps) : '');
        setSets(activity.sets != null ? String(activity.sets) : '');
        setKcalText(activity.kcal != null ? String(activity.kcal) : '');
        // 既存の記録は「時間だけ」の形で保存されているので、そのまま直せる形で開く
        if (activity.type === 'strength') setStrengthMode('simple');
        setLoaded(true);
      })
      .catch((error) => console.error('運動の読み込みに失敗しました', error));
    return () => {
      cancelled = true;
    };
  }, [editingId]);

  // 歩数から見積もった消費カロリー。歩きの記録でだけ使う
  const stepsKcal = useMemo(() => {
    if (type !== 'walk' || stepsValue <= 0 || !currentWeightKg || profile == null) return 0;
    return estimateStepsKcal(stepsValue, currentWeightKg, profile.heightCm);
  }, [type, stepsValue, currentWeightKg, profile]);

  // 体重とMETsから消費カロリーを推定する。手で書き換えられる。
  // 歩数が入っていれば、時間より歩数のほうが実態に近いのでそちらを使う
  const estimatedKcal = useMemo(() => {
    if (stepsKcal > 0) return stepsKcal;
    const mets = METS[metsKey]?.mets ?? 0;
    if (!currentWeightKg || minutesValue <= 0 || mets <= 0) return 0;
    return estimateExerciseKcal(mets, currentWeightKg, minutesValue);
  }, [stepsKcal, metsKey, currentWeightKg, minutesValue]);

  const kcalValue = kcalText.trim() === '' ? estimatedKcal : Number(kcalText) || 0;

  const usingExercises = type === 'strength' && strengthMode === 'detail';
  const canSave = usingExercises
    ? hasAnySet(exercises)
    : minutesValue > 0 || Number(reps) > 0 || Number(distance) > 0 || stepsValue > 0;

  async function handleSave() {
    if (saving || !canSave) return;
    setSaving(true);
    try {
      const input = {
        date,
        type,
        name: name.trim() === '' ? (METS[metsKey]?.label ?? null) : name.trim(),
        durationMin: minutesValue > 0 ? minutesValue : null,
        distanceKm: Number(distance) > 0 ? Number(distance) : null,
        steps: type === 'walk' && stepsValue > 0 ? Math.round(stepsValue) : null,
        // 種目ごとに記録するときは、合計の回数・セットは持たせない
        reps: !usingExercises && Number(reps) > 0 ? Number(reps) : null,
        sets: !usingExercises && Number(sets) > 0 ? Number(sets) : null,
        kcal: kcalValue > 0 ? Math.round(kcalValue) : null,
        memo: null,
      };

      if (editingId != null) {
        await updateActivity(editingId, input);
      } else {
        const activityId = await createActivity(input);
        if (usingExercises) {
          await saveExercises(activityId, toExerciseDrafts(exercises));
          clearExercises();
        }
      }
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
      {/* 直しに来たときは見出しを変える。追加なのか編集なのか分からなくなるため */}
      {editingId != null && <Stack.Screen options={{ title: '運動を編集' }} />}

      <Card>
        <Field label="日付">
          <DateField value={date} onChange={setDate} maximumDate={new Date()} />
        </Field>

        <Field label="種別">
          <SegmentedControl<ActivityType>
            options={TYPE_ORDER.map((value) => ({ value, label: SHORT_TYPE_LABELS[value] }))}
            value={type}
            onChange={(value) => {
              setType(value);
              setMetsKey(METS_BY_TYPE[value][0]);
            }}
          />
        </Field>

        {(type === 'walk' || type === 'run') && (
          <Button
            title="GPSで距離を測って記録する"
            variant="secondary"
            onPress={() => router.push({ pathname: '/workout/track', params: { date, type } })}
          />
        )}
      </Card>

      {type === 'strength' && editingId == null && (
        <Card>
          <CardTitle
            right={
              <Text style={styles.modeHint}>
                {strengthMode === 'detail' ? '種目ごと' : 'ざっくり'}
              </Text>
            }
          >
            記録の仕方
          </CardTitle>
          <SegmentedControl<StrengthMode>
            options={[
              { value: 'detail', label: '種目ごとに書く' },
              { value: 'simple', label: '時間だけ' },
            ]}
            value={strengthMode}
            onChange={setStrengthMode}
          />
          <Text style={styles.note}>
            {strengthMode === 'detail'
              ? '使った器具ごとに、重さ・回数・セットを残せます。前回の記録と比べられます。'
              : 'かかった時間から消費カロリーだけを見積もります。'}
          </Text>
        </Card>
      )}

      {usingExercises ? (
        <ExerciseSection date={date} exercises={exercises} />
      ) : (
        <Card>
          <CardTitle
            right={
              <Pressable
                onPress={() => void updateSettings({ showMets: !settings.showMets })}
                hitSlop={8}
              >
                <Text style={styles.toggle}>{settings.showMets ? 'メッツ' : 'きつさ'}</Text>
              </Pressable>
            }
          >
            内容
          </CardTitle>
          <OptionList<string>
            options={METS_BY_TYPE[type].map((key) => ({
              value: key,
              label: METS[key].label,
              description: settings.showMets
                ? `${METS[key].mets} メッツ`
                : `${intensityLabel(METS[key].mets)}｜${METS[key].hint}`,
            }))}
            value={metsKey}
            onChange={setMetsKey}
          />
          <Text style={styles.note}>
            右上をタップすると、メッツの数字と体感の言葉を切り替えられます。
          </Text>
        </Card>
      )}

      <Card>
        <CardTitle>記録</CardTitle>

        <Field label="名前（任意）">
          <TextField
            value={name}
            onChangeText={setName}
            placeholder={usingExercises ? '例: 胸の日、脚の日' : EXAMPLES[type].name}
          />
        </Field>

        <View style={styles.row}>
          <View style={styles.col}>
            <Field label="時間">
              <NumberInput
                value={minutes}
                onChangeText={setMinutes}
                unit="分"
                placeholder={EXAMPLES[type].minutes}
              />
            </Field>
          </View>
          {(type === 'run' || type === 'walk') && (
            <View style={styles.col}>
              <Field label="距離">
                <NumberInput
                  value={distance}
                  onChangeText={setDistance}
                  unit="km"
                  placeholder={EXAMPLES[type].distance}
                />
              </Field>
            </View>
          )}
        </View>

        {type === 'strength' && strengthMode === 'simple' && (
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

        {type === 'walk' && (
          <Field
            label="歩数"
            hint={
              stepsKcal > 0
                ? `歩幅を身長の45%として、約${stepsToKm(stepsValue, profile?.heightCm ?? 0).toFixed(1)}km 歩いたものとして計算しています`
                : '入れると、時間の代わりに歩数から消費カロリーを見積もります'
            }
          >
            <NumberInput
              value={stepsText}
              onChangeText={setStepsText}
              unit="歩"
              placeholder="6000"
            />
          </Field>
        )}

        <Field
          label="消費カロリー"
          hint={
            kcalText.trim() === ''
              ? stepsKcal > 0
                ? `歩数から推定しています（${Math.round(estimatedKcal)} kcal）`
                : currentWeightKg
                  ? `体重と運動の強さから推定しています（${Math.round(estimatedKcal)} kcal）`
                  : '体重が未登録のため推定できません。直接入力してください。'
              : undefined
          }
        >
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
        title={saving ? '保存中…' : editingId != null ? '変更を保存する' : '保存する'}
        onPress={() => void handleSave()}
        disabled={saving || !canSave || !loaded}
      />
    </Screen>
  );
}

/** 筋トレの種目ごとの入力 */
function ExerciseSection({ date, exercises }: { date: string; exercises: DraftExercise[] }) {
  const router = useRouter();
  const addSet = useWorkoutDraft((s) => s.addSet);
  const removeSet = useWorkoutDraft((s) => s.removeSet);
  const patchSet = useWorkoutDraft((s) => s.patchSet);
  const remove = useWorkoutDraft((s) => s.remove);

  return (
    <>
      {exercises.map((exercise) => (
        <ExerciseCard
          key={exercise.key}
          date={date}
          exercise={exercise}
          onAddSet={() => addSet(exercise.key)}
          onRemoveSet={(index) => removeSet(exercise.key, index)}
          onPatchSet={(index, patch) => patchSet(exercise.key, index, patch)}
          onRemove={() => remove(exercise.key)}
        />
      ))}

      <Button
        title={exercises.length === 0 ? '種目を選ぶ' : '種目を追加する'}
        variant="secondary"
        onPress={() => router.push('/workout/equipment')}
      />
    </>
  );
}

function ExerciseCard({
  date,
  exercise,
  onAddSet,
  onRemoveSet,
  onPatchSet,
  onRemove,
}: {
  date: string;
  exercise: DraftExercise;
  onAddSet: () => void;
  onRemoveSet: (index: number) => void;
  onPatchSet: (index: number, patch: { weight?: string; reps?: string }) => void;
  onRemove: () => void;
}) {
  const [previous, setPrevious] = useState<{ date: string; volume: number } | null>(null);

  // 前回の記録を引いて「上がったか」を出す。画面に戻るたびに引き直す
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (exercise.equipmentKey == null) {
        setPrevious(null);
        return;
      }
      findPreviousExercise(exercise.equipmentKey, date)
        .then((row) => {
          if (cancelled || row == null) return;
          setPrevious({ date: row.date, volume: totalVolume(row.sets) });
        })
        .catch(() => setPrevious(null));
      return () => {
        cancelled = true;
      };
    }, [exercise.equipmentKey, date]),
  );

  const current = totalVolume(
    exercise.sets.map((set) => ({
      weightKg: Number(set.weight) || null,
      reps: Number(set.reps) || null,
    })),
  );

  return (
    <Card>
      <CardTitle
        right={
          <Pressable onPress={onRemove} hitSlop={8}>
            <Text style={styles.remove}>削除</Text>
          </Pressable>
        }
      >
        {exercise.name}
      </CardTitle>

      {exercise.sets.map((set, index) => (
        <View key={index} style={styles.setRow}>
          <Text style={styles.setIndex}>{index + 1}</Text>
          {exercise.weighted && (
            <View style={styles.setField}>
              <NumberInput
                value={set.weight}
                onChangeText={(value) => onPatchSet(index, { weight: value })}
                unit="kg"
                placeholder="60"
              />
            </View>
          )}
          <View style={styles.setField}>
            <NumberInput
              value={set.reps}
              onChangeText={(value) => onPatchSet(index, { reps: value })}
              unit="回"
              placeholder="10"
            />
          </View>
          {exercise.sets.length > 1 && (
            <Pressable onPress={() => onRemoveSet(index)} hitSlop={8}>
              <Text style={styles.remove}>−</Text>
            </Pressable>
          )}
        </View>
      ))}

      <Pressable onPress={onAddSet} style={styles.addSet}>
        <Text style={styles.addSetText}>＋ セットを追加</Text>
      </Pressable>

      {(previous != null || current > 0) && (
        <>
          <Divider />
          {current > 0 && (
            <Text style={styles.volume}>
              今日の総挙上量 {Math.round(current).toLocaleString()} kg
            </Text>
          )}
          {previous != null && previous.volume > 0 && (
            <Text style={styles.compare}>
              前回（{formatDayLabel(previous.date)}）は{' '}
              {Math.round(previous.volume).toLocaleString()} kg
              {current > 0 &&
                `　${current >= previous.volume ? '▲' : '▼'} ${Math.abs(
                  Math.round(current - previous.volume),
                ).toLocaleString()} kg`}
            </Text>
          )}
        </>
      )}

      {describeSets(
        exercise.sets.map((set) => ({
          weightKg: Number(set.weight) || null,
          reps: Number(set.reps) || null,
        })),
      ) !== '' && (
        <Text style={styles.summary}>
          {describeSets(
            exercise.sets.map((set) => ({
              weightKg: Number(set.weight) || null,
              reps: Number(set.reps) || null,
            })),
          )}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  col: { flex: 1 },
  note: { fontSize: fontSize.xs, color: colors.textFaint, lineHeight: 18 },
  toggle: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '700' },
  modeHint: { fontSize: fontSize.xs, color: colors.textFaint },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  setIndex: {
    width: 20,
    textAlign: 'center',
    fontSize: fontSize.sm,
    color: colors.textFaint,
    fontWeight: '700',
  },
  setField: { flex: 1 },
  remove: { fontSize: fontSize.sm, color: colors.danger, fontWeight: '700' },
  addSet: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  addSetText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '700' },
  volume: { fontSize: fontSize.sm, color: colors.text, fontWeight: '700' },
  compare: { fontSize: fontSize.xs, color: colors.textSub },
  summary: { fontSize: fontSize.xs, color: colors.textFaint },
});
