import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Field, NumberInput, SegmentedControl } from '@/components/ui/controls';
import { Card, CardTitle, Divider, Row, Screen } from '@/components/ui/layout';
import { NUTRIENT_LABELS, MACRO_KEYS, MINERAL_KEYS, VITAMIN_KEYS } from '@/db/nutrients';
import { dishNutrition, getDish, incrementDishUseCount, type Dish } from '@/db/repo/dishes';
import {
  FOOD_GROUPS,
  getFood,
  incrementFoodUseCount,
  listFoodUnits,
  type Food,
  type FoodUnit,
} from '@/db/repo/foods';
import { dishToMealItem, foodToMealItem } from '@/db/repo/meal-builder';
import { nutrientsForFood } from '@/lib/nutrition';
import { fromGrams, toGrams } from '@/lib/units';
import { useMealDraftStore } from '@/store/meal-draft';
import { colors, fontSize, spacing } from '@/theme/colors';

/** グラム入力を素早く調整するための倍率ボタン */
const MULTIPLIERS = [0.5, 1.5, 2];

export default function FoodDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; dishId?: string }>();
  const addItems = useMealDraftStore((s) => s.addItems);

  const [food, setFood] = useState<Food | null>(null);
  const [units, setUnits] = useState<FoodUnit[]>([]);
  const [dish, setDish] = useState<Dish | null>(null);
  const [quantityText, setQuantityText] = useState('100');
  /** null はグラム直接入力 */
  const [unitId, setUnitId] = useState<number | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  // 連打で同じ食材が2件追加されるのを防ぐ
  const [added, setAdded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (params.dishId) {
        const loaded = await getDish(Number(params.dishId));
        if (cancelled) return;
        setDish(loaded);
        setQuantityText('1');
        return;
      }
      if (!params.id) return;
      const loaded = await getFood(Number(params.id));
      const loadedUnits = await listFoodUnits(Number(params.id));
      if (cancelled) return;
      setFood(loaded);
      setUnits(loadedUnits);
      // 常用単位があるものは「1個」「1パック」から始めたほうが入力が速い
      if (loadedUnits.length > 0) {
        setUnitId(loadedUnits[0].id);
        setQuantityText('1');
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [params.id, params.dishId]);

  const quantity = Number(quantityText) || 0;
  const selectedUnit = units.find((unit) => unit.id === unitId) ?? null;
  const grams = dish ? 0 : toGrams(quantity, selectedUnit);

  const nutrients = useMemo(() => {
    if (dish) return dishNutrition(dish, quantity).nutrients;
    if (food) {
      return nutrientsForFood({ id: food.id, name: food.name, per100g: food.per100g }, grams);
    }
    return null;
  }, [dish, food, grams, quantity]);

  function handleAdd() {
    if (quantity <= 0 || added) return;
    setAdded(true);
    if (dish) {
      addItems([dishToMealItem(dish, quantity)]);
      void incrementDishUseCount(dish.id);
    } else if (food) {
      addItems([foodToMealItem(food, quantity, selectedUnit)]);
      void incrementFoodUseCount(food.id);
    } else {
      setAdded(false);
      return;
    }
    // 記録画面まで一気に戻る。記録画面が履歴になければ、この画面と置き換わる
    router.dismissTo('/meal/edit');
  }

  if (!food && !dish) {
    return (
      <Screen>
        <Text style={styles.loading}>読み込み中…</Text>
      </Screen>
    );
  }

  const title = dish ? dish.name : (food?.name ?? '');
  const totalGrams = dish ? dishNutrition(dish, quantity).grams : grams;

  return (
    <Screen>
      <Card>
        <Text style={styles.title}>{title}</Text>
        {dish ? (
          <Text style={styles.sub}>
            材料 {dish.ingredients.length}種類 ／ {dish.servings}人前ぶんのレシピ
          </Text>
        ) : (
          <Text style={styles.sub}>
            {food?.groupCode ? `${FOOD_GROUPS[food.groupCode] ?? ''} ・ ` : ''}
            {food?.source === 'product' ? '登録した商品' : '日本食品標準成分表'}
          </Text>
        )}
      </Card>

      {/* 数量の入力 */}
      <Card>
        <CardTitle>{dish ? '食べる量（人前）' : '食べる量'}</CardTitle>

        {!dish && units.length > 0 && (
          <SegmentedControl<number>
            options={[
              ...units.map((unit) => ({ value: unit.id, label: unit.name })),
              { value: -1, label: 'g' },
            ]}
            value={unitId ?? -1}
            onChange={(value) => {
              const nextUnit = units.find((unit) => unit.id === value) ?? null;
              // 単位を切り替えたときは、いまの重量を引き継ぐ
              const currentGrams = toGrams(quantity, selectedUnit);
              setUnitId(nextUnit?.id ?? null);
              setQuantityText(
                nextUnit
                  ? String(Number(fromGrams(currentGrams, nextUnit).toFixed(2)))
                  : String(Math.round(currentGrams)),
              );
            }}
          />
        )}

        <Field label={dish ? '人前' : (selectedUnit?.name ?? 'グラム')}>
          <NumberInput
            value={quantityText}
            onChangeText={setQuantityText}
            unit={dish ? '人前' : (selectedUnit?.name ?? 'g')}
          />
        </Field>

        <View style={styles.multipliers}>
          {MULTIPLIERS.map((multiplier) => (
            <Pressable
              key={multiplier}
              onPress={() => setQuantityText(String(Number((quantity * multiplier).toFixed(2))))}
              style={styles.multiplier}
            >
              <Text style={styles.multiplierText}>{multiplier}倍</Text>
            </Pressable>
          ))}
        </View>

        {selectedUnit != null && <Text style={styles.sub}>約 {Math.round(grams)}g</Text>}
        {dish != null && <Text style={styles.sub}>約 {Math.round(totalGrams)}g</Text>}
      </Card>

      {/* 栄養価 */}
      {nutrients != null && (
        <Card>
          <CardTitle>この量の栄養価</CardTitle>
          <Row label="エネルギー" value={`${Math.round(nutrients.kcal)} kcal`} />
          <Divider />
          {MACRO_KEYS.filter((key) => key !== 'kcal').map((key) => (
            <Row
              key={key}
              label={NUTRIENT_LABELS[key].label}
              value={`${nutrients[key].toFixed(1)} ${NUTRIENT_LABELS[key].unit}`}
            />
          ))}

          <Pressable onPress={() => setShowDetails((value) => !value)} style={styles.toggle}>
            <Text style={styles.toggleText}>
              {showDetails ? 'ビタミン・ミネラルを隠す' : 'ビタミン・ミネラルを見る'}
            </Text>
          </Pressable>

          {showDetails && (
            <View style={styles.details}>
              {[...VITAMIN_KEYS, ...MINERAL_KEYS].map((key) => (
                <Row
                  key={key}
                  label={NUTRIENT_LABELS[key].label}
                  value={`${nutrients[key].toFixed(nutrients[key] < 10 ? 2 : 0)} ${NUTRIENT_LABELS[key].unit}`}
                />
              ))}
            </View>
          )}
        </Card>
      )}

      <Button title="食事に追加" onPress={handleAdd} disabled={quantity <= 0 || added} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { textAlign: 'center', color: colors.textFaint, padding: spacing.xl },
  title: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  sub: { fontSize: fontSize.sm, color: colors.textSub },
  multipliers: { flexDirection: 'row', gap: spacing.sm },
  multiplier: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  multiplierText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600' },
  toggle: { paddingVertical: spacing.sm },
  toggleText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600' },
  details: { gap: 2 },
});
