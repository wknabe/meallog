import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, SegmentedControl } from '@/components/ui/controls';
import { EmptyState, Screen } from '@/components/ui/layout';
import { importProduct, searchCatalog, type CatalogProduct } from '@/db/repo/product-catalog';
import {
  countProductReferences,
  deleteProduct,
  listProducts,
  type ProductSummary,
} from '@/db/repo/products';
import { PRODUCT_DATA_SOURCE } from '@/db/seed/products';
import { colors, fontSize, radius, spacing } from '@/theme/colors';

type Tab = 'mine' | 'catalog';

/** 自分で登録した商品と、同梱している市販商品カタログ */
export default function ProductsScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('mine');
  const [keyword, setKeyword] = useState('');
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [importing, setImporting] = useState(false);

  const reload = useCallback(async () => {
    setProducts(await listProducts(keyword));
  }, [keyword]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  // カタログは件数が多いので、入力されたときだけ引く
  useEffect(() => {
    if (tab !== 'catalog') return;
    let cancelled = false;
    searchCatalog(keyword)
      .then((rows) => {
        if (!cancelled) setCatalog(rows);
      })
      .catch((error) => console.error('商品カタログの検索に失敗しました', error));
    return () => {
      cancelled = true;
    };
  }, [tab, keyword]);

  /** カタログの商品を自分の食品として取り込み、内容を確認できる画面へ送る */
  async function handleImport(product: CatalogProduct) {
    if (importing) return;
    setImporting(true);
    try {
      const id = await importProduct(product);
      await reload();
      setTab('mine');
      router.push({ pathname: '/library/product-edit', params: { id } });
    } catch (error) {
      console.error('商品の取り込みに失敗しました', error);
      Alert.alert('取り込めませんでした', 'もう一度お試しください。');
    } finally {
      setImporting(false);
    }
  }

  async function confirmDelete(product: ProductSummary) {
    // 料理の材料などから参照されていると削除できないため、先に確認する
    const references = await countProductReferences(product.id);
    if (references > 0) {
      Alert.alert(
        '削除できません',
        `この商品は料理の材料や買い物リストで${references}件使われています。先にそちらから外してください。`,
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
      <SegmentedControl<Tab>
        options={[
          { value: 'mine', label: '登録した商品' },
          { value: 'catalog', label: '市販商品を探す' },
        ]}
        value={tab}
        onChange={setTab}
      />

      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={colors.textFaint} />
        <TextInput
          value={keyword}
          onChangeText={setKeyword}
          placeholder={
            tab === 'mine' ? '商品名・メーカーで絞り込む' : '商品名で探す（例: おにぎり）'
          }
          placeholderTextColor={colors.textFaint}
          style={styles.searchInput}
        />
      </View>

      {tab === 'catalog' ? (
        <CatalogList
          keyword={keyword}
          items={catalog}
          importing={importing}
          onSelect={(product) => void handleImport(product)}
        />
      ) : (
        <>
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
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
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
        </>
      )}
    </Screen>
  );
}

/** 同梱した市販商品カタログの検索結果 */
function CatalogList({
  keyword,
  items,
  importing,
  onSelect,
}: {
  keyword: string;
  items: CatalogProduct[];
  importing: boolean;
  onSelect: (product: CatalogProduct) => void;
}) {
  if (keyword.trim() === '') {
    return (
      <EmptyState
        title="商品名を入力してください"
        description={`コンビニやスーパーの商品を${PRODUCT_DATA_SOURCE.count.toLocaleString()}件収録しています。見つからない商品は「登録した商品」から手で登録できます。`}
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="見つかりませんでした"
        description="収録しているのは一部の商品だけです。「登録した商品」のタブから、成分表を見ながら登録できます。"
      />
    );
  }

  return (
    <>
      {items.map((product) => (
        <Pressable
          key={product.barcode}
          onPress={() => onSelect(product)}
          disabled={importing}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <View style={styles.flex}>
            <Text style={styles.name}>{product.name}</Text>
            <Text style={styles.sub}>
              {product.maker != null ? `${product.maker} ・ ` : ''}
              100gあたり {Math.round(product.kcal)}kcal ／ P{product.proteinG.toFixed(1)} F
              {product.fatG.toFixed(1)} C{product.carbG.toFixed(1)}
            </Text>
            {product.quantity != null && (
              <Text style={styles.serving}>内容量 {product.quantity}</Text>
            )}
          </View>
          <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
        </Pressable>
      ))}
      <Text style={styles.hint}>
        出典: {PRODUCT_DATA_SOURCE.name}（{PRODUCT_DATA_SOURCE.licence}）
      </Text>
      <Text style={styles.hint}>
        誰でも登録できるデータのため、値が実際と違うことがあります。取り込んだあとに直せます。
      </Text>
    </>
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
