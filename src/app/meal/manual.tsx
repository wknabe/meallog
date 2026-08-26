import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Field, NumberInput, TextField } from '@/components/ui/controls';
import { Card, CardTitle, Screen } from '@/components/ui/layout';
import { emptyNutrients } from '@/db/nutrients';
import { kcalFromMacros } from '@/lib/nutrition';
import { useMealDraftStore } from '@/store/meal-draft';
import { colors, fontSize, spacing } from '@/theme/colors';

/**
 * 検索で見つからないものを、栄養成分表示を見ながら直接入力する画面。
 * 食品マスタには登録せず、この食事の1行としてだけ記録する。
 */
export default function ManualEntryScreen() {
  const router = useRouter();
  const addItems = useMealDraftStore((s) => s.addItems);

  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [fat, setFat] = useState('');
  const [carb, setCarb] = useState('');
  const [fiber, setFiber] = useState('');
  const [grams, setGrams] = useState('');
  // 連打で同じ内容が2件追加されるのを防ぐ
  const [added, setAdded] = useState(false);

  const proteinValue = Number(protein) || 0;
  const fatValue = Number(fat) || 0;
  const carbValue = Number(carb) || 0;
  const estimated = kcalFromMacros(proteinValue, fatValue, carbValue);
  const kcalValue = kcal.trim() === '' ? estimated : Number(kcal) || 0;

  const canSave = name.trim() !== '' && kcalValue > 0;

  function handleAdd() {
    if (!canSave || added) return;
    setAdded(true);
    const nutrients = emptyNutrients();
    nutrients.kcal = kcalValue;
    nutrients.protein_g = proteinValue;
    nutrients.fat_g = fatValue;
    nutrients.carb_g = carbValue;
    nutrients.fiber_g = Number(fiber) || 0;

    addItems([
      {
        refType: 'food',
        // 食品マスタに存在しない手入力の行は refId 0 で表す
        refId: 0,
        name: name.trim(),
        quantity: Number(grams) || 0,
        unitLabel: null,
        grams: Number(grams) || 0,
        nutrients,
      },
    ]);
    router.dismissTo('/meal/edit');
  }

  return (
    <Screen>
      <Card>
        <CardTitle>食べたもの</CardTitle>
        <Field label="名前">
          <TextField value={name} onChangeText={setName} placeholder="例: コンビニのサラダチキン" />
        </Field>
        <Field label="重さ（任意）" hint="買い物リストや在庫の計算に使います">
          <NumberInput value={grams} onChangeText={setGrams} unit="g" placeholder="未入力でも記録できます" />
        </Field>
      </Card>

      <Card>
        <CardTitle>栄養成分</CardTitle>
        <Field
          label="エネルギー"
          hint={
            kcal.trim() === ''
              ? `未入力ならPFCから計算します（現在 ${Math.round(estimated)} kcal）`
              : undefined
          }>
          <NumberInput value={kcal} onChangeText={setKcal} unit="kcal" placeholder={String(Math.round(estimated))} />
        </Field>

        <View style={styles.macroRow}>
          <View style={styles.macroItem}>
            <Field label="たんぱく質">
              <NumberInput value={protein} onChangeText={setProtein} unit="g" placeholder="0" />
            </Field>
          </View>
          <View style={styles.macroItem}>
            <Field label="脂質">
              <NumberInput value={fat} onChangeText={setFat} unit="g" placeholder="0" />
            </Field>
          </View>
          <View style={styles.macroItem}>
            <Field label="炭水化物">
              <NumberInput value={carb} onChangeText={setCarb} unit="g" placeholder="0" />
            </Field>
          </View>
        </View>

        <Field label="食物繊維（任意）">
          <NumberInput value={fiber} onChangeText={setFiber} unit="g" placeholder="0" />
        </Field>
      </Card>

      <Text style={styles.note}>
        商品として繰り返し使う場合は、成分表を撮影して「マイ食品」に登録すると次から検索できます。
      </Text>

      <Button title="食事に追加" onPress={handleAdd} disabled={!canSave || added} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  macroRow: { flexDirection: 'row', gap: spacing.sm },
  macroItem: { flex: 1 },
  note: { fontSize: fontSize.xs, color: colors.textFaint, lineHeight: 18 },
});
