import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, SegmentedControl } from '@/components/ui/controls';
import { Card, CardTitle, Divider, EmptyState, Row, Screen } from '@/components/ui/layout';
import { ScreenHeader } from '@/components/ui/header';
import {
  deleteActivity,
  getHealthDaily,
  listActivities,
  listActivitiesInRange,
  type Activity,
  type HealthDaily,
} from '@/db/repo/activities';
import { addDays, calcAge, formatDayLabel, today } from '@/lib/day';
import { estimateBurn } from '@/lib/energy';
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
  const [date] = useState(() => today(settings.dayStartHour));
  const [activities, setActivities] = useState<Activity[]>([]);
  const [history, setHistory] = useState<Activity[]>([]);
  const [health, setHealth] = useState<HealthDaily | null>(null);

  const reload = useCallback(async () => {
    const [todayList, historyList, healthRow] = await Promise.all([
      listActivities(date),
      listActivitiesInRange(addDays(date, -29), date),
      getHealthDaily(date),
    ]);
    setActivities(todayList);
    setHistory(historyList);
    setHealth(healthRow);
  }, [date]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

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
                  <Pressable onLongPress={() => confirmDelete(activity)}>
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
                <Divider />
                <Row label="運動による消費" value={`${Math.round(exerciseKcal)} kcal`} />
              </>
            )}
          </Card>

          <Button
            title="運動を追加"
            onPress={() => router.push({ pathname: '/workout/new', params: { date } })}
          />

          {/* 推定値とスマートウォッチの値を並べて出す。合算はしない */}
          <Card>
            <CardTitle>消費カロリーの比較</CardTitle>

            <View style={styles.estimateBox}>
              <Text style={styles.boxTitle}>推定（身体活動レベルから）</Text>
              {estimate ? (
                <>
                  <Row label="基礎代謝" value={`${Math.round(estimate.bmr).toLocaleString()} kcal`} />
                  <Row
                    label="活動による推定消費"
                    value={`${Math.round(estimate.activity).toLocaleString()} kcal`}
                  />
                  <Divider />
                  <Row label="推定総消費" value={`${Math.round(estimate.total).toLocaleString()} kcal`} />
                </>
              ) : (
                <Text style={styles.empty}>体重が未登録のため推定できません</Text>
              )}
            </View>

            <View style={styles.watchBox}>
              <Text style={styles.boxTitle}>スマートウォッチ</Text>
              {health ? (
                <>
                  <Row label="歩数" value={`${(health.steps ?? 0).toLocaleString()} 歩`} />
                  <Row label="運動時間" value={`${Math.round(health.exerciseMin ?? 0)} 分`} />
                  <Divider />
                  <Row label="総消費" value={`${Math.round(health.totalKcal ?? 0).toLocaleString()} kcal`} />
                </>
              ) : (
                <Text style={styles.empty}>
                  連携するとここに実測値が出ます（対応はこれから追加します）
                </Text>
              )}
            </View>

            <Text style={styles.note}>※ 推定値とスマートウォッチの値は合算していません</Text>
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
              <Pressable onLongPress={() => confirmDelete(activity)}>
                <Row
                  label={`${formatDayLabel(activity.date)} ${activity.name ?? ACTIVITY_TYPE_LABELS[activity.type]}`}
                  sub={describeActivity(activity)}
                  value={activity.kcal != null ? `${activity.kcal} kcal` : '—'}
                />
              </Pressable>
            </View>
          ))}
          <Text style={styles.note}>長押しで削除できます</Text>
        </Card>
      )}
    </Screen>
  );
}

/** 「5.0km / 32分」のような補足表示を作る */
function describeActivity(activity: Activity): string | undefined {
  const parts: string[] = [];
  if (activity.distanceKm != null) parts.push(`${activity.distanceKm}km`);
  if (activity.durationMin != null) parts.push(`${activity.durationMin}分`);
  if (activity.reps != null) {
    parts.push(activity.sets != null ? `${activity.reps}回 × ${activity.sets}セット` : `${activity.reps}回`);
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
  note: { fontSize: fontSize.xs, color: colors.textFaint, lineHeight: 16 },
});
