import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, SegmentedControl, TextField } from '@/components/ui/controls';
import { DateField, TimeField } from '@/components/ui/date-field';
import { Card, CardTitle, Divider, Screen } from '@/components/ui/layout';
import { createFavorite } from '@/db/repo/favorites';
import { createMeal, deleteMeal, updateMeal } from '@/db/repo/meals';
import { formatDayLabel, fromDayKey, logicalDate, toDayKey } from '@/lib/day';
import { deletePhoto, photoUri, savePhoto } from '@/lib/photos';
import { formatGrams } from '@/lib/units';
import { MEAL_SLOT_LABELS, MEAL_SLOT_ORDER, type MealSlot } from '@/lib/types';
import { useAppStore } from '@/store/app';
import { draftTotals, useMealDraftStore } from '@/store/meal-draft';
import { colors, fontSize, radius, spacing } from '@/theme/colors';

export default function EditMealScreen() {
  const router = useRouter();
  const settings = useAppStore((s) => s.settings);
  const draft = useMealDraftStore();
  const [saving, setSaving] = useState(false);

  const totals = draftTotals(draft.items);
  const eatenDate = new Date(draft.eatenAt);
  // 深夜の記録は前日ぶんとして集計されるので、その旨を画面に出す
  const logical = logicalDate(eatenDate, settings.dayStartHour);
  const calendarDate = toDayKey(eatenDate);

  async function handleSave() {
    if (saving) return;
    if (draft.items.length === 0) {
      Alert.alert('食べたものが登録されていません', '食材や料理を1つ以上追加してください。');
      return;
    }
    setSaving(true);
    try {
      const input = {
        date: logical,
        slot: draft.slot,
        eatenAt: draft.eatenAt,
        photoPath: draft.photoPath,
        memo: draft.memo.trim() === '' ? null : draft.memo.trim(),
        items: draft.items,
      };
      if (draft.mealId != null) {
        await updateMeal(draft.mealId, input);
      } else {
        await createMeal(input);
      }
      draft.clear();
      router.dismissAll();
      router.replace('/meals');
    } catch (error) {
      console.error('食事の保存に失敗しました', error);
      Alert.alert('保存できませんでした', 'もう一度お試しください。');
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (draft.mealId == null) return;
    Alert.alert('この記録を削除しますか？', '取り消せません。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除する',
        style: 'destructive',
        onPress: async () => {
          const mealId = draft.mealId;
          if (mealId == null) return;
          await deleteMeal(mealId);
          deletePhoto(draft.photoPath);
          draft.clear();
          router.dismissAll();
          router.replace('/meals');
        },
      },
    ]);
  }

  async function attachPhoto(source: 'camera' | 'library') {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('アクセスが許可されていません', '端末の設定から許可してください。');
      return;
    }
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const path = await savePhoto(asset.uri, 'meal', { width: asset.width, height: asset.height });
    // 差し替えたときは古い写真を残さない
    deletePhoto(draft.photoPath);
    draft.setPhoto(path);
  }

  function saveAsFavorite() {
    if (draft.items.length === 0) return;
    Alert.alert('よく食べる食事に登録', 'この組み合わせをワンタップで記録できるようにしますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '登録する',
        onPress: async () => {
          await createFavorite({
            name: draft.items.map((item) => item.name).join('・').slice(0, 30),
            slot: draft.slot,
            items: draft.items.map((item) => ({
              refType: item.refType,
              refId: item.refId,
              quantity: item.quantity,
              unitLabel: item.unitLabel,
            })),
          });
          Alert.alert('登録しました');
        },
      },
    ]);
  }

  const uri = photoUri(draft.photoPath);

  return (
    <Screen>
      {/* 食事の区分 */}
      <SegmentedControl<MealSlot>
        options={MEAL_SLOT_ORDER.map((slot) => ({ value: slot, label: MEAL_SLOT_LABELS[slot] }))}
        value={draft.slot}
        onChange={draft.setSlot}
      />

      {/* 日時 */}
      <Card>
        <View style={styles.dateRow}>
          <View style={styles.flex}>
            <Text style={styles.label}>日付</Text>
            <DateField
              value={calendarDate}
              onChange={(value) => {
                const next = fromDayKey(value);
                next.setHours(eatenDate.getHours(), eatenDate.getMinutes(), 0, 0);
                draft.setDateTime(logicalDate(next, settings.dayStartHour), next.toISOString());
              }}
            />
          </View>
          <View style={styles.timeBox}>
            <Text style={styles.label}>時刻</Text>
            <TimeField
              value={draft.eatenAt}
              onChange={(value) =>
                draft.setDateTime(logicalDate(new Date(value), settings.dayStartHour), value)
              }
            />
          </View>
        </View>
        {logical !== calendarDate && (
          <Text style={styles.note}>
            1日の区切りが{settings.dayStartHour}時のため、{formatDayLabel(logical)}ぶんとして集計されます
          </Text>
        )}
      </Card>

      {/* 写真 */}
      {uri != null ? (
        <View>
          <Image source={{ uri }} style={styles.photo} contentFit="cover" />
          <View style={styles.photoActions}>
            <Pressable onPress={() => attachPhoto('library')} style={styles.photoAction}>
              <Text style={styles.photoActionText}>写真を変更</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                deletePhoto(draft.photoPath);
                draft.setPhoto(null);
              }}
              style={styles.photoAction}>
              <Text style={[styles.photoActionText, { color: colors.danger }]}>削除</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.photoButtons}>
          <Pressable onPress={() => attachPhoto('camera')} style={styles.photoButton}>
            <Ionicons name="camera-outline" size={18} color={colors.primary} />
            <Text style={styles.photoButtonText}>撮影</Text>
          </Pressable>
          <Pressable onPress={() => attachPhoto('library')} style={styles.photoButton}>
            <Ionicons name="images-outline" size={18} color={colors.primary} />
            <Text style={styles.photoButtonText}>写真を選ぶ</Text>
          </Pressable>
        </View>
      )}

      {/* 食べたもの */}
      <Card>
        <CardTitle>食べたもの</CardTitle>

        {draft.items.length === 0 ? (
          <Text style={styles.empty}>まだ何も追加されていません</Text>
        ) : (
          draft.items.map((item, index) => (
            <View key={item.key}>
              {index > 0 && <Divider />}
              <View style={styles.item}>
                <View style={styles.flex}>
                  <Text style={styles.itemName} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text style={styles.itemAmount}>
                    {item.unitLabel ?? formatGrams(item.grams)}
                  </Text>
                </View>
                <Text style={styles.itemKcal}>{Math.round(item.nutrients.kcal)} kcal</Text>
                <Pressable
                  onPress={() => draft.removeItem(item.key)}
                  hitSlop={8}
                  style={styles.removeButton}>
                  <Ionicons name="close-circle" size={20} color={colors.textFaint} />
                </Pressable>
              </View>
            </View>
          ))
        )}

        <Divider />
        <Pressable onPress={() => router.push('/meal/food-search')} style={styles.addRow}>
          <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
          <Text style={styles.addText}>食材・商品を追加</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/meal/manual')} style={styles.addRow}>
          <Ionicons name="create-outline" size={20} color={colors.primary} />
          <Text style={styles.addText}>手入力で追加</Text>
        </Pressable>
      </Card>

      {/* 合計 */}
      <Card>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>合計</Text>
          <Text style={styles.totalKcal}>{Math.round(totals.kcal).toLocaleString()} kcal</Text>
        </View>
        <View style={styles.macroRow}>
          <MacroChip label="P" value={totals.proteinG} color={colors.protein} />
          <MacroChip label="F" value={totals.fatG} color={colors.fat} />
          <MacroChip label="C" value={totals.carbG} color={colors.carb} />
        </View>
      </Card>

      {/* メモ */}
      <Card>
        <CardTitle>メモ</CardTitle>
        <TextField
          value={draft.memo}
          onChangeText={draft.setMemo}
          placeholder="任意"
          multiline
          style={styles.memo}
        />
      </Card>

      <Button title={saving ? '保存中…' : '保存する'} onPress={handleSave} disabled={saving} />
      <Button title="よく食べる食事に登録" variant="secondary" onPress={saveAsFavorite} />
      {draft.mealId != null && (
        <Button title="この記録を削除" variant="ghost" onPress={handleDelete} />
      )}
    </Screen>
  );
}

function MacroChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.macroChip}>
      <View style={[styles.macroMark, { backgroundColor: color }]}>
        <Text style={styles.macroMarkText}>{label}</Text>
      </View>
      <Text style={styles.macroValue}>{Math.round(value)}g</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  label: { fontSize: fontSize.sm, color: colors.textSub, fontWeight: '600', marginBottom: 4 },
  dateRow: { flexDirection: 'row', gap: spacing.md },
  timeBox: { width: 110 },
  note: { fontSize: fontSize.xs, color: colors.warning, lineHeight: 16 },

  photo: { width: '100%', height: 200, borderRadius: radius.lg, backgroundColor: colors.surfaceMuted },
  photoActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md, paddingTop: spacing.xs },
  photoAction: { padding: spacing.xs },
  photoActionText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600' },
  photoButtons: { flexDirection: 'row', gap: spacing.md },
  photoButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  photoButtonText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600' },

  empty: { fontSize: fontSize.sm, color: colors.textFaint, textAlign: 'center', paddingVertical: spacing.md },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  itemName: { fontSize: fontSize.md, color: colors.text },
  itemAmount: { fontSize: fontSize.xs, color: colors.textFaint, marginTop: 2 },
  itemKcal: { fontSize: fontSize.sm, color: colors.textSub, fontWeight: '600' },
  removeButton: { padding: 2 },

  addRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  addText: { fontSize: fontSize.md, color: colors.primary, fontWeight: '600' },

  totalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  totalLabel: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  totalKcal: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  macroRow: { flexDirection: 'row', gap: spacing.lg },
  macroChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  macroMark: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  macroMarkText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  macroValue: { fontSize: fontSize.sm, color: colors.textSub, fontWeight: '600' },

  memo: { minHeight: 60, textAlignVertical: 'top' },
});
