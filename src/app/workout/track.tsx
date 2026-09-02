/**
 * ウォーキング・ランニングをGPSで測る。
 *
 * 地図は出さず、距離・時間・ペースと、通った形だけを線で見せる。
 * 画面を開いている間だけ測るので、計測中は画面を閉じないよう案内する。
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { Button, SegmentedControl } from '@/components/ui/controls';
import { Card, CardTitle, Screen } from '@/components/ui/layout';
import { createActivity, saveTrack } from '@/db/repo/activities';
import { formatElapsed, useTrack } from '@/hooks/use-track';
import { showAlert } from '@/lib/alert';
import { today } from '@/lib/day';
import { METS, estimateExerciseKcal } from '@/lib/energy';
import { paceLabel, trackToPath } from '@/lib/geo';
import type { ActivityType } from '@/lib/types';
import { useAppStore } from '@/store/app';
import { colors, fontSize, radius, spacing } from '@/theme/colors';

const CHART_WIDTH = 280;
const CHART_HEIGHT = 180;

export default function TrackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string; type?: string }>();
  const settings = useAppStore((s) => s.settings);
  const currentWeightKg = useAppStore((s) => s.currentWeightKg);

  const date = params.date ?? today(settings.dayStartHour);
  const [type, setType] = useState<ActivityType>(params.type === 'walk' ? 'walk' : 'run');
  const [saving, setSaving] = useState(false);

  const track = useTrack();

  const minutes = track.elapsedSec / 60;
  const pace = paceLabel(track.distanceKm, minutes);

  // 速さから自動でメッツを選ぶ。手で選ばせるより実態に合う
  const metsKey = pickMetsKey(type, track.distanceKm, minutes);
  const kcal =
    currentWeightKg && minutes > 0
      ? estimateExerciseKcal(METS[metsKey].mets, currentWeightKg, minutes)
      : 0;

  const path = trackToPath(track.points, CHART_WIDTH, CHART_HEIGHT);

  async function handleSave() {
    if (saving) return;
    if (track.distanceKm <= 0 && track.elapsedSec <= 0) return;
    setSaving(true);
    try {
      track.stop();
      const activityId = await createActivity({
        date,
        type,
        name: METS[metsKey].label,
        durationMin: minutes > 0 ? Math.round(minutes * 10) / 10 : null,
        distanceKm: track.distanceKm > 0 ? Math.round(track.distanceKm * 100) / 100 : null,
        // GPSは距離を測るもので、歩数は数えていない
        steps: null,
        reps: null,
        sets: null,
        kcal: kcal > 0 ? Math.round(kcal) : null,
        memo: null,
      });
      await saveTrack(activityId, track.points);
      track.reset();
      router.back();
    } catch (error) {
      console.error('GPS記録の保存に失敗しました', error);
      showAlert('保存できませんでした', 'もう一度お試しください。');
    } finally {
      setSaving(false);
    }
  }

  function confirmDiscard() {
    if (track.distanceKm <= 0 && track.elapsedSec <= 0) {
      router.back();
      return;
    }
    showAlert('計測をやめますか？', 'ここまでの記録は保存されません。', [
      { text: '続ける', style: 'cancel' },
      {
        text: 'やめる',
        style: 'destructive',
        onPress: () => {
          track.reset();
          router.back();
        },
      },
    ]);
  }

  if (track.state === 'denied') {
    return (
      <Screen>
        <Card>
          <CardTitle>位置情報が使えません</CardTitle>
          <Text style={styles.note}>
            距離を測るには位置情報の許可が必要です。端末の設定から「Meallog」の位置情報を許可してください。
            許可せずに記録する場合は、前の画面で距離を手入力できます。
          </Text>
        </Card>
        <Button title="戻る" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <SegmentedControl<ActivityType>
          options={[
            { value: 'walk', label: '歩く' },
            { value: 'run', label: '走る' },
          ]}
          value={type}
          onChange={setType}
        />
      </Card>

      <Card>
        <View style={styles.distanceRow}>
          <Text style={styles.distance}>{track.distanceKm.toFixed(2)}</Text>
          <Text style={styles.distanceUnit}>km</Text>
        </View>
        <View style={styles.statRow}>
          <Stat label="時間" value={formatElapsed(track.elapsedSec)} />
          <Stat label="ペース" value={pace ?? '—'} />
          <Stat label="消費" value={kcal > 0 ? `${Math.round(kcal)} kcal` : '—'} />
        </View>
      </Card>

      <Card>
        <CardTitle>通った道</CardTitle>
        {path.length < 2 ? (
          <Text style={styles.note}>
            {track.state === 'running'
              ? '位置を取得しています。少し歩くと形が出ます。'
              : '「はじめる」を押すと計測を始めます。'}
          </Text>
        ) : (
          <View style={styles.chart}>
            <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
              <Polyline
                points={path.map((point) => `${point.x},${point.y}`).join(' ')}
                fill="none"
                stroke={colors.primary}
                strokeWidth={3}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <Circle cx={path[0].x} cy={path[0].y} r={5} fill={colors.success} />
              <Circle
                cx={path[path.length - 1].x}
                cy={path[path.length - 1].y}
                r={5}
                fill={colors.danger}
              />
            </Svg>
            <Text style={styles.legend}>緑がスタート、赤が現在地</Text>
          </View>
        )}
      </Card>

      {track.state === 'running' ? (
        <>
          <Text style={styles.warning}>
            計測中は画面を開いたままにしてください。閉じると位置の取得が止まります。
          </Text>
          <Button title="一時停止" variant="secondary" onPress={track.pause} />
        </>
      ) : (
        <Button
          title={track.elapsedSec > 0 ? '再開する' : 'はじめる'}
          onPress={() => void track.start()}
        />
      )}

      {track.elapsedSec > 0 && (
        <Button
          title={saving ? '保存中…' : 'この内容で記録する'}
          variant="secondary"
          onPress={() => void handleSave()}
          disabled={saving}
        />
      )}

      <Button title="やめる" variant="ghost" onPress={confirmDiscard} />
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

/** 実際の速さからメッツを決める。歩きと走りで境目を変える */
function pickMetsKey(type: ActivityType, distanceKm: number, minutes: number): string {
  if (minutes <= 0 || distanceKm <= 0) return type === 'walk' ? 'walk' : 'run';
  const kmPerHour = distanceKm / (minutes / 60);

  if (type === 'walk') {
    if (kmPerHour < 4) return 'walk_slow';
    if (kmPerHour < 5.5) return 'walk';
    return 'walk_fast';
  }
  if (kmPerHour < 7) return 'jog';
  if (kmPerHour < 9.5) return 'run';
  return 'run_fast';
}

const styles = StyleSheet.create({
  distanceRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 6 },
  distance: { fontSize: fontSize.display, fontWeight: '800', color: colors.text },
  distanceUnit: { fontSize: fontSize.lg, color: colors.textSub },
  statRow: { flexDirection: 'row', gap: spacing.md },
  stat: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: fontSize.xs, color: colors.textFaint },
  statValue: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  chart: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
  },
  legend: { fontSize: fontSize.xs, color: colors.textFaint, marginTop: spacing.xs },
  note: { fontSize: fontSize.sm, color: colors.textSub, lineHeight: 20 },
  warning: { fontSize: fontSize.xs, color: colors.warning, lineHeight: 18 },
});
