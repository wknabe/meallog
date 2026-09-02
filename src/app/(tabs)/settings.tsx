import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/ui/header';
import {
  Button,
  Field,
  NumberInput,
  OptionList,
  PressableRow,
  SegmentedControl,
} from '@/components/ui/controls';
import { DateField } from '@/components/ui/date-field';
import { Card, CardTitle, Divider, Row, Screen } from '@/components/ui/layout';
import { resetDatabase } from '@/db';
import { listDailyActivityKcal, listDailyWalkSteps, listHealthDaily } from '@/db/repo/activities';
import { countFoods } from '@/db/repo/foods';
import { listDailyTotals } from '@/db/repo/meals';
import { FOOD_DATA_SOURCE } from '@/db/seed/foods';
import { PRODUCT_DATA_SOURCE } from '@/db/seed/products';
import { showAlert } from '@/lib/alert';
import { exportBackup, importBackup, shareBackup } from '@/lib/backup';
import { dailyStepsBurn, exerciseBonus } from '@/lib/energy';
import { HEALTH_SOURCE_NAME } from '@/lib/health';
import { formatBytes, photoStorageBytes } from '@/lib/photos';
import { addDays, calcAge, formatDayLabel, today } from '@/lib/day';
import { computeAdjustment, describeAdjustment } from '@/lib/adjustment';
import { ACTIVITY_LEVELS, calcTargets } from '@/lib/targets';
import type {
  ActivityLevel,
  AdjustmentDistribution,
  BurnSource,
  Gender,
  Profile,
} from '@/lib/types';
import { useAppStore } from '@/store/app';
import { colors, fontSize, spacing } from '@/theme/colors';

export default function SettingsScreen() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const settings = useAppStore((s) => s.settings);
  const currentWeightKg = useAppStore((s) => s.currentWeightKg);
  const updateProfile = useAppStore((s) => s.updateProfile);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const [heightText, setHeightText] = useState(profile ? String(profile.heightCm) : '');
  const [targetWeightText, setTargetWeightText] = useState(
    profile?.targetWeightKg != null ? String(profile.targetWeightKg) : '',
  );
  const [foodCount, setFoodCount] = useState<number | null>(null);
  const [photoBytes, setPhotoBytes] = useState<number | null>(null);
  const [adjustmentNote, setAdjustmentNote] = useState<string | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);

  useEffect(() => {
    countFoods()
      .then(setFoodCount)
      .catch(() => setFoodCount(null));
    try {
      setPhotoBytes(photoStorageBytes());
    } catch {
      setPhotoBytes(null);
    }
  }, []);

  // 設定を変えた結果がどれくらい効くのかをその場で見せる
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    const day = today(settings.dayStartHour);
    const bonusSettings = {
      addExerciseToTarget: settings.addExerciseToTarget,
      exerciseAddRatio: settings.exerciseAddRatio,
    };
    const from = addDays(day, -settings.adjustmentDays);
    const to = addDays(day, -1);
    Promise.all([
      listDailyTotals(from, to),
      listDailyActivityKcal(from, to),
      listHealthDaily(from, to),
      listDailyWalkSteps(from, to),
    ])
      .then(([history, historyExercise, historyHealth, historyWalkSteps]) => {
        if (cancelled) return;
        // ホーム画面と同じ基準で計算する（運動ぶんの上乗せを含めた目標と比べる）
        const exerciseByDate = new Map(historyExercise.map((row) => [row.date, row.kcal]));
        const healthByDate = new Map(historyHealth.map((row) => [row.date, row]));
        const walkStepsByDate = new Map(historyWalkSteps.map((row) => [row.date, row.steps]));
        const burnFor = (date: string): number =>
          (exerciseByDate.get(date) ?? 0) +
          dailyStepsBurn({
            enabled: settings.countStepsAsBurn,
            healthSteps: healthByDate.get(date)?.steps ?? null,
            manualSteps: healthByDate.get(date)?.manualSteps ?? null,
            recordedWalkSteps: walkStepsByDate.get(date) ?? 0,
            weightKg: currentWeightKg,
            heightCm: profile.heightCm,
          });
        const result = computeAdjustment({
          targetKcal: profile.targetKcal,
          history: history.map((row) => ({
            date: row.date,
            intakeKcal: row.kcal,
            recorded: true,
            bonusKcal: exerciseBonus(burnFor(row.date), bonusSettings),
          })),
          settings: {
            enabled: settings.adjustmentEnabled,
            days: settings.adjustmentDays,
            capPct: settings.adjustmentCapPct,
            distribution: settings.adjustmentDistribution,
          },
        });
        setAdjustmentNote(describeAdjustment(result));
      })
      .catch(() => setAdjustmentNote(null));
    return () => {
      cancelled = true;
    };
  }, [
    profile,
    currentWeightKg,
    settings.dayStartHour,
    settings.countStepsAsBurn,
    settings.addExerciseToTarget,
    settings.exerciseAddRatio,
    settings.adjustmentEnabled,
    settings.adjustmentDays,
    settings.adjustmentCapPct,
    settings.adjustmentDistribution,
  ]);

  if (!profile) return null;

  // 1ヶ月以上書き出していなければ促す
  const backupOverdue =
    settings.lastBackupAt == null ||
    Date.now() - new Date(settings.lastBackupAt).getTime() > 30 * 24 * 60 * 60 * 1000;

  /**
   * プロフィールを更新する。
   * 目標値を手で書き換えていない場合だけ、目標カロリー・PFCを計算し直す。
   */
  async function applyProfile(patch: Partial<Profile>) {
    if (!profile) return;
    const next: Profile = { ...profile, ...patch };
    if (!next.targetsOverridden && currentWeightKg != null) {
      const result = calcTargets({
        gender: next.gender,
        birthDate: next.birthDate,
        heightCm: next.heightCm,
        weightKg: currentWeightKg,
        activityLevel: next.activityLevel,
        targetWeightKg: next.targetWeightKg,
        targetDate: next.targetDate,
      });
      next.targetKcal = result.kcal;
      next.targetProteinG = result.proteinG;
      next.targetFatG = result.fatG;
      next.targetCarbG = result.carbG;
    }
    await updateProfile(next);
  }

  async function recalcTargets() {
    if (!profile || currentWeightKg == null) return;
    const result = calcTargets({
      gender: profile.gender,
      birthDate: profile.birthDate,
      heightCm: profile.heightCm,
      weightKg: currentWeightKg,
      activityLevel: profile.activityLevel,
      targetWeightKg: profile.targetWeightKg,
      targetDate: profile.targetDate,
    });
    try {
      await updateProfile({
        ...profile,
        targetKcal: result.kcal,
        targetProteinG: result.proteinG,
        targetFatG: result.fatG,
        targetCarbG: result.carbG,
        targetsOverridden: false,
      });
    } catch (error) {
      console.error('目標の再計算に失敗しました', error);
      showAlert('やり直せませんでした', 'もう一度お試しください。');
    }
  }

  /** 書き出して共有シートに渡す */
  async function runExport(includePhotos: boolean) {
    if (backupBusy) return;
    setBackupBusy(true);
    try {
      const uri = await exportBackup(includePhotos);
      await updateSettings({ lastBackupAt: new Date().toISOString() });
      await shareBackup(uri);
    } catch (error) {
      console.error('バックアップの書き出しに失敗しました', error);
      showAlert(
        '書き出せませんでした',
        error instanceof Error ? error.message : 'もう一度お試しください。',
      );
    } finally {
      setBackupBusy(false);
    }
  }

  /** ファイルを選んで復元する。現在のデータは置き換わる */
  async function runImport() {
    if (backupBusy) return;
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'application/zip', '*/*'],
      copyToCacheDirectory: true,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    const uri = picked.assets[0].uri;

    showAlert(
      '復元すると今のデータは消えます',
      '食事・体重・運動・設定を含め、すべてバックアップの内容に置き換わります。続けますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '復元する',
          style: 'destructive',
          onPress: async () => {
            setBackupBusy(true);
            try {
              const result = await importBackup(uri);
              await useAppStore.getState().bootstrap();
              showAlert(
                '復元しました',
                `${result.restored}件のデータ${result.photos > 0 ? `と${result.photos}枚の写真` : ''}を戻しました。`,
              );
            } catch (error) {
              console.error('バックアップの復元に失敗しました', error);
              showAlert(
                '復元できませんでした',
                error instanceof Error ? error.message : 'ファイルを確認してください。',
              );
            } finally {
              setBackupBusy(false);
            }
          },
        },
      ],
    );
  }

  function confirmReset() {
    showAlert(
      'データをすべて削除しますか？',
      '食事・体重・設定を含むすべての記録が消えます。この操作は取り消せません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除する',
          style: 'destructive',
          onPress: async () => {
            await resetDatabase();
            await useAppStore.getState().bootstrap();
          },
        },
      ],
    );
  }

  return (
    <Screen>
      <ScreenHeader title="設定" />

      {/* ── プロフィール ── */}
      <Card>
        <CardTitle>プロフィール</CardTitle>

        <Field label="性別">
          <SegmentedControl<Gender>
            options={[
              { value: 'male', label: '男性' },
              { value: 'female', label: '女性' },
            ]}
            value={profile.gender}
            onChange={(value) => applyProfile({ gender: value })}
          />
        </Field>

        <Field label="生年月日" hint={`現在 ${calcAge(profile.birthDate)}歳`}>
          <DateField
            value={profile.birthDate}
            onChange={(value) => applyProfile({ birthDate: value })}
            maximumDate={new Date()}
          />
        </Field>

        <Field label="身長">
          <NumberInput
            value={heightText}
            onChangeText={setHeightText}
            onEndEditing={() => {
              const value = Number(heightText);
              if (value > 0) applyProfile({ heightCm: value });
              else setHeightText(String(profile.heightCm));
            }}
            unit="cm"
          />
        </Field>

        <Field label="身体活動レベル">
          <OptionList<ActivityLevel>
            options={ACTIVITY_LEVELS.map((level) => ({
              value: level.level,
              label: level.label,
              description: level.example,
            }))}
            value={profile.activityLevel}
            onChange={(value) => applyProfile({ activityLevel: value })}
          />
        </Field>
      </Card>

      {/* ── 目標 ── */}
      <Card>
        <CardTitle>目標</CardTitle>

        <Field label="目標体重">
          <NumberInput
            value={targetWeightText}
            onChangeText={setTargetWeightText}
            onEndEditing={() => {
              const value = Number(targetWeightText);
              applyProfile({ targetWeightKg: value > 0 ? value : null });
            }}
            unit="kg"
            placeholder="未設定"
          />
        </Field>

        <Field label="達成希望日">
          <DateField
            value={profile.targetDate}
            onChange={(value) => applyProfile({ targetDate: value })}
            minimumDate={new Date()}
          />
        </Field>

        <Divider />

        <Field
          label="1日の目標カロリー"
          hint={
            profile.targetsOverridden
              ? '手動で設定した値です。プロフィールを変えても自動では変わりません。'
              : 'プロフィールから自動計算しています。'
          }
        >
          <NumberInput
            value={String(profile.targetKcal)}
            onChangeText={(text) =>
              applyProfile({
                targetKcal: Number(text) || 0,
                targetsOverridden: true,
              })
            }
            unit="kcal"
          />
        </Field>

        <View style={styles.macroRow}>
          <View style={styles.macroItem}>
            <Field label="タンパク質">
              <NumberInput
                value={String(profile.targetProteinG)}
                onChangeText={(text) =>
                  applyProfile({
                    targetProteinG: Number(text) || 0,
                    targetsOverridden: true,
                  })
                }
                unit="g"
              />
            </Field>
          </View>
          <View style={styles.macroItem}>
            <Field label="脂質">
              <NumberInput
                value={String(profile.targetFatG)}
                onChangeText={(text) =>
                  applyProfile({
                    targetFatG: Number(text) || 0,
                    targetsOverridden: true,
                  })
                }
                unit="g"
              />
            </Field>
          </View>
          <View style={styles.macroItem}>
            <Field label="炭水化物">
              <NumberInput
                value={String(profile.targetCarbG)}
                onChangeText={(text) =>
                  applyProfile({
                    targetCarbG: Number(text) || 0,
                    targetsOverridden: true,
                  })
                }
                unit="g"
              />
            </Field>
          </View>
        </View>

        {profile.targetsOverridden && (
          <Button title="自動計算に戻す" variant="secondary" onPress={() => void recalcTargets()} />
        )}
      </Card>

      {/* ── 1日の区切り ── */}
      <Card>
        <CardTitle>1日の区切り</CardTitle>
        <Text style={styles.description}>
          この時刻より前の記録は前日として集計します。深夜の間食が翌日に計上されるのを防げます。
        </Text>
        <SegmentedControl<number>
          options={[0, 3, 4, 5].map((hour) => ({
            value: hour,
            label: `${hour}時`,
          }))}
          value={settings.dayStartHour}
          onChange={(value) => updateSettings({ dayStartHour: value })}
        />
      </Card>

      {/* ── 食べ過ぎ調整 ── */}
      <Card>
        <CardTitle>食べ過ぎたときの調整</CardTitle>
        <Text style={styles.description}>
          直近の食べ過ぎ・食べ足りない分を、これから先の日の目標カロリーに分散して反映します。
        </Text>

        <Row
          label="調整する"
          value={
            <Switch
              value={settings.adjustmentEnabled}
              onValueChange={(value) => updateSettings({ adjustmentEnabled: value })}
              trackColor={{ true: colors.primary }}
            />
          }
        />

        {settings.adjustmentEnabled && (
          <>
            <Field label="調整期間" hint="短いほど反応が速く、きつめの調整になります">
              <SegmentedControl<number>
                options={[3, 5, 7, 14].map((days) => ({
                  value: days,
                  label: `${days}日`,
                }))}
                value={settings.adjustmentDays}
                onChange={(value) => updateSettings({ adjustmentDays: value })}
              />
            </Field>

            <Field label="1日の調整幅の上限" hint="上限を超えた分は、さらに先の日へ繰り越します">
              <SegmentedControl<number>
                options={[
                  { value: 10, label: '±10%' },
                  { value: 15, label: '±15%' },
                  { value: 20, label: '±20%' },
                  { value: 0, label: '制限なし' },
                ]}
                value={settings.adjustmentCapPct}
                onChange={(value) => updateSettings({ adjustmentCapPct: value })}
              />
            </Field>

            <Field label="分散方法" hint="前半重点は、直近の日に多めに配分して早く帳尻を合わせます">
              <SegmentedControl<AdjustmentDistribution>
                options={[
                  { value: 'even', label: '均等' },
                  { value: 'front', label: '前半重点' },
                ]}
                value={settings.adjustmentDistribution}
                onChange={(value) => updateSettings({ adjustmentDistribution: value })}
              />
            </Field>

            {adjustmentNote != null && (
              <View style={styles.preview}>
                <Text style={styles.previewText}>{adjustmentNote}</Text>
              </View>
            )}
          </>
        )}
      </Card>

      {/* ── 消費カロリー ── */}
      <Card>
        <CardTitle>消費カロリー</CardTitle>

        <Field
          label="どちらの値を使うか"
          hint={`${HEALTH_SOURCE_NAME}のデータがない日は、自動で推定値に切り替わります`}
        >
          <SegmentedControl<BurnSource>
            options={[
              { value: 'estimate', label: '推定値' },
              { value: 'watch', label: '実測値' },
            ]}
            value={settings.burnSource}
            onChange={(value) => updateSettings({ burnSource: value })}
          />
        </Field>

        <Row
          label={`${HEALTH_SOURCE_NAME}から自動で取り込む`}
          sub="アプリを開いたときに、歩数や消費カロリーを裏で取り込みます"
          value={
            <Switch
              value={settings.autoSyncHealth}
              onValueChange={(value) => updateSettings({ autoSyncHealth: value })}
              trackColor={{ true: colors.primary }}
            />
          }
        />
        {settings.autoSyncHealth && settings.lastHealthSyncAt != null && (
          <Text style={styles.hint}>
            最後に取り込んだのは {formatDateTime(settings.lastHealthSyncAt)} です
          </Text>
        )}

        <Row
          label="手で入れた歩数を消費に足す"
          sub={`${HEALTH_SOURCE_NAME}と連携できないときのための設定です。連携できている日は、そちらの消費カロリーに含まれるので足しません`}
          value={
            <Switch
              value={settings.countStepsAsBurn}
              onValueChange={(value) => updateSettings({ countStepsAsBurn: value })}
              trackColor={{ true: colors.primary }}
            />
          }
        />
        {settings.countStepsAsBurn && (
          <Text style={styles.hint}>
            歩幅を身長の45%として距離を出し、ふつうの速さで歩いたものとして計算します。
            運動として記録した歩数は差し引きます。
          </Text>
        )}

        <Row
          label="運動した分を目標に加算する"
          sub="消費カロリーの推定には誤差があるため、既定はオフです"
          value={
            <Switch
              value={settings.addExerciseToTarget}
              onValueChange={(value) => updateSettings({ addExerciseToTarget: value })}
              trackColor={{ true: colors.primary }}
            />
          }
        />

        {settings.addExerciseToTarget && (
          <Field label="加算する割合">
            <SegmentedControl<number>
              options={[
                { value: 100, label: '100%' },
                { value: 50, label: '50%（安全側）' },
              ]}
              value={settings.exerciseAddRatio}
              onChange={(value) => updateSettings({ exerciseAddRatio: value })}
            />
          </Field>
        )}
      </Card>

      {/* ── 写真 ── */}
      <Card>
        <CardTitle>写真の保存期間</CardTitle>
        <Text style={styles.description}>
          期限を過ぎた画像は自動で削除されますが、記録と栄養データは残ります。
        </Text>

        <Field label="食事の写真">
          <SegmentedControl<number>
            options={[
              { value: 90, label: '3ヶ月' },
              { value: 180, label: '6ヶ月' },
              { value: 365, label: '1年' },
              { value: 0, label: '無期限' },
            ]}
            value={settings.mealPhotoRetentionDays}
            onChange={(value) => updateSettings({ mealPhotoRetentionDays: value })}
          />
        </Field>

        <Row
          label="写真が使っている容量"
          value={photoBytes != null ? formatBytes(photoBytes) : '—'}
        />

        <Field label="成分表の写真">
          <SegmentedControl<number>
            options={[
              { value: 90, label: '3ヶ月' },
              { value: 180, label: '6ヶ月' },
              { value: 365, label: '1年' },
              { value: -1, label: '保存しない' },
            ]}
            value={settings.labelPhotoRetentionDays}
            onChange={(value) => updateSettings({ labelPhotoRetentionDays: value })}
          />
        </Field>
      </Card>

      {/* ── 食材・商品・料理 ── */}
      <Card>
        <CardTitle>食材・商品・料理</CardTitle>
        <PressableRow label="マイ食品・料理を管理" onPress={() => router.push('/library')} />
      </Card>

      {/* ── バックアップ ── */}
      <Card>
        <CardTitle>バックアップ</CardTitle>
        <Text style={styles.description}>
          データは端末の中だけに保存されています。機種変更やアプリの削除に備えて、
          ときどき書き出してクラウドやメールに保存してください。
        </Text>

        <Row
          label="最後に書き出した日"
          value={
            settings.lastBackupAt != null
              ? formatDayLabel(settings.lastBackupAt.slice(0, 10))
              : 'まだありません'
          }
        />
        {backupOverdue && (
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              前回の書き出しから1ヶ月以上経っています。念のため書き出しておくことをおすすめします。
            </Text>
          </View>
        )}

        <Button
          title={backupBusy ? '処理中…' : '書き出す（記録データのみ）'}
          onPress={() => void runExport(false)}
          disabled={backupBusy}
        />
        <Button
          title="書き出す（写真も含む）"
          variant="secondary"
          onPress={() => void runExport(true)}
          disabled={backupBusy}
        />
        <Button
          title="バックアップから復元"
          variant="ghost"
          onPress={() => void runImport()}
          disabled={backupBusy}
        />
      </Card>

      {/* ── データ ── */}
      <Card>
        <CardTitle>食品データ</CardTitle>
        <Row label="食材" value={foodCount != null ? `${foodCount.toLocaleString()}件` : '—'} />
        <Text style={styles.source}>出典: {FOOD_DATA_SOURCE}</Text>
        <Divider />
        <Row label="市販商品" value={`${PRODUCT_DATA_SOURCE.count.toLocaleString()}件`} />
        <Text style={styles.source}>
          出典: {PRODUCT_DATA_SOURCE.name}（{PRODUCT_DATA_SOURCE.licence}）
        </Text>
        <Text style={styles.source}>{PRODUCT_DATA_SOURCE.url}</Text>
      </Card>

      <Card>
        <CardTitle>データ</CardTitle>
        <Button title="すべてのデータを削除" variant="danger" onPress={confirmReset} />
      </Card>
    </Screen>
  );
}

/** 「8月27日 14:05」の形。最後に取り込んだ時刻を出すために使う */
function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.getMonth() + 1}月${date.getDate()}日 ${date.getHours()}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  hint: { fontSize: fontSize.xs, color: colors.textFaint },
  description: { fontSize: fontSize.sm, color: colors.textSub, lineHeight: 20 },
  preview: {
    backgroundColor: colors.primaryLight,
    borderRadius: 10,
    padding: spacing.md,
  },
  previewText: {
    fontSize: fontSize.sm,
    color: colors.primaryDark,
    fontWeight: '600',
  },
  warningBox: {
    backgroundColor: '#FDF0E6',
    borderRadius: 10,
    padding: spacing.md,
  },
  warningText: { fontSize: fontSize.sm, color: colors.textSub, lineHeight: 20 },
  source: { fontSize: fontSize.xs, color: colors.textFaint, lineHeight: 16 },
  macroRow: { flexDirection: 'row', gap: spacing.sm },
  macroItem: { flex: 1 },
});
