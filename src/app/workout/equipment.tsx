/** 筋トレの種目（器具）を選ぶ。部位ごとにまとめて出し、複数まとめて追加できる */
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Button, Chip, ChipGroup, TextField } from '@/components/ui/controls';
import { Card, CardTitle, Screen } from '@/components/ui/layout';
import { EQUIPMENT, MUSCLE_GROUP_LABELS, groupEquipment } from '@/lib/equipment';
import { useWorkoutDraft } from '@/store/workout-draft';
import { colors, fontSize } from '@/theme/colors';

export default function EquipmentPickerScreen() {
  const router = useRouter();
  const exercises = useWorkoutDraft((s) => s.exercises);
  const addEquipment = useWorkoutDraft((s) => s.addEquipment);
  const addCustom = useWorkoutDraft((s) => s.addCustom);

  const [keyword, setKeyword] = useState('');
  const [customName, setCustomName] = useState('');

  const selected = useMemo(
    () => new Set(exercises.map((item) => item.equipmentKey).filter((key) => key != null)),
    [exercises],
  );

  const matched = useMemo(() => {
    const text = keyword.trim();
    if (text === '') return null;
    return EQUIPMENT.filter((item) => item.name.includes(text));
  }, [keyword]);

  function handleAddCustom() {
    const name = customName.trim();
    if (name === '') return;
    addCustom(name);
    setCustomName('');
  }

  return (
    <Screen>
      <Card>
        <TextField
          value={keyword}
          onChangeText={setKeyword}
          placeholder="種目名で探す"
          autoCorrect={false}
        />
        <Text style={styles.lead}>
          選ぶとこの下に追加されます。同じ器具は一度だけ選べば、あとでセットを増やせます。
        </Text>
      </Card>

      {matched != null ? (
        <Card>
          <CardTitle>検索結果</CardTitle>
          {matched.length === 0 ? (
            <Text style={styles.empty}>見つかりませんでした。下から名前を直接追加できます。</Text>
          ) : (
            <ChipGroup>
              {matched.map((item) => (
                <Chip
                  key={item.key}
                  label={selected.has(item.key) ? `✓ ${item.name}` : item.name}
                  selected={selected.has(item.key)}
                  onPress={() => addEquipment(item.key)}
                />
              ))}
            </ChipGroup>
          )}
        </Card>
      ) : (
        groupEquipment().map(({ group, items }) => (
          <Card key={group}>
            <CardTitle>{MUSCLE_GROUP_LABELS[group]}</CardTitle>
            <ChipGroup>
              {items.map((item) => (
                <Chip
                  key={item.key}
                  label={selected.has(item.key) ? `✓ ${item.name}` : item.name}
                  selected={selected.has(item.key)}
                  onPress={() => addEquipment(item.key)}
                />
              ))}
            </ChipGroup>
          </Card>
        ))
      )}

      <Card>
        <CardTitle>一覧に無い種目</CardTitle>
        <TextField
          value={customName}
          onChangeText={setCustomName}
          placeholder="例: ケーブルクロスオーバー"
          onSubmitEditing={handleAddCustom}
        />
        <Button
          title="この名前で追加"
          variant="secondary"
          onPress={handleAddCustom}
          disabled={customName.trim() === ''}
        />
      </Card>

      <Button
        title={exercises.length > 0 ? `${exercises.length}種目を記録する` : '戻る'}
        onPress={() => router.back()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: { fontSize: fontSize.xs, color: colors.textFaint, lineHeight: 18 },
  empty: { fontSize: fontSize.sm, color: colors.textFaint },
});
