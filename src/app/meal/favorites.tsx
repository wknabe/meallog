import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState, Screen } from '@/components/ui/layout';
import {
  deleteFavorite,
  incrementFavoriteUseCount,
  listFavorites,
  type MealFavorite,
} from '@/db/repo/favorites';
import { favoriteToMealItems } from '@/db/repo/meal-builder';
import { MEAL_SLOT_LABELS } from '@/lib/types';
import { useMealDraftStore } from '@/store/meal-draft';
import { colors, fontSize, radius, spacing } from '@/theme/colors';

export default function FavoritesScreen() {
  const router = useRouter();
  const addItems = useMealDraftStore((s) => s.addItems);
  const setSlot = useMealDraftStore((s) => s.setSlot);
  const [favorites, setFavorites] = useState<MealFavorite[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setFavorites(await listFavorites());
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function apply(favorite: MealFavorite) {
    const items = await favoriteToMealItems(favorite.items);
    if (items.length === 0) {
      Alert.alert('登録できませんでした', '参照している食品や料理が見つかりませんでした。');
      return;
    }
    if (favorite.slot) setSlot(favorite.slot);
    addItems(items);
    void incrementFavoriteUseCount(favorite.id);
    router.dismissTo('/meal/edit');
  }

  function confirmDelete(favorite: MealFavorite) {
    Alert.alert('このテンプレートを削除しますか？', favorite.name, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除する',
        style: 'destructive',
        onPress: async () => {
          await deleteFavorite(favorite.id);
          await reload();
        },
      },
    ]);
  }

  if (!loading && favorites.length === 0) {
    return (
      <Screen>
        <EmptyState
          title="まだ登録がありません"
          description="食事を記録するとき「よく食べる食事に登録」を押すと、次回からワンタップで記録できます。"
        />
      </Screen>
    );
  }

  return (
    <Screen>
      {favorites.map((favorite) => (
        <Pressable
          key={favorite.id}
          onPress={() => void apply(favorite)}
          onLongPress={() => confirmDelete(favorite)}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
          <View style={styles.flex}>
            <Text style={styles.name}>{favorite.name}</Text>
            <Text style={styles.sub}>
              {favorite.slot ? `${MEAL_SLOT_LABELS[favorite.slot]} ・ ` : ''}
              {favorite.items.length}品
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </Pressable>
      ))}
      <Text style={styles.hint}>長押しで削除できます</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  pressed: { opacity: 0.7 },
  name: { fontSize: fontSize.md, color: colors.text, fontWeight: '600' },
  sub: { fontSize: fontSize.xs, color: colors.textFaint, marginTop: 2 },
  hint: { fontSize: fontSize.xs, color: colors.textFaint, textAlign: 'center' },
});
