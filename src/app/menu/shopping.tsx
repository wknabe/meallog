import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/controls';
import { Card, CardTitle, Divider, EmptyState, Screen } from '@/components/ui/layout';
import {
  buildShoppingList,
  getShoppingList,
  moveCheckedToPantry,
  toggleShoppingItem,
  type ShoppingItem,
  type ShoppingList,
} from '@/db/repo/shopping';
import { useTodayKey } from '@/hooks/use-today';
import { addDays, formatDayLabel } from '@/lib/day';
import { useAppStore } from '@/store/app';
import { colors, fontSize, radius, spacing } from '@/theme/colors';

export default function ShoppingScreen() {
  const params = useLocalSearchParams<{ from?: string; to?: string }>();
  const settings = useAppStore((s) => s.settings);
  const todayKey = useTodayKey(settings.dayStartHour);

  const from = params.from ?? todayKey;
  const to = params.to ?? addDays(todayKey, 6);

  const [list, setList] = useState<ShoppingList | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setList(await getShoppingList(from, to));
  }, [from, to]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  async function rebuild() {
    if (busy) return;
    setBusy(true);
    try {
      await buildShoppingList(from, to);
      await reload();
    } catch (error) {
      console.error('買い物リストの作成に失敗しました', error);
      Alert.alert('作成できませんでした', 'もう一度お試しください。');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(item: ShoppingItem) {
    await toggleShoppingItem(item.id, !item.checked);
    await reload();
  }

  async function moveToPantry() {
    if (!list || busy) return;
    setBusy(true);
    try {
      const moved = await moveCheckedToPantry(list.id);
      Alert.alert(
        moved > 0 ? `${moved}品を冷蔵庫に追加しました` : '追加する食材がありません',
        moved > 0 ? 'チェックした食材を在庫に反映しました。' : 'チェックを付けてから実行してください。'
      );
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function shareList() {
    if (!list) return;
    const lines = list.items.map(
      (item) => `${item.checked ? '☑' : '☐'} ${item.name}${item.label ? ` ${item.label}` : ''}`
    );
    await Share.share({
      message: `買い物リスト（${formatDayLabel(from)}〜${formatDayLabel(to)}）\n\n${lines.join('\n')}`,
    });
  }

  // 売り場ごとにまとめる
  const grouped = new Map<string, ShoppingItem[]>();
  for (const item of list?.items ?? []) {
    const key = item.categoryLabel;
    const group = grouped.get(key) ?? [];
    group.push(item);
    grouped.set(key, group);
  }

  return (
    <Screen>
      <Card>
        <CardTitle>
          {formatDayLabel(from)} 〜 {formatDayLabel(to)}
        </CardTitle>
        <Text style={styles.note}>
          献立の材料を集計し、冷蔵庫にあるぶんを差し引いています。「作った」を付けた献立は除きます。
        </Text>
        <Button
          title={busy ? '集計中…' : list == null ? '買い物リストを作る' : '集計し直す'}
          onPress={rebuild}
          disabled={busy}
        />
      </Card>

      {list == null ? (
        <EmptyState
          title="買い物リストがありません"
          description="献立を作ってから集計すると、必要な食材が並びます。"
        />
      ) : list.items.length === 0 ? (
        <EmptyState
          title="買い足すものはありません"
          description="冷蔵庫の在庫で足りています。"
        />
      ) : (
        <>
          {[...grouped.entries()].map(([category, items]) => (
            <Card key={category}>
              <CardTitle>{category}</CardTitle>
              {items.map((item, index) => (
                <View key={item.id}>
                  {index > 0 && <Divider />}
                  <Pressable onPress={() => void toggle(item)} style={styles.item}>
                    <View style={[styles.checkbox, item.checked && styles.checkboxChecked]}>
                      {item.checked && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </View>
                    <View style={styles.flex}>
                      <Text style={[styles.name, item.checked && styles.nameChecked]}>
                        {item.name}
                      </Text>
                    </View>
                    {item.label !== '' && <Text style={styles.amount}>{item.label}</Text>}
                  </Pressable>
                </View>
              ))}
            </Card>
          ))}

          <Button title="チェックした食材を冷蔵庫へ" variant="secondary" onPress={moveToPantry} />
          <Button title="リストを共有" variant="ghost" onPress={shareList} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  note: { fontSize: fontSize.sm, color: colors.textSub, lineHeight: 20 },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  name: { fontSize: fontSize.md, color: colors.text },
  nameChecked: { color: colors.textFaint, textDecorationLine: 'line-through' },
  amount: { fontSize: fontSize.sm, color: colors.textSub, fontWeight: '600' },
});
