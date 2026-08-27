import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Field, NumberInput } from '@/components/ui/controls';
import { DateField } from '@/components/ui/date-field';
import { Card, CardTitle, EmptyState } from '@/components/ui/layout';
import { FOOD_GROUPS, listFoodUnits, searchFoods, type Food, type FoodUnit } from '@/db/repo/foods';
import { addToPantry } from '@/db/repo/pantry';
import { toGrams } from '@/lib/units';
import { colors, fontSize, radius, spacing } from '@/theme/colors';

export default function PantryAddScreen() {
  const router = useRouter();
  const [keyword, setKeyword] = useState('');
  const [foods, setFoods] = useState<Food[]>([]);
  const [selected, setSelected] = useState<Food | null>(null);
  const [units, setUnits] = useState<FoodUnit[]>([]);
  const [quantityText, setQuantityText] = useState('1');
  const [unitId, setUnitId] = useState<number | null>(null);
  const [expiresOn, setExpiresOn] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const run = useCallback(async (value: string) => {
    try {
      setFoods(await searchFoods(value, { limit: 50 }));
    } catch (error) {
      console.error('検索に失敗しました', error);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void run(keyword), 250);
    return () => clearTimeout(timer);
  }, [keyword, run]);

  async function select(food: Food) {
    setSelected(food);
    const loaded = await listFoodUnits(food.id);
    setUnits(loaded);
    // 購入単位があればそれを既定にする。買ってきた量をそのまま入れやすい
    const purchase = loaded.find((unit) => unit.isPurchaseUnit) ?? loaded[0] ?? null;
    setUnitId(purchase?.id ?? null);
    setQuantityText(purchase ? '1' : '100');
  }

  const selectedUnit = units.find((unit) => unit.id === unitId) ?? null;
  const quantity = Number(quantityText) || 0;
  const grams = selectedUnit ? toGrams(quantity, selectedUnit) : quantity;

  async function handleSave() {
    if (!selected || saving || grams <= 0) return;
    setSaving(true);
    try {
      await addToPantry(selected.id, grams, expiresOn);
      router.back();
    } catch (error) {
      console.error('冷蔵庫への追加に失敗しました', error);
      Alert.alert('追加できませんでした', 'もう一度お試しください。');
    } finally {
      setSaving(false);
    }
  }

  if (selected != null) {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <View style={styles.form}>
          <Card>
            <CardTitle>{selected.name}</CardTitle>
            <Text style={styles.sub}>
              {selected.groupCode ? (FOOD_GROUPS[selected.groupCode] ?? '') : ''}
            </Text>

            {units.length > 0 && (
              <Field label="単位">
                <View style={styles.unitRow}>
                  {units.map((unit) => (
                    <Pressable
                      key={unit.id}
                      onPress={() => {
                        setUnitId(unit.id);
                        setQuantityText('1');
                      }}
                      style={[styles.unitChip, unitId === unit.id && styles.unitChipSelected]}
                    >
                      <Text
                        style={[styles.unitText, unitId === unit.id && styles.unitTextSelected]}
                      >
                        {unit.name}
                      </Text>
                    </Pressable>
                  ))}
                  <Pressable
                    onPress={() => {
                      setUnitId(null);
                      setQuantityText(String(Math.round(grams)));
                    }}
                    style={[styles.unitChip, unitId === null && styles.unitChipSelected]}
                  >
                    <Text style={[styles.unitText, unitId === null && styles.unitTextSelected]}>
                      g
                    </Text>
                  </Pressable>
                </View>
              </Field>
            )}

            <Field label="数量" hint={selectedUnit ? `約 ${Math.round(grams)}g` : undefined}>
              <NumberInput
                value={quantityText}
                onChangeText={setQuantityText}
                unit={selectedUnit?.name ?? 'g'}
              />
            </Field>

            <Field label="賞味期限（任意）" hint="期限が近い食材を優先して使う献立を提案します">
              <DateField value={expiresOn} onChange={setExpiresOn} placeholder="設定しない" />
            </Field>

            <Button
              title={saving ? '追加中…' : '冷蔵庫に追加'}
              onPress={() => void handleSave()}
              disabled={saving || grams <= 0}
            />
            <Button title="別の食材を選ぶ" variant="ghost" onPress={() => setSelected(null)} />
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <View style={styles.header}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.textFaint} />
          <TextInput
            value={keyword}
            onChangeText={setKeyword}
            placeholder="鶏むね肉、玉ねぎ、キャベツ…"
            placeholderTextColor={colors.textFaint}
            style={styles.searchInput}
            autoCorrect={false}
          />
        </View>
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
            onPress={() => void select(item)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.flex}>
              <Text style={styles.name} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={styles.sub}>
                {item.groupCode ? (FOOD_GROUPS[item.groupCode] ?? '') : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  form: { padding: spacing.lg },
  header: {
    padding: spacing.lg,
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
  unitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  unitChip: {
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  unitChipSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  unitText: { fontSize: fontSize.sm, color: colors.textSub, fontWeight: '600' },
  unitTextSelected: { color: colors.textOnPrimary },
});
