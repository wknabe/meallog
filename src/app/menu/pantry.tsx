import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, NumberInput } from '@/components/ui/controls';
import { DateField } from '@/components/ui/date-field';
import { Card, CardTitle, Divider, EmptyState, Screen } from '@/components/ui/layout';
import { FOOD_GROUPS } from '@/db/repo/foods';
import { listPantry, removePantryItem, updatePantryItem, type PantryItem } from '@/db/repo/pantry';
import { useTodayKey } from '@/hooks/use-today';
import { differenceInDays, formatDayLabel } from '@/lib/day';
import { useAppStore } from '@/store/app';
import { colors, fontSize, spacing } from '@/theme/colors';

export default function PantryScreen() {
  const router = useRouter();
  const settings = useAppStore((s) => s.settings);
  const todayKey = useTodayKey(settings.dayStartHour);

  const [items, setItems] = useState<PantryItem[]>([]);
  /** 編集中のグラム数。入力途中の文字列をそのまま持つ */
  const [gramsText, setGramsText] = useState<Record<number, string>>({});

  const reload = useCallback(async () => {
    const loaded = await listPantry();
    setItems(loaded);
    setGramsText(Object.fromEntries(loaded.map((item) => [item.id, String(item.grams)])));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  async function commitGrams(item: PantryItem) {
    const value = Number(gramsText[item.id]);
    if (!Number.isFinite(value)) {
      setGramsText((previous) => ({ ...previous, [item.id]: String(item.grams) }));
      return;
    }
    await updatePantryItem(item.id, { grams: value, expiresOn: item.expiresOn });
    await reload();
  }

  function confirmRemove(item: PantryItem) {
    Alert.alert('この食材を削除しますか？', item.foodName, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除する',
        style: 'destructive',
        onPress: async () => {
          await removePantryItem(item.id);
          await reload();
        },
      },
    ]);
  }

  /** 期限までの残り日数から表示する文言を決める */
  function expiryLabel(item: PantryItem): { text: string; warning: boolean } | null {
    if (item.expiresOn == null) return null;
    const days = differenceInDays(item.expiresOn, todayKey);
    if (days < 0) return { text: '期限切れ', warning: true };
    if (days === 0) return { text: '今日まで', warning: true };
    if (days <= 3) return { text: `あと${days}日`, warning: true };
    return { text: formatDayLabel(item.expiresOn), warning: false };
  }

  return (
    <Screen>
      <Button title="食材を追加" onPress={() => router.push('/menu/pantry-add')} />

      {items.length === 0 ? (
        <EmptyState
          title="登録された食材がありません"
          description="持っている食材を登録すると、それを使う献立を優先して提案します。"
        />
      ) : (
        <>
          <Card>
            <CardTitle right={<Text style={styles.count}>{items.length}品</Text>}>
              冷蔵庫の食材
            </CardTitle>

            {items.map((item, index) => {
              const expiry = expiryLabel(item);
              return (
                <View key={item.id}>
                  {index > 0 && <Divider />}
                  <View style={styles.item}>
                    <View style={styles.flex}>
                      <Text style={styles.name} numberOfLines={2}>
                        {item.foodName}
                      </Text>
                      <View style={styles.meta}>
                        <Text style={styles.group}>
                          {item.groupCode ? (FOOD_GROUPS[item.groupCode] ?? '') : ''}
                        </Text>
                        {expiry != null && (
                          <Text style={[styles.expiry, expiry.warning && styles.expiryWarning]}>
                            {expiry.text}
                          </Text>
                        )}
                      </View>
                      <View style={styles.expiryField}>
                        <DateField
                          value={item.expiresOn}
                          onChange={async (value) => {
                            await updatePantryItem(item.id, { grams: item.grams, expiresOn: value });
                            await reload();
                          }}
                          placeholder="賞味期限を設定"
                        />
                      </View>
                    </View>

                    <View style={styles.gramsBox}>
                      <NumberInput
                        value={gramsText[item.id] ?? String(item.grams)}
                        onChangeText={(text) =>
                          setGramsText((previous) => ({ ...previous, [item.id]: text }))
                        }
                        onEndEditing={() => void commitGrams(item)}
                        unit="g"
                      />
                    </View>

                    <Pressable onPress={() => confirmRemove(item)} hitSlop={8} style={styles.remove}>
                      <Ionicons name="close-circle" size={20} color={colors.textFaint} />
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </Card>

          <Button
            title="この食材で献立を作る"
            onPress={() =>
              router.push({ pathname: '/menu/generate', params: { usePantry: '1' } })
            }
          />
          <Text style={styles.note}>
            在庫は自動では減りません。献立に「作った」を付けたときと、この画面での編集で減ります。
          </Text>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  count: { fontSize: fontSize.xs, color: colors.textFaint },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.sm },
  name: { fontSize: fontSize.md, color: colors.text },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  group: { fontSize: fontSize.xs, color: colors.textFaint },
  expiry: { fontSize: fontSize.xs, color: colors.textFaint },
  expiryWarning: { color: colors.danger, fontWeight: '700' },
  expiryField: { marginTop: spacing.xs },
  gramsBox: { width: 96 },
  remove: { padding: 2, marginTop: spacing.sm },
  note: { fontSize: fontSize.xs, color: colors.textFaint, lineHeight: 18 },
});
