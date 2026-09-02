import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import {
  Button,
  Chip,
  ChipGroup,
  Field,
  NumberInput,
  SegmentedControl,
  TextField,
} from '@/components/ui/controls';
import { Card, CardTitle, Divider, Screen } from '@/components/ui/layout';
import { createDish, deleteDish, updateDish } from '@/db/repo/dishes';
import { showAlert } from '@/lib/alert';
import { formatGrams } from '@/lib/units';
import {
  CUISINE_LABELS,
  DISH_CATEGORY_LABELS,
  EFFORT_LABELS,
  TASTE_LABELS,
  VOLUME_LABELS,
  type Cuisine,
  type DishCategory,
  type Effort,
  type Taste,
  type Volume,
} from '@/lib/types';
import { draftDishNutrition, toGramsValue, useDishDraftStore } from '@/store/dish-draft';
import { colors, fontSize, radius, spacing } from '@/theme/colors';

const CATEGORIES: DishCategory[] = ['staple', 'main', 'side', 'soup', 'other'];
const CUISINES: Cuisine[] = ['japanese', 'western', 'chinese', 'ethnic'];
const EFFORTS: Effort[] = ['full', 'easy', 'heatonly', 'nocook'];
const VOLUMES: Volume[] = ['hearty', 'normal', 'light'];
const TASTES: Taste[] = ['light', 'rich', 'spicy', 'warm'];

export default function DishEditScreen() {
  const router = useRouter();
  const draft = useDishDraftStore();
  const [saving, setSaving] = useState(false);

  const servingsValue = Number(draft.servings);
  const servingsValid = Number.isFinite(servingsValue) && servingsValue > 0;
  const servings = servingsValid ? servingsValue : 1;
  const nutrition = draftDishNutrition(draft.ingredients, servings);
  const hasGrams = draft.ingredients.every((ingredient) => toGramsValue(ingredient.grams) > 0);
  const canSave =
    draft.name.trim() !== '' && draft.ingredients.length > 0 && servingsValid && hasGrams;

  async function handleSave() {
    if (saving || !canSave) return;
    setSaving(true);
    try {
      const input = {
        name: draft.name.trim(),
        category: draft.category,
        cuisine: draft.cuisine,
        effort: draft.effort,
        volume: draft.volume,
        tastes: draft.tastes,
        servings,
        // 「.」だけ入力された場合などに NaN を保存しないようにする
        cookMinutes:
          Number.isFinite(Number(draft.cookMinutes)) && draft.cookMinutes.trim() !== ''
            ? Number(draft.cookMinutes)
            : null,
        steps: draft.steps.trim() === '' ? null : draft.steps.trim(),
        ingredients: draft.ingredients.map((ingredient) => ({
          foodId: ingredient.foodId,
          grams: toGramsValue(ingredient.grams),
          isSeasoning: ingredient.isSeasoning,
        })),
      };
      if (draft.dishId != null) {
        await updateDish(draft.dishId, input);
      } else {
        await createDish(input);
      }
      draft.clear();
      router.back();
    } catch (error) {
      console.error('料理の保存に失敗しました', error);
      showAlert('保存できませんでした', 'もう一度お試しください。');
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (draft.dishId == null) return;
    showAlert('この料理を削除しますか？', draft.name, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除する',
        style: 'destructive',
        onPress: async () => {
          const dishId = draft.dishId;
          if (dishId == null) return;
          await deleteDish(dishId);
          draft.clear();
          router.back();
        },
      },
    ]);
  }

  return (
    <Screen>
      <Card>
        <Field label="料理名">
          <TextField
            value={draft.name}
            onChangeText={(value) => draft.patch({ name: value })}
            placeholder="例: 鶏むねのねぎ塩炒め"
          />
        </Field>

        <Field label="献立での枠">
          <SegmentedControl<DishCategory>
            options={CATEGORIES.map((value) => ({ value, label: DISH_CATEGORY_LABELS[value] }))}
            value={draft.category}
            onChange={(value) => draft.patch({ category: value })}
          />
        </Field>

        <View style={styles.row}>
          <View style={styles.col}>
            <Field
              label="何人前ぶんの分量か"
              hint={
                servingsValid ? '材料の合計がこの人数分になります' : '1以上の数値を入力してください'
              }
            >
              <NumberInput
                value={draft.servings}
                onChangeText={(value) => draft.patch({ servings: value })}
                unit="人前"
              />
            </Field>
          </View>
          <View style={styles.col}>
            <Field label="調理時間（任意）">
              <NumberInput
                value={draft.cookMinutes}
                onChangeText={(value) => draft.patch({ cookMinutes: value })}
                unit="分"
                placeholder="15"
              />
            </Field>
          </View>
        </View>
      </Card>

      {/* 気分の4軸。献立作成の絞り込みに使う */}
      <Card>
        <CardTitle>気分タグ</CardTitle>
        <Text style={styles.hint}>
          献立を作るときの絞り込みに使います。もう一度押すと解除できます。
        </Text>

        <Field label="ジャンル">
          <ChipGroup>
            {CUISINES.map((value) => (
              <Chip
                key={value}
                label={CUISINE_LABELS[value]}
                selected={draft.cuisine === value}
                onPress={() => draft.patch({ cuisine: draft.cuisine === value ? null : value })}
              />
            ))}
          </ChipGroup>
        </Field>

        <Field label="手間">
          <ChipGroup>
            {EFFORTS.map((value) => (
              <Chip
                key={value}
                label={EFFORT_LABELS[value]}
                selected={draft.effort === value}
                onPress={() => draft.patch({ effort: draft.effort === value ? null : value })}
              />
            ))}
          </ChipGroup>
        </Field>

        <Field label="ボリューム">
          <ChipGroup>
            {VOLUMES.map((value) => (
              <Chip
                key={value}
                label={VOLUME_LABELS[value]}
                selected={draft.volume === value}
                onPress={() => draft.patch({ volume: draft.volume === value ? null : value })}
              />
            ))}
          </ChipGroup>
        </Field>

        <Field label="味の方向" hint="複数選べます">
          <ChipGroup>
            {TASTES.map((value) => (
              <Chip
                key={value}
                label={TASTE_LABELS[value]}
                selected={draft.tastes.includes(value)}
                onPress={() => draft.toggleTaste(value)}
              />
            ))}
          </ChipGroup>
        </Field>
      </Card>

      {/* 材料 */}
      <Card>
        <CardTitle>材料</CardTitle>
        {draft.ingredients.length === 0 ? (
          <Text style={styles.empty}>材料を追加してください</Text>
        ) : (
          draft.ingredients.map((ingredient, index) => (
            <View key={ingredient.key}>
              {index > 0 && <Divider />}
              <View style={styles.ingredient}>
                <View style={styles.flex}>
                  <Text style={styles.ingredientName} numberOfLines={2}>
                    {ingredient.foodName}
                  </Text>
                  <View style={styles.seasoningRow}>
                    <Text style={styles.seasoningLabel}>調味料として扱う</Text>
                    <Switch
                      value={ingredient.isSeasoning}
                      onValueChange={(value) =>
                        draft.updateIngredient(ingredient.key, { isSeasoning: value })
                      }
                      trackColor={{ true: colors.primary }}
                    />
                  </View>
                </View>
                <View style={styles.gramsBox}>
                  <NumberInput
                    value={ingredient.grams}
                    onChangeText={(text) => draft.updateIngredient(ingredient.key, { grams: text })}
                    unit="g"
                  />
                </View>
                <Pressable
                  onPress={() => draft.removeIngredient(ingredient.key)}
                  hitSlop={8}
                  style={styles.remove}
                >
                  <Ionicons name="close-circle" size={20} color={colors.textFaint} />
                </Pressable>
              </View>
            </View>
          ))
        )}

        <Divider />
        <Pressable onPress={() => router.push('/library/food-search')} style={styles.addRow}>
          <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
          <Text style={styles.addText}>材料を追加</Text>
        </Pressable>
        <Text style={styles.hint}>
          調味料に設定した材料は、買い物リストで「調味料など」にまとめられます。
        </Text>
      </Card>

      {/* 栄養価 */}
      <Card>
        <CardTitle>1人前の栄養価</CardTitle>
        <View style={styles.nutritionRow}>
          <Text style={styles.kcal}>{Math.round(nutrition.nutrients.kcal)}</Text>
          <Text style={styles.kcalUnit}>kcal</Text>
          <Text style={styles.grams}>／ {formatGrams(nutrition.grams)}</Text>
        </View>
        <View style={styles.macroRow}>
          <Text style={[styles.macro, { color: colors.protein }]}>
            P {nutrition.nutrients.protein_g.toFixed(1)}g
          </Text>
          <Text style={[styles.macro, { color: colors.fat }]}>
            F {nutrition.nutrients.fat_g.toFixed(1)}g
          </Text>
          <Text style={[styles.macro, { color: colors.carb }]}>
            C {nutrition.nutrients.carb_g.toFixed(1)}g
          </Text>
        </View>
      </Card>

      <Card>
        <CardTitle>作り方のメモ（任意）</CardTitle>
        <TextField
          value={draft.steps}
          onChangeText={(value) => draft.patch({ steps: value })}
          placeholder="手順や火加減など"
          multiline
          style={styles.steps}
        />
      </Card>

      <Button
        title={saving ? '保存中…' : draft.dishId != null ? '更新する' : '保存する'}
        onPress={() => void handleSave()}
        disabled={saving || !canSave}
      />
      {!canSave && draft.ingredients.length > 0 && !hasGrams && (
        <Text style={styles.hint}>材料のグラム数を入力してください。</Text>
      )}
      {draft.dishId != null && (
        <Button title="この料理を削除" variant="ghost" onPress={handleDelete} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: spacing.md },
  col: { flex: 1 },
  hint: { fontSize: fontSize.xs, color: colors.textFaint, lineHeight: 18 },
  empty: {
    fontSize: fontSize.sm,
    color: colors.textFaint,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  ingredient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  ingredientName: { fontSize: fontSize.sm, color: colors.text },
  seasoningRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  seasoningLabel: { fontSize: fontSize.xs, color: colors.textFaint },
  gramsBox: { width: 100 },
  remove: { padding: 2 },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  addText: { fontSize: fontSize.md, color: colors.primary, fontWeight: '600' },
  nutritionRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  kcal: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.text },
  kcalUnit: { fontSize: fontSize.md, color: colors.textSub },
  grams: { fontSize: fontSize.sm, color: colors.textFaint, marginLeft: spacing.sm },
  macroRow: { flexDirection: 'row', gap: spacing.lg },
  macro: { fontSize: fontSize.sm, fontWeight: '600' },
  steps: { minHeight: 70, textAlignVertical: 'top', borderRadius: radius.md },
});
