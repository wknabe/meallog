import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/controls';
import { EmptyState, Screen } from '@/components/ui/layout';
import {
  countProductReferences,
  deleteProduct,
  listProducts,
  type ProductSummary,
} from '@/db/repo/products';
import { colors, fontSize, radius, spacing } from '@/theme/colors';

/** 自分で登録した商品の一覧 */
export default function ProductsScreen() {
  const router = useRouter();
  const [keyword, setKeyword] = useState('');
  const [products, setProducts] = useState<ProductSummary[]>([]);

  const reload = useCallback(async () => {
    setProducts(await listProducts(keyword));
  }, [keyword]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  async function confirmDelete(product: ProductSummary) {
    // 料理の材料などから参照されていると削除できないため、先に確認する
    const references = await countProductReferences(product.id);
    if (references > 0) {
      Alert.alert(
        '削除できません',
        `この商品は料理の材料や買い物リストで${references}件使われています。先にそちらから外してください。`
      );
      return;
    }

    Alert.alert('この商品を削除しますか？', product.name, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除する',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteProduct(product.id);
            await reload();
          } catch (error) {
            console.error('商品の削除に失敗しました', error);
            Alert.alert('削除できませんでした', 'この商品はどこかで使われている可能性があります。');
          }
        },
      },
    ]);
  }

  return (
    <Screen>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={colors.textFaint} />
        <TextInput
          value={keyword}
          onChangeText={setKeyword}
          placeholder="商品名・メーカーで絞り込む"
          placeholderTextColor={colors.textFaint}
          style={styles.searchInput}
        />
      </View>

      <Button
        title="成分表から商品を登録"
        onPress={() => router.push('/library/product-edit')}
      />

      {products.length === 0 ? (
        <EmptyState
          title={keyword === '' ? 'まだ登録がありません' : '見つかりませんでした'}
          description="よく買う商品を登録しておくと、次から検索して食事に追加できます。再購入したときは新しい成分表で更新できます。"
        />
      ) : (
        products.map((product) => (
          <Pressable
            key={product.id}
            onPress={() =>
              router.push({ pathname: '/library/product-edit', params: { id: product.id } })
            }
            onLongPress={() => void confirmDelete(product)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <View style={styles.flex}>
              <Text style={styles.name}>{product.name}</Text>
              <Text style={styles.sub}>
                {product.maker != null ? `${product.maker} ・ ` : ''}
                100gあたり {Math.round(product.kcal)}kcal ／ P{product.proteinG.toFixed(1)} F
                {product.fatG.toFixed(1)} C{product.carbG.toFixed(1)}
              </Text>
              {product.labelBasis === 'serving' && product.labelServingG != null && (
                <Text style={styles.serving}>1食 {product.labelServingG}g で登録</Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </Pressable>
        ))
      )}

      {products.length > 0 && <Text style={styles.hint}>長押しで削除できます</Text>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: fontSize.md, color: colors.text },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  pressed: { opacity: 0.7 },
  name: { fontSize: fontSize.md, color: colors.text, fontWeight: '600' },
  sub: { fontSize: fontSize.xs, color: colors.textFaint, marginTop: 2 },
  serving: { fontSize: fontSize.xs, color: colors.primary, marginTop: 2 },
  hint: { fontSize: fontSize.xs, color: colors.textFaint, textAlign: 'center' },
});
