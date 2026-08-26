import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/ui/layout';
import { savePhoto } from '@/lib/photos';
import { today } from '@/lib/day';
import { MEAL_SLOT_LABELS, type MealSlot } from '@/lib/types';
import { useAppStore } from '@/store/app';
import { useMealDraftStore } from '@/store/meal-draft';
import { colors, fontSize, radius, spacing } from '@/theme/colors';

type Method = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
};

/** モックアップ②の記録方法一覧 */
const METHODS: Method[] = [
  { key: 'camera', label: 'カメラで撮影', icon: 'camera', color: '#2E9E63' },
  { key: 'library', label: '写真ライブラリから選択', icon: 'images', color: '#3A82D6' },
  { key: 'search', label: '食材・商品を検索', icon: 'search', color: '#E8912D' },
  { key: 'manual', label: '手入力で記録', icon: 'create', color: '#8B5CF6' },
  { key: 'favorite', label: 'よく食べる食事から選択', icon: 'star', color: '#E85D8A' },
];

export default function NewMealScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string; slot?: string }>();
  const settings = useAppStore((s) => s.settings);
  const startDraft = useMealDraftStore((s) => s.start);
  const [busy, setBusy] = useState(false);

  const date = params.date ?? today(settings.dayStartHour);
  const slot = (params.slot as MealSlot) ?? guessSlot();

  function begin(photoPath: string | null) {
    startDraft({ date, slot, photoPath, items: [] });
  }

  async function pickPhoto(source: 'camera' | 'library') {
    if (busy) return;
    setBusy(true);
    try {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          source === 'camera' ? 'カメラを使えません' : '写真を読み込めません',
          '端末の設定からアクセスを許可してください。'
        );
        return;
      }

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const path = await savePhoto(asset.uri, 'meal', {
        width: asset.width,
        height: asset.height,
      });
      begin(path);
      router.replace('/meal/edit');
    } catch (error) {
      console.error('写真の取り込みに失敗しました', error);
      Alert.alert('写真を保存できませんでした', 'もう一度お試しください。');
    } finally {
      setBusy(false);
    }
  }

  function handle(method: string) {
    switch (method) {
      case 'camera':
        void pickPhoto('camera');
        break;
      case 'library':
        void pickPhoto('library');
        break;
      case 'search':
        begin(null);
        router.replace('/meal/food-search');
        break;
      case 'manual':
        begin(null);
        router.replace('/meal/manual');
        break;
      case 'favorite':
        begin(null);
        router.replace('/meal/favorites');
        break;
    }
  }

  return (
    <Screen>
      <Text style={styles.lead}>
        {MEAL_SLOT_LABELS[slot]}の記録方法を選択してください
      </Text>

      <View style={styles.list}>
        {METHODS.map((method) => (
          <Pressable
            key={method.key}
            onPress={() => handle(method.key)}
            disabled={busy}
            style={({ pressed }) => [
              styles.method,
              { borderColor: `${method.color}33`, backgroundColor: `${method.color}0F` },
              pressed && styles.pressed,
              busy && styles.disabled,
            ]}>
            <View style={[styles.iconCircle, { backgroundColor: method.color }]}>
              <Ionicons name={method.icon} size={20} color="#fff" />
            </View>
            <Text style={styles.methodLabel}>{method.label}</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

/** 時刻から食事の区分を推測する。記録画面で変更できる */
function guessSlot(): MealSlot {
  const hour = new Date().getHours();
  if (hour < 10) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}

const styles = StyleSheet.create({
  lead: {
    fontSize: fontSize.sm,
    color: colors.textSub,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  list: { gap: spacing.md },
  method: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodLabel: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
});
