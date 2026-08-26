import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/ui/header';
import { Card, CardTitle, Divider, Row, Screen } from '@/components/ui/layout';
import { listPantry } from '@/db/repo/pantry';
import { listPlanForDate, planTotals, type PlanEntryRecord } from '@/db/repo/meal-plans';
import { useTodayKey } from '@/hooks/use-today';
import { formatDayLabel } from '@/lib/day';
import { MEAL_SLOT_LABELS, MEAL_SLOT_ORDER, type MealSlot } from '@/lib/types';
import { useAppStore } from '@/store/app';
import { colors, fontSize, radius, spacing } from '@/theme/colors';

export default function PlanScreen() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const settings = useAppStore((s) => s.settings);
  const todayKey = useTodayKey(settings.dayStartHour);

  const [entries, setEntries] = useState<PlanEntryRecord[]>([]);
  const [pantryCount, setPantryCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([listPlanForDate(todayKey), listPantry()])
        .then(([plan, pantry]) => {
          if (cancelled) return;
          setEntries(plan);
          setPantryCount(pantry.length);
        })
        .catch((error) => console.error('献立の読み込みに失敗しました', error));
      return () => {
        cancelled = true;
      };
    }, [todayKey])
  );

  if (!profile) return null;

  const totals = planTotals(entries);
  const bySlot = new Map<MealSlot, PlanEntryRecord[]>();
  for (const entry of entries) {
    const list = bySlot.get(entry.slot) ?? [];
    list.push(entry);
    bySlot.set(entry.slot, list);
  }

  return (
    <Screen>
      <ScreenHeader title="献立" subtitle={formatDayLabel(todayKey)} />

      {entries.length > 0 ? (
        <Card>
          <CardTitle
            right={
              <Text style={styles.total}>{Math.round(totals.kcal).toLocaleString()} kcal</Text>
            }>
            今日の献立
          </CardTitle>

          {MEAL_SLOT_ORDER.filter((slot) => (bySlot.get(slot) ?? []).length > 0).map(
            (slot, index) => (
              <View key={slot}>
                {index > 0 && <Divider />}
                <Text style={styles.slotLabel}>{MEAL_SLOT_LABELS[slot]}</Text>
                {(bySlot.get(slot) ?? []).map((entry) => (
                  <Row
                    key={entry.id}
                    label={entry.dish?.name ?? '（削除された料理）'}
                    sub={entry.servings !== 1 ? `${entry.servings}人前` : undefined}
                    value={entry.cooked ? '作った' : ''}
                  />
                ))}
              </View>
            )
          )}

          <Pressable onPress={() => router.push('/menu/today')} style={styles.link}>
            <Text style={styles.linkText}>献立を見る・作った記録をつける</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.primary} />
          </Pressable>
        </Card>
      ) : (
        <Card>
          <CardTitle>今日の献立はまだありません</CardTitle>
          <Text style={styles.note}>
            気分と直近の栄養バランスから、今日の献立を組み立てます。
          </Text>
        </Card>
      )}

      <MenuItem
        icon="sparkles"
        color="#2E9E63"
        title="献立を作る"
        description="気分と、直近で足りていない栄養から組み立てます"
        onPress={() => router.push('/menu/generate')}
      />
      <MenuItem
        icon="snow"
        color="#3A82D6"
        title="冷蔵庫の食材"
        description={`登録中 ${pantryCount}品。ある食材を優先した献立を作れます`}
        onPress={() => router.push('/menu/pantry')}
      />
      <MenuItem
        icon="calendar"
        color="#8B5CF6"
        title="1週間の献立"
        description="7日分をまとめて作成します"
        onPress={() => router.push('/menu/week')}
      />
      <MenuItem
        icon="cart"
        color="#E8912D"
        title="買い物リスト"
        description="献立から必要な食材を集計します"
        onPress={() => router.push('/menu/shopping')}
      />
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
        <Text style={styles.itemTitle}>{title}</Text>
        <Text style={styles.itemDescription}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  total: { fontSize: fontSize.sm, color: colors.textSub, fontWeight: '600' },
  slotLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.primaryDark, marginTop: 4 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: spacing.xs },
  linkText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600' },
  note: { fontSize: fontSize.sm, color: colors.textSub, lineHeight: 20 },
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
  itemTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  itemDescription: { fontSize: fontSize.xs, color: colors.textFaint, marginTop: 2 },
});
