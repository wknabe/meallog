import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Screen } from '@/components/ui/layout';
import { countDishes } from '@/db/repo/dishes';
import { countFoods } from '@/db/repo/foods';
import { FOOD_DATA_SOURCE } from '@/db/seed/foods';
import { colors, fontSize, radius, spacing } from '@/theme/colors';

/** 食材・商品・料理の入口 */
export default function LibraryIndexScreen() {
  const router = useRouter();
  const [counts, setCounts] = useState({ standard: 0, product: 0, dish: 0 });

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([countFoods('standard'), countFoods('product'), countDishes()])
        .then(([standard, product, dish]) => {
          if (!cancelled) setCounts({ standard, product, dish });
        })
        .catch((error) => console.error('件数の取得に失敗しました', error));
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return (
    <Screen>
      <MenuItem
        icon="pricetag"
        color="#E8912D"
        title="マイ食品"
        description={`自分で登録した商品 ${counts.product}件`}
        onPress={() => router.push('/library/products')}
      />
      <MenuItem
        icon="camera"
        color="#8B5CF6"
        title="成分表から商品を登録"
        description="パッケージの栄養成分表示を見ながら登録します"
        onPress={() => router.push('/library/product-edit')}
      />
      <MenuItem
        icon="restaurant"
        color="#2E9E63"
        title="料理"
        description={`登録されている料理 ${counts.dish}件`}
        onPress={() => router.push('/library/dishes')}
      />

      <Card>
        <Text style={styles.sourceTitle}>収録している食材データ</Text>
        <Text style={styles.sourceCount}>{counts.standard.toLocaleString()}件</Text>
        <Text style={styles.source}>出典: {FOOD_DATA_SOURCE}</Text>
      </Card>
    </Screen>
  );
}

function MenuItem({
  icon,
  color,
  title,
  description,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
      <View style={[styles.iconCircle, { backgroundColor: color }]}>
        <Ionicons name={icon} size={20} color="#fff" />
      </View>
      <View style={styles.flex}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  pressed: { opacity: 0.7 },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  description: { fontSize: fontSize.xs, color: colors.textFaint, marginTop: 2 },
  sourceTitle: { fontSize: fontSize.sm, color: colors.textSub, fontWeight: '600' },
  sourceCount: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  source: { fontSize: fontSize.xs, color: colors.textFaint, lineHeight: 16 },
});
