import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { GroupedBarChart, LineChartView } from '@/components/ui/charts';
import { SegmentedControl } from '@/components/ui/controls';
import { ScreenHeader } from '@/components/ui/header';
import { Card, CardTitle, Divider, EmptyState, Row, Screen } from '@/components/ui/layout';
import {
  listActivities,
  listDailyActivityKcal,
  listHealthDaily,
  type Activity,
} from '@/db/repo/activities';
import { listDailyTotals } from '@/db/repo/meals';
import { listWeights, type WeightRecord } from '@/db/repo/weights';
import { useTodayKey } from '@/hooks/use-today';
import {
  addDays,
  calcAge,
  dateRange,
  formatDayShort,
  formatDayLabel,
  type DayKey,
} from '@/lib/day';
import { estimateBurn } from '@/lib/energy';
import { calcBmi } from '@/lib/targets';
import { ACTIVITY_TYPE_LABELS } from '@/lib/types';
import { useAppStore } from '@/store/app';
import { colors, fontSize, spacing } from '@/theme/colors';

type Tab = 'calorie' | 'pfc' | 'weight' | 'activity';

/** 表示期間。平均は出さず、期間の合計で比較する */
const PERIODS = [
  { value: 1, label: '1日' },
  { value: 7, label: '1週間' },
  { value: 14, label: '2週間' },
  { value: 21, label: '3週間' },
  { value: 30, label: '1ヶ月' },
];

type DayRow = {
  date: DayKey;
  intakeKcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  burnKcal: number;
  /** 消費カロリーを推定できたか。体重が一度も分からない日は false */
  burnKnown: boolean;
  exerciseKcal: number;
  steps: number | null;
  weightKg: number | null;
};

export default function AnalysisScreen() {
  const profile = useAppStore((s) => s.profile);
  const settings = useAppStore((s) => s.settings);
  const currentWeightKg = useAppStore((s) => s.currentWeightKg);

  const [tab, setTab] = useState<Tab>('calorie');
  const [days, setDays] = useState(7);
  /** 期間の終わりの日。null なら今日。1日表示のときに前後へ動かす */
  const [anchor, setAnchor] = useState<DayKey | null>(null);
  const [rows, setRows] = useState<DayRow[]>([]);
  const [weights, setWeights] = useState<WeightRecord[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [showIntakeWithWeight, setShowIntakeWithWeight] = useState(true);

  const todayKey = useTodayKey(settings.dayStartHour);
  const to = anchor ?? todayKey;
  const from = addDays(to, -(days - 1));
  const single = days === 1;

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function load() {
        if (!profile) return;
        const [totals, activityKcal, health, weightRecords, dayActivities] = await Promise.all([
          listDailyTotals(from, to),
          listDailyActivityKcal(from, to),
          listHealthDaily(from, to),
          listWeights(from, to),
          // 1日だけ見るときは、その日にやった運動を一覧で出す
          days === 1 ? listActivities(to) : Promise.resolve([]),
        ]);
        if (cancelled) return;

        const totalsByDate = new Map(totals.map((row) => [row.date, row]));
        const activityByDate = new Map(activityKcal.map((row) => [row.date, row.kcal]));
        const healthByDate = new Map(health.map((row) => [row.date, row]));
        const weightByDate = new Map(weightRecords.map((row) => [row.date, row.weightKg]));

        // 消費カロリーの推定にはその日の体重を使う。
        // 記録がない日は直前の記録を引き継ぎ、それも無ければ現在の体重を使う。
        let lastWeight = currentWeightKg;
        const built: DayRow[] = dateRange(from, to).map((date) => {
          const weight = weightByDate.get(date) ?? null;
          if (weight != null) lastWeight = weight;
          const weightForDay = weight ?? lastWeight;

          const estimate = weightForDay
            ? estimateBurn({
                gender: profile.gender,
                ageYears: calcAge(profile.birthDate),
                heightCm: profile.heightCm,
                weightKg: weightForDay,
                activityLevel: profile.activityLevel,
              }).total
            : 0;

          const watchKcal = healthByDate.get(date)?.totalKcal ?? null;
          const useWatch = settings.burnSource === 'watch' && watchKcal != null && watchKcal > 0;
          const burnKcal = useWatch ? watchKcal : estimate;

          const totalsRow = totalsByDate.get(date);
          return {
            date,
            intakeKcal: totalsRow?.kcal ?? 0,
            proteinG: totalsRow?.proteinG ?? 0,
            fatG: totalsRow?.fatG ?? 0,
            carbG: totalsRow?.carbG ?? 0,
            burnKcal,
            burnKnown: useWatch || weightForDay != null,
            exerciseKcal: activityByDate.get(date) ?? 0,
            steps: healthByDate.get(date)?.steps ?? null,
            weightKg: weight,
          };
        });

        setRows(built);
        setWeights(weightRecords);
        setActivities(dayActivities);
      }

      load().catch((error) => console.error('分析の読み込みに失敗しました', error));
      return () => {
        cancelled = true;
      };
    }, [from, to, days, profile, settings.burnSource, currentWeightKg]),
  );

  // 記録がある日だけを合計する。記録し忘れの日を0として数えると実態とずれる
  const recorded = useMemo(() => rows.filter((row) => row.intakeKcal > 0), [rows]);
  // 収支は、消費カロリーを推定できた日だけで出す。
  // 体重が一度も分からない日は消費が0になり、食べ過ぎているように見えてしまう
  const balanceDays = useMemo(() => recorded.filter((row) => row.burnKnown), [recorded]);
  const totalIntake = balanceDays.reduce((sum, row) => sum + row.intakeKcal, 0);
  const totalBurn = balanceDays.reduce((sum, row) => sum + row.burnKcal, 0);
  const balance = totalIntake - totalBurn;

  if (!profile) return null;

  return (
    <Screen>
      <ScreenHeader
        title="分析"
        subtitle={single ? formatDayLabel(to) : `${formatDayLabel(from)} 〜 ${formatDayLabel(to)}`}
      />

      <SegmentedControl<Tab>
        options={[
          { value: 'calorie', label: 'カロリー' },
          { value: 'pfc', label: 'PFC' },
          { value: 'weight', label: '体重' },
          { value: 'activity', label: '運動' },
        ]}
        value={tab}
        onChange={setTab}
      />

      <SegmentedControl<number>
        options={PERIODS}
        value={days}
        onChange={(value) => {
          setDays(value);
          // 期間を広げたときは今日までに戻す。過去を見たいのは1日ずつ辿るときなので
          if (value !== 1) setAnchor(null);
        }}
      />

      {single && (
        <View style={styles.dateNav}>
          <Pressable
            onPress={() => setAnchor(addDays(to, -1))}
            hitSlop={8}
            style={styles.navButton}
          >
            <Ionicons name="chevron-back" size={22} color={colors.primary} />
          </Pressable>
          <Pressable onPress={() => setAnchor(null)}>
            <Text style={styles.dateLabel}>{formatDayLabel(to)}</Text>
          </Pressable>
          <Pressable
            onPress={() => setAnchor(to >= todayKey ? to : addDays(to, 1))}
            hitSlop={8}
            style={[styles.navButton, to >= todayKey && styles.navDisabled]}
          >
            <Ionicons name="chevron-forward" size={22} color={colors.primary} />
          </Pressable>
        </View>
      )}

      {recorded.length === 0 ? (
        <EmptyState
          title="この期間の記録がありません"
          description="食事を記録すると、ここに推移と収支が出ます。"
        />
      ) : tab === 'calorie' ? (
        <>
          <Card>
            <CardTitle right={<Text style={styles.days}>記録 {balanceDays.length}日</Text>}>
              期間の合計
            </CardTitle>
            <Row label="摂取カロリー" value={`${Math.round(totalIntake).toLocaleString()} kcal`} />
            <Row
              label="消費カロリー"
              sub={settings.burnSource === 'watch' ? 'ウォッチ優先（無い日は推定値）' : '推定値'}
              value={`${Math.round(totalBurn).toLocaleString()} kcal`}
            />
            <Divider />
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>カロリー収支</Text>
              <Text
                style={[
                  styles.balanceValue,
                  { color: balance <= 0 ? colors.success : colors.danger },
                ]}
              >
                {formatSigned(balance)} kcal
              </Text>
            </View>
            <Text style={styles.balanceNote}>
              {balanceDays.length === 0
                ? '体重の記録がないため、消費カロリーを見積もれません。体重を記録すると収支が出ます。'
                : balance <= 0
                  ? `脂肪に換算すると約 ${(Math.abs(balance) / 7200).toFixed(2)}kg 分のマイナスです`
                  : `脂肪に換算すると約 ${(balance / 7200).toFixed(2)}kg 分のプラスです`}
            </Text>
          </Card>

          {single && (
            <Card>
              <CardTitle>目標との差</CardTitle>
              <Row
                label="目標カロリー"
                sub="食べ過ぎ調整や運動ぶんの加算は含みません"
                value={`${profile.targetKcal.toLocaleString()} kcal`}
              />
              <Divider />
              <Row
                label="目標に対して"
                value={
                  <Text
                    style={{
                      color: totalIntake <= profile.targetKcal ? colors.success : colors.danger,
                      fontWeight: '700',
                    }}
                  >
                    {formatSigned(totalIntake - profile.targetKcal)} kcal
                  </Text>
                }
              />
            </Card>
          )}

          {!single && (
            <Card>
              <CardTitle>日別の摂取と消費</CardTitle>
              <GroupedBarChart
                data={rows.map((row) => ({
                  label: formatDayShort(row.date),
                  primary: row.intakeKcal,
                  secondary: row.burnKnown ? row.burnKcal : 0,
                }))}
              />
            </Card>
          )}

          {!single && (
            <Card>
              <CardTitle>日別データ</CardTitle>
              {rows.map((row, index) => (
                <View key={row.date}>
                  {index > 0 && <Divider />}
                  <Row
                    label={formatDayLabel(row.date)}
                    sub={
                      row.intakeKcal === 0
                        ? '記録なし'
                        : row.burnKnown
                          ? `摂取 ${Math.round(row.intakeKcal)} ／ 消費 ${Math.round(row.burnKcal)}`
                          : `摂取 ${Math.round(row.intakeKcal)} ／ 消費 —`
                    }
                    value={
                      row.intakeKcal > 0 && row.burnKnown
                        ? `${formatSigned(row.intakeKcal - row.burnKcal)}`
                        : '—'
                    }
                  />
                </View>
              ))}
            </Card>
          )}
        </>
      ) : tab === 'pfc' ? (
        <>
          <Card>
            <CardTitle right={<Text style={styles.days}>記録 {recorded.length}日</Text>}>
              期間の合計と目標
            </CardTitle>
            <MacroRow
              label="タンパク質"
              actual={recorded.reduce((sum, row) => sum + row.proteinG, 0)}
              target={profile.targetProteinG * recorded.length}
              color={colors.protein}
            />
            <MacroRow
              label="脂質"
              actual={recorded.reduce((sum, row) => sum + row.fatG, 0)}
              target={profile.targetFatG * recorded.length}
              color={colors.fat}
            />
            <MacroRow
              label="炭水化物"
              actual={recorded.reduce((sum, row) => sum + row.carbG, 0)}
              target={profile.targetCarbG * recorded.length}
              color={colors.carb}
            />
            <Text style={styles.balanceNote}>
              目標は「1日の目標 × 記録した日数」で計算しています。
            </Text>
          </Card>

          <Card>
            <CardTitle>日別のPFC</CardTitle>
            {rows
              .filter((row) => row.intakeKcal > 0)
              .map((row, index) => (
                <View key={row.date}>
                  {index > 0 && <Divider />}
                  <Row
                    label={formatDayLabel(row.date)}
                    value={`P${Math.round(row.proteinG)} F${Math.round(row.fatG)} C${Math.round(row.carbG)}`}
                  />
                </View>
              ))}
          </Card>
        </>
      ) : tab === 'weight' ? (
        <>
          {!single && (
            <Card>
              <CardTitle>体重の推移</CardTitle>
              <LineChartView
                data={rows.map((row) => ({
                  label: formatDayShort(row.date),
                  value: row.weightKg,
                }))}
                unit="kg"
              />
              {weights.length >= 2 && (
                <Row
                  label="期間の増減"
                  value={`${formatSignedKg(
                    weights[weights.length - 1].weightKg - weights[0].weightKg,
                  )} kg`}
                />
              )}
              {weights.length > 0 && (
                <Row
                  label="最新のBMI"
                  value={calcBmi(weights[weights.length - 1].weightKg, profile.heightCm).toFixed(1)}
                />
              )}
            </Card>
          )}

          {!single && (
            <Card>
              <CardTitle>関連データ</CardTitle>
              <Row
                label="摂取・消費カロリーも見る"
                value={
                  <Switch
                    value={showIntakeWithWeight}
                    onValueChange={setShowIntakeWithWeight}
                    trackColor={{ true: colors.primary }}
                  />
                }
              />
              {showIntakeWithWeight && (
                <GroupedBarChart
                  data={rows.map((row) => ({
                    label: formatDayShort(row.date),
                    primary: row.intakeKcal,
                    secondary: row.burnKnown ? row.burnKcal : 0,
                  }))}
                />
              )}
            </Card>
          )}

          <Card>
            <CardTitle>記録</CardTitle>
            {weights.length === 0 ? (
              <Text style={styles.empty}>この期間の体重記録がありません</Text>
            ) : (
              [...weights].reverse().map((record, index) => (
                <View key={record.date}>
                  {index > 0 && <Divider />}
                  <Row
                    label={formatDayLabel(record.date)}
                    sub={record.bodyFatPct != null ? `体脂肪率 ${record.bodyFatPct}%` : undefined}
                    value={`${record.weightKg.toFixed(1)} kg`}
                  />
                </View>
              ))
            )}
          </Card>
        </>
      ) : (
        <>
          <Card>
            <CardTitle>運動量</CardTitle>
            <Row
              label={single ? '運動による消費' : '運動による消費（合計）'}
              value={`${Math.round(rows.reduce((sum, row) => sum + row.exerciseKcal, 0)).toLocaleString()} kcal`}
            />
            {single && rows[0]?.steps != null && (
              <>
                <Divider />
                <Row label="歩数" value={`${rows[0].steps.toLocaleString()} 歩`} />
              </>
            )}
            {!single && (
              <>
                <Divider />
                {rows.map((row, index) => (
                  <View key={row.date}>
                    {index > 0 && <Divider />}
                    <Row
                      label={formatDayLabel(row.date)}
                      sub={row.steps != null ? `${row.steps.toLocaleString()}歩` : undefined}
                      value={row.exerciseKcal > 0 ? `${Math.round(row.exerciseKcal)} kcal` : '—'}
                    />
                  </View>
                ))}
              </>
            )}
          </Card>

          {single && (
            <Card>
              <CardTitle>この日の運動</CardTitle>
              {activities.length === 0 ? (
                <Text style={styles.empty}>記録がありません</Text>
              ) : (
                activities.map((activity, index) => (
                  <View key={activity.id}>
                    {index > 0 && <Divider />}
                    <Row
                      label={activity.name ?? ACTIVITY_TYPE_LABELS[activity.type]}
                      sub={describeActivity(activity)}
                      value={activity.kcal != null ? `${Math.round(activity.kcal)} kcal` : '—'}
                    />
                  </View>
                ))
              )}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}

function MacroRow({
  label,
  actual,
  target,
  color,
}: {
  label: string;
  actual: number;
  target: number;
  color: string;
}) {
  const ratio = target > 0 ? Math.round((actual / target) * 100) : 0;
  return (
    <Row
      label={label}
      sub={`目標 ${Math.round(target).toLocaleString()}g に対して ${ratio}%`}
      value={
        <Text style={{ color, fontWeight: '700' }}>{Math.round(actual).toLocaleString()}g</Text>
      }
    />
  );
}

/** 「30分・5.0km」のように、記録された値だけを並べる */
function describeActivity(activity: Activity): string | undefined {
  const parts: string[] = [];
  if (activity.durationMin != null) parts.push(`${activity.durationMin}分`);
  if (activity.distanceKm != null) parts.push(`${activity.distanceKm}km`);
  if (activity.reps != null) parts.push(`${activity.reps}回`);
  if (activity.sets != null) parts.push(`${activity.sets}セット`);
  return parts.length > 0 ? parts.join('・') : undefined;
}

function formatSigned(value: number): string {
  const rounded = Math.round(value);
  return rounded >= 0 ? `+${rounded.toLocaleString()}` : `−${Math.abs(rounded).toLocaleString()}`;
}

function formatSignedKg(value: number): string {
  return value >= 0 ? `+${value.toFixed(1)}` : `−${Math.abs(value).toFixed(1)}`;
}

const styles = StyleSheet.create({
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  navButton: { padding: spacing.xs },
  navDisabled: { opacity: 0.3 },
  dateLabel: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  days: { fontSize: fontSize.xs, color: colors.textFaint },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  balanceLabel: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },
  balanceValue: { fontSize: fontSize.xl, fontWeight: '700' },
  balanceNote: {
    fontSize: fontSize.xs,
    color: colors.textFaint,
    lineHeight: 18,
  },
  empty: {
    fontSize: fontSize.sm,
    color: colors.textFaint,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
});
