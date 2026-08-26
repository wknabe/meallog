import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/ui/header';
import {
  Button,
  Field,
  NumberInput,
  OptionList,
  SegmentedControl,
} from '@/components/ui/controls';
import { DateField } from '@/components/ui/date-field';
import { Card, CardTitle, Divider, Row, Screen } from '@/components/ui/layout';
import { resetDatabase } from '@/db';
import { countFoods } from '@/db/repo/foods';
import { FOOD_DATA_SOURCE } from '@/db/seed/foods';
import { formatBytes, photoStorageBytes } from '@/lib/photos';
import { calcAge } from '@/lib/day';
import { ACTIVITY_LEVELS, calcTargets } from '@/lib/targets';
import type { ActivityLevel, AdjustmentDistribution, BurnSource, Gender, Profile } from '@/lib/types';
import { useAppStore } from '@/store/app';
import { colors, fontSize, spacing } from '@/theme/colors';

export default function SettingsScreen() {
  const profile = useAppStore((s) => s.profile);
  const settings = useAppStore((s) => s.settings);
  const currentWeightKg = useAppStore((s) => s.currentWeightKg);
  const updateProfile = useAppStore((s) => s.updateProfile);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const [heightText, setHeightText] = useState(profile ? String(profile.heightCm) : '');
  const [targetWeightText, setTargetWeightText] = useState(
    profile?.targetWeightKg != null ? String(profile.targetWeightKg) : ''
  );
  const [foodCount, setFoodCount] = useState<number | null>(null);
  const [photoBytes, setPhotoBytes] = useState<number | null>(null);

  useEffect(() => {
    countFoods().then(setFoodCount).catch(() => setFoodCount(null));
    try {
      setPhotoBytes(photoStorageBytes());
    } catch {
      setPhotoBytes(null);
    }
  }, []);

  if (!profile) return null;

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
    await updateProfile({
      ...profile,
      targetKcal: result.kcal,
      targetProteinG: result.proteinG,
      targetFatG: result.fatG,
      targetCarbG: result.carbG,
      targetsOverridden: false,
    });
  }

  function confirmReset() {
    Alert.alert(
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
      ]
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
          }>
          <NumberInput
            value={String(profile.targetKcal)}
            onChangeText={(text) =>
              applyProfile({ targetKcal: Number(text) || 0, targetsOverridden: true })
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
                  applyProfile({ targetProteinG: Number(text) || 0, targetsOverridden: true })
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
                  applyProfile({ targetFatG: Number(text) || 0, targetsOverridden: true })
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
                  applyProfile({ targetCarbG: Number(text) || 0, targetsOverridden: true })
                }
                unit="g"
              />
            </Field>
          </View>
        </View>

        {profile.targetsOverridden && (
          <Button title="自動計算に戻す" variant="secondary" onPress={recalcTargets} />
        )}
      </Card>

      {/* ── 1日の区切り ── */}
      <Card>
        <CardTitle>1日の区切り</CardTitle>
        <Text style={styles.description}>
          この時刻より前の記録は前日として集計します。深夜の間食が翌日に計上されるのを防げます。
        </Text>
        <SegmentedControl<number>
          options={[0, 3, 4, 5].map((hour) => ({ value: hour, label: `${hour}時` }))}
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
                options={[3, 5, 7, 14].map((days) => ({ value: days, label: `${days}日` }))}
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
          </>
        )}
      </Card>

      {/* ── 消費カロリー ── */}
      <Card>
        <CardTitle>消費カロリー</CardTitle>

        <Field
          label="どちらの値を使うか"
          hint="スマートウォッチのデータがない日は、自動で推定値に切り替わります">
          <SegmentedControl<BurnSource>
            options={[
              { value: 'estimate', label: '推定値' },
              { value: 'watch', label: 'ウォッチ' },
            ]}
            value={settings.burnSource}
            onChange={(value) => updateSettings({ burnSource: value })}
          />
        </Field>

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

      {/* ── データ ── */}
      <Card>
        <CardTitle>食品データ</CardTitle>
        <Row label="収録件数" value={foodCount != null ? `${foodCount.toLocaleString()}件` : '—'} />
        <Text style={styles.source}>出典: {FOOD_DATA_SOURCE}</Text>
      </Card>

      <Card>
        <CardTitle>データ</CardTitle>
        <Button title="すべてのデータを削除" variant="danger" onPress={confirmReset} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  description: { fontSize: fontSize.sm, color: colors.textSub, lineHeight: 20 },
  source: { fontSize: fontSize.xs, color: colors.textFaint, lineHeight: 16 },
  macroRow: { flexDirection: 'row', gap: spacing.sm },
  macroItem: { flex: 1 },
});
