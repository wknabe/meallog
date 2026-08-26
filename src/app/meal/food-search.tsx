import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, SegmentedControl } from '@/components/ui/controls';
import { EmptyState } from '@/components/ui/layout';
import { dishNutrition, listDishes, type Dish } from '@/db/repo/dishes';
import { FOOD_GROUPS, searchFoods, type Food } from '@/db/repo/foods';
import { colors, fontSize, radius, spacing } from '@/theme/colors';

type Mode = 'food' | 'dish';

export default function FoodSearchScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('food');
  const [keyword, setKeyword] = useState('');
  const [foods, setFoods] = useState<Food[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async (value: string, target: Mode) => {
    setLoading(true);
    try {
      if (target === 'food') {
        setFoods(await searchFoods(value, { limit: 60 }));
      } else {
        setDishes(await listDishes({ keyword: value, limit: 60 }));
      }
    } catch (error) {
      console.error('検索に失敗しました', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // 入力のたびに検索すると重いので、打ち終わりを少し待ってから実行する
  useEffect(() => {
    const timer = setTimeout(() => {
      void run(keyword, mode);
    }, 250);
    return () => clearTimeout(timer);
  }, [keyword, mode, run]);

  // 商品を登録して戻ってきたときに、結果へ反映されるようにする
  useFocusEffect(
    useCallback(() => {
      void run(keyword, mode);
    }, [run, keyword, mode])
  );

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <View style={styles.header}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.textFaint} />
          <TextInput
            value={keyword}
            onChangeText={setKeyword}
            placeholder={mode === 'food' ? '鶏むね肉、玉ねぎ、白米…' : '料理名で検索'}
            placeholderTextColor={colors.textFaint}
            style={styles.searchInput}
            autoCorrect={false}
            returnKeyType="search"
          />
          {keyword !== '' && (
            <Pressable onPress={() => setKeyword('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textFaint} />
            </Pressable>
          )}
        </View>

        <SegmentedControl<Mode>
          options={[
            { value: 'food', label: '食材・商品' },
            { value: 'dish', label: '料理' },
          ]}
          value={mode}
          onChange={setMode}
        />
      </View>

      {mode === 'food' ? (
        <FlatList
          data={foods}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            loading ? null : (
              <View>
                <EmptyState
                  title={keyword === '' ? 'よく使う食品がここに出ます' : '見つかりませんでした'}
                  description={
                    keyword === ''
                      ? '食材名や商品名で検索してください。'
                      : '別の言い方でも探してみてください。市販品は成分表を登録すると次から検索できます。'
                  }
                />
                {keyword !== '' && (
                  <Button
                    title="成分表から商品を登録"
                    variant="secondary"
                    onPress={() => router.push('/library/product-edit')}
                  />
                )}
              </View>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/meal/food-detail', params: { id: item.id } })}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <View style={styles.flex}>
                <Text style={styles.name} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={styles.sub}>
                  {item.groupCode ? `${FOOD_GROUPS[item.groupCode] ?? ''} ・ ` : ''}
                  100gあたり {Math.round(item.per100g.kcal)}kcal ／ P{item.per100g.protein_g} F
                  {item.per100g.fat_g} C{item.per100g.carb_g}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={dishes}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            loading ? null : (
              <EmptyState
                title="料理がまだありません"
                description="料理データはこれから追加していきます。"
              />
            )
          }
          renderItem={({ item }) => {
            const nutrition = dishNutrition(item, 1);
            return (
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/meal/food-detail', params: { dishId: item.id } })
                }
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                <View style={styles.flex}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.sub}>
                    1人前 {Math.round(nutrition.nutrients.kcal)}kcal
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    padding: spacing.lg,
    gap: spacing.md,
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
