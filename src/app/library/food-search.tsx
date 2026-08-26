import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/ui/layout';
import { FOOD_GROUPS, searchFoods, type Food } from '@/db/repo/foods';
import { useDishDraftStore } from '@/store/dish-draft';
import { colors, fontSize, radius, spacing } from '@/theme/colors';

/**
 * 料理の材料を選ぶ画面。
 * 選ぶと100gで追加し、分量は料理の編集画面で直接調整してもらう。
 * 材料を1つずつ数量入力画面に送ると、レシピを組むときの手数が増えるため。
 */
export default function DishFoodSearchScreen() {
  const router = useRouter();
  const addIngredient = useDishDraftStore((s) => s.addIngredient);
  const [keyword, setKeyword] = useState('');
  const [foods, setFoods] = useState<Food[]>([]);
  const [added, setAdded] = useState<string[]>([]);

  const run = useCallback(async (value: string) => {
    try {
      setFoods(await searchFoods(value, { limit: 60 }));
    } catch (error) {
      console.error('検索に失敗しました', error);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void run(keyword), 250);
    return () => clearTimeout(timer);
  }, [keyword, run]);

  function handleSelect(food: Food) {
    addIngredient({
      foodId: food.id,
      foodName: food.name,
      grams: '100',
      // 調味料類（食品群17）と油脂類（14）、砂糖類（03）は既定で調味料扱いにする
      isSeasoning: ['03', '14', '17'].includes(food.groupCode ?? ''),
      per100g: food.per100g,
    });
    setAdded((previous) => [...previous, food.name]);
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <View style={styles.header}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.textFaint} />
          <TextInput
            value={keyword}
            onChangeText={setKeyword}
            placeholder="鶏むね肉、玉ねぎ、しょうゆ…"
            placeholderTextColor={colors.textFaint}
            style={styles.searchInput}
            autoCorrect={false}
          />
          {keyword !== '' && (
            <Pressable onPress={() => setKeyword('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textFaint} />
            </Pressable>
          )}
        </View>
        <Text style={styles.lead}>
          選ぶと100gで追加します。分量は前の画面で調整してください。
        </Text>
        {added.length > 0 && (
          <Pressable onPress={() => router.back()} style={styles.doneButton}>
            <Text style={styles.doneText}>{added.length}件を追加して戻る</Text>
          </Pressable>
        )}
      </View>

      <FlatList
        data={foods}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <EmptyState
            title={keyword === '' ? 'よく使う食品がここに出ます' : '見つかりませんでした'}
            description="食材名や商品名で検索してください。"
          />
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => handleSelect(item)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <View style={styles.flex}>
              <Text style={styles.name} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={styles.sub}>
                {item.groupCode ? `${FOOD_GROUPS[item.groupCode] ?? ''} ・ ` : ''}
                100gあたり {Math.round(item.per100g.kcal)}kcal
              </Text>
            </View>
            <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: fontSize.md, color: colors.text },
  lead: { fontSize: fontSize.xs, color: colors.textFaint },
  doneButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  doneText: { color: colors.textOnPrimary, fontWeight: '700', fontSize: fontSize.sm },
  listContent: { padding: spacing.lg, gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  pressed: { opacity: 0.7 },
  name: { fontSize: fontSize.md, color: colors.text },
  sub: { fontSize: fontSize.xs, color: colors.textFaint, marginTop: 2 },
});
