import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Field, NumberInput, SegmentedControl } from '@/components/ui/controls';
import { Card, CardTitle, Divider, EmptyState, Row, Screen } from '@/components/ui/layout';
import { ScreenHeader } from '@/components/ui/header';
import {
  deleteActivity,
  getHealthDaily,
  listActivities,
  listActivitiesInRange,
  saveHealthDaily,
  saveManualSteps,
  type Activity,
  type HealthDaily,
} from '@/db/repo/activities';
import { useTodayKey } from '@/hooks/use-today';
import { addDays, calcAge, formatDayLabel } from '@/lib/day';
import { estimateBurn, estimateStepsKcal, stepsToKm } from '@/lib/energy';
import {
  HEALTH_SOURCE_NAME,
  availabilityMessage,
  checkAvailability,
  openHealthSettings,
  readDailyHealth,
  requestHealthPermissions,
  type HealthAvailability,
} from '@/lib/health';
import { ACTIVITY_TYPE_LABELS } from '@/lib/types';
import { useAppStore } from '@/store/app';
import { colors, fontSize, radius, spacing } from '@/theme/colors';

type Tab = 'record' | 'history';

export default function ActivityScreen() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const settings = useAppStore((s) => s.settings);
  const currentWeightKg = useAppStore((s) => s.currentWeightKg);

  const [tab, setTab] = useState<Tab>('record');
  // フォーカスのたびに取り直す。開いたまま日付をまたぐと前日に記録されてしまうため
  const date = useTodayKey(settings.dayStartHour);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [history, setHistory] = useState<Activity[]>([]);
  const [health, setHealth] = useState<HealthDaily | null>(null);
  const [availability, setAvailability] = useState<HealthAvailability | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [stepsText, setStepsText] = useState('');
  const [savingSteps, setSavingSteps] = useState(false);

  const reload = useCallback(async () => {
    const [todayList, historyList, healthRow] = await Promise.all([
      listActivities(date),
      listActivitiesInRange(addDays(date, -29), date),
      getHealthDaily(date),
    ]);
    setActivities(todayList);
    setHistory(historyList);
    setHealth(healthRow);
    // 入力中の値は上書きしない。開き直したときだけ保存済みの値を入れる
    setStepsText((previous) =>
      previous === '' && healthRow?.manualSteps != null ? String(healthRow.manualSteps) : previous,
    );
  }, [date]);

  /** 手で入れた歩数を保存する */
  async function handleSaveSteps() {
    if (savingSteps) return;
    const value = Number(stepsText);
    if (!Number.isFinite(value) || value < 0) {
      Alert.alert('歩数を確かめてください', '0以上の数字を入れてください。');
      return;
    }
    setSavingSteps(true);
    try {
      await saveManualSteps(date, Math.round(value));
      await reload();
    } catch (error) {
      console.error('歩数の保存に失敗しました', error);
      Alert.alert('保存できませんでした', 'もう一度お試しください。');
    } finally {
      setSavingSteps(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      void reload();
      void checkAvailability().then(setAvailability);
    }, [reload]),
  );

  /** Health Connect から今日ぶんを取り込む */
  async function syncHealth() {
    if (syncing) return;
    setSyncing(true);
    try {
      const granted = await requestHealthPermissions();
      if (granted === 0) {
        Alert.alert(
          'データを読み取れません',
          'Health Connect でこのアプリへのアクセスを許可してください。',
        );
        return;
      }
      const values = await readDailyHealth(date, settings.dayStartHour);
      if (values == null) {
        Alert.alert('取得できませんでした', 'もう一度お試しください。');
        return;
      }
      await saveHealthDaily(date, values, 'health_connect');
      await reload();
      Alert.alert('取り込みました', 'スマートウォッチのデータを更新しました。');
    } catch (error) {
      console.error('ヘルスデータの取り込みに失敗しました', error);
      Alert.alert('取り込めませんでした', 'もう一度お試しください。');
    } finally {
      setSyncing(false);
    }
  }

  if (!profile) return null;

  const estimate = currentWeightKg
    ? estimateBurn({
        gender: profile.gender,
        ageYears: calcAge(profile.birthDate),
        heightCm: profile.heightCm,
        weightKg: currentWeightKg,
        activityLevel: profile.activityLevel,
      })
    : null;

  const exerciseKcal = activities.reduce((sum, activity) => sum + (activity.kcal ?? 0), 0);

  /** 記録した運動を開いて直す */
  function openActivity(activity: Activity) {
    router.push({ pathname: '/workout/new', params: { id: String(activity.id) } });
  }

  function confirmDelete(activity: Activity) {
    Alert.alert('この記録を削除しますか？', activity.name ?? '運動の記録', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除する',
        style: 'destructive',
        onPress: async () => {
          await deleteActivity(activity.id);
          await reload();
        },
      },
    ]);
  }

  return (
    <Screen>
      <ScreenHeader title="運動" subtitle={formatDayLabel(date)} />

      <SegmentedControl<Tab>
        options={[
          { value: 'record', label: '記録' },
          { value: 'history', label: '履歴' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'record' ? (
        <>
          <Card>
            <CardTitle>今日の運動</CardTitle>
            {activities.length === 0 ? (
              <Text style={styles.empty}>まだ記録がありません</Text>
            ) : (
              activities.map((activity, index) => (
                <View key={activity.id}>
                  {index > 0 && <Divider />}
                  <Pressable
                    onPress={() => openActivity(activity)}
                    onLongPress={() => confirmDelete(activity)}
                    style={({ pressed }) => pressed && styles.pressed}
                  >
                    <Row
                      label={activity.name ?? ACTIVITY_TYPE_LABELS[activity.type]}
                      sub={describeActivity(activity)}
                      value={activity.kcal != null ? `${activity.kcal} kcal` : '—'}
                    />
                  </Pressable>
                </View>
              ))
            )}
            {activities.length > 0 && (
              <>
                <Text style={styles.note}>タップで編集、長押しで削除できます</Text>
                <Divider />
                <Row label="運動による消費" value={`${Math.round(exerciseKcal)} kcal`} />
              </>
            )}
          </Card>

          <Button
            title="運動を追加"
            onPress={() => router.push({ pathname: '/workout/new', params: { date } })}
          />

          {/* 歩数。ヘルスアプリが使えないときのために手でも入れられるようにする */}
          <Card>
            <CardTitle
              right={
                health?.steps != null ? (
                  <Text style={styles.fromHealth}>{HEALTH_SOURCE_NAME}から取得</Text>
                ) : undefined
              }
            >
              歩数
            </CardTitle>

            {health?.steps != null ? (
              <>
                <Row label="今日の歩数" value={`${health.steps.toLocaleString()} 歩`} />
                <StepsKcalRow steps={health.steps} />
                {health.manualSteps != null && (
                  <Text style={styles.note}>
                    手で入力した {health.manualSteps.toLocaleString()} 歩は残していますが、
                    取り込んだ値のほうを使います。
                  </Text>
                )}
              </>
            ) : (
              <>
                <Field label="今日の歩数">
                  <NumberInput
                    value={stepsText}
                    onChangeText={setStepsText}
                    unit="歩"
                    placeholder="8000"
                  />
                </Field>
                {Number(stepsText) > 0 && <StepsKcalRow steps={Number(stepsText)} />}
                <Button
                  title={savingSteps ? '保存中…' : '歩数を記録する'}
                  variant="secondary"
                  onPress={() => void handleSaveSteps()}
                  disabled={savingSteps || stepsText.trim() === ''}
                />
                <Text style={styles.note}>
                  スマホの歩数計や他のアプリの数字を、そのまま入れて構いません。
                  {HEALTH_SOURCE_NAME}と連携すると、こちらは自動で入ります。
                </Text>
              </>
            )}
          </Card>

          {/* 推定値とスマートウォッチの値を並べて出す。合算はしない */}
          <Card>
            <CardTitle>消費カロリーの比較</CardTitle>

            <View style={styles.estimateBox}>
              <Text style={styles.boxTitle}>推定（身体活動レベルから）</Text>
              {estimate ? (
                <>
                  <Row
                    label="基礎代謝"
                    value={`${Math.round(estimate.bmr).toLocaleString()} kcal`}
                  />
                  <Row
                    label="活動による推定消費"
                    value={`${Math.round(estimate.activity).toLocaleString()} kcal`}
                  />
                  <Divider />
                  <Row
                    label="推定総消費"
                    value={`${Math.round(estimate.total).toLocaleString()} kcal`}
                  />
                </>
              ) : (
                <Text style={styles.empty}>体重が未登録のため推定できません</Text>
              )}
            </View>

            <View style={styles.watchBox}>
              <Text style={styles.boxTitle}>{HEALTH_SOURCE_NAME}</Text>
              {health ? (
                <>
                  <Row label="歩数" value={`${(health.steps ?? 0).toLocaleString()} 歩`} />
                  <Row label="運動時間" value={`${Math.round(health.exerciseMin ?? 0)} 分`} />
                  <Divider />
                  <Row
                    label="総消費"
                    value={`${Math.round(health.totalKcal ?? 0).toLocaleString()} kcal`}
                  />
                </>
              ) : (
                <Text style={styles.empty}>
                  連携するとここに実測値が出ます。スマートウォッチを持っていなくても、
                  スマホが数えた歩数を取り込めます。
                </Text>
              )}

              {availability?.available ? (
                <>
                  <Button
                    title={syncing ? '取り込み中…' : `${HEALTH_SOURCE_NAME}から取り込む`}
                    variant="secondary"
                    onPress={() => void syncHealth()}
                    disabled={syncing}
                  />
                  {settings.autoSyncHealth && (
                    <Text style={styles.note}>
                      アプリを開いたときにも自動で取り込みます（設定で変えられます）
                    </Text>
                  )}
                </>
              ) : (
                availability != null && (
                  <>
                    <Text style={styles.note}>{availabilityMessage(availability)}</Text>
                    {availability.reason === 'not-installed' ||
                    availability.reason === 'update-required' ? (
                      <Button
                        title="Health Connect を開く"
                        variant="ghost"
                        onPress={openHealthSettings}
                      />
                    ) : null}
                  </>
                )
              )}
            </View>

            <Text style={styles.note}>※ 推定値と{HEALTH_SOURCE_NAME}の値は合算していません</Text>
          </Card>
        </>
      ) : history.length === 0 ? (
        <EmptyState title="記録がありません" description="運動を記録するとここに履歴が並びます。" />
      ) : (
        <Card>
          <CardTitle>過去30日</CardTitle>
          {history.map((activity, index) => (
            <View key={activity.id}>
              {index > 0 && <Divider />}
              <Pressable
                onPress={() => openActivity(activity)}
                onLongPress={() => confirmDelete(activity)}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Row
                  label={`${formatDayLabel(activity.date)} ${activity.name ?? ACTIVITY_TYPE_LABELS[activity.type]}`}
                  sub={describeActivity(activity)}
                  value={activity.kcal != null ? `${activity.kcal} kcal` : '—'}
                />
              </Pressable>
            </View>
          ))}
          <Text style={styles.note}>タップで編集、長押しで削除できます</Text>
        </Card>
      )}
    </Screen>
  );
}

/** 「5.0km / 32分」のような補足表示を作る */
/**
 * 歩数から見積もった消費カロリー。
 *
 * これを「運動による消費」に足し込むことはしない。
 * 1日の歩数には、記録したウォーキングのぶんも、身体活動レベルから見積もった
 * 日常の移動のぶんも既に含まれているので、足すと二重に数えることになる。
 */
function StepsKcalRow({ steps }: { steps: number }) {
  const profile = useAppStore((s) => s.profile);
  const currentWeightKg = useAppStore((s) => s.currentWeightKg);

  if (profile == null || currentWeightKg == null) return null;
  const kcal = estimateStepsKcal(steps, currentWeightKg, profile.heightCm);
  if (kcal <= 0) return null;

  return (
    <>
      <Row
        label="歩数ぶんの消費"
        sub={`約${stepsToKm(steps, profile.heightCm).toFixed(1)}km 歩いた見積もり`}
        value={`${Math.round(kcal).toLocaleString()} kcal`}
      />
      <Text style={styles.note}>
        この数字は目安です。日常の歩きは推定消費カロリーに既に含まれているため、
        「運動による消費」には足していません。
      </Text>
    </>
  );
}

function describeActivity(activity: Activity): string | undefined {
  const parts: string[] = [];
  if (activity.steps != null) parts.push(`${activity.steps.toLocaleString()}歩`);
  if (activity.distanceKm != null) parts.push(`${activity.distanceKm}km`);
  if (activity.durationMin != null) parts.push(`${activity.durationMin}分`);
  if (activity.reps != null) {
    parts.push(
      activity.sets != null ? `${activity.reps}回 × ${activity.sets}セット` : `${activity.reps}回`,
    );
  }
  return parts.length > 0 ? parts.join(' / ') : undefined;
}

const styles = StyleSheet.create({
  empty: {
    fontSize: fontSize.sm,
    color: colors.textFaint,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  estimateBox: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  watchBox: {
    backgroundColor: '#EAF2FB',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  boxTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text, marginBottom: 4 },
  fromHealth: { fontSize: fontSize.xs, color: colors.textFaint },
  pressed: { opacity: 0.6 },
  note: { fontSize: fontSize.xs, color: colors.textFaint, lineHeight: 16 },
});
