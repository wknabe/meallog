/** 画面の骨格になる部品（画面枠・カード・見出し・進捗バー） */
import type { ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { cardShadow, colors, fontSize, radius, spacing } from '@/theme/colors';

type ScreenProps = {
  children: ReactNode;
  /** 縦スクロールさせるか。フラットリストを置く画面では false にする */
  scroll?: boolean;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

export function Screen({
  children,
  scroll = true,
  edges = ['top'],
  style,
  contentStyle,
}: ScreenProps) {
  return (
    <SafeAreaView style={[styles.screen, style]} edges={edges}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, contentStyle]}
          keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function CardTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.cardTitleRow}>
      <Text style={styles.cardTitle}>{children}</Text>
      {right}
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

/** ラベルと値を左右に並べる行 */
export function Row({
  label,
  value,
  sub,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sub != null && <Text style={styles.rowSub}>{sub}</Text>}
      </View>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

/** 進捗バー。ホーム画面の摂取カロリーやPFCで使う */
export function ProgressBar({
  value,
  max,
  color = colors.primary,
  height = 8,
}: {
  value: number;
  max: number;
  color?: string;
  height?: number;
}) {
  const ratio = max > 0 ? Math.min(value / max, 1) : 0;
  // 目標を超えた分は色を変えて気づけるようにする
  const over = max > 0 && value > max;
  return (
    <View style={[styles.progressTrack, { height, borderRadius: height / 2 }]}>
      <View
        style={{
          width: `${ratio * 100}%`,
          height: '100%',
          borderRadius: height / 2,
          backgroundColor: over ? colors.danger : color,
        }}
      />
    </View>
  );
}

/** 内容が空のときの案内表示 */
export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {description != null && <Text style={styles.emptyDescription}>{description}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xxl * 2, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...cardShadow,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textSub,
    marginTop: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: 32,
  },
  rowLabel: { fontSize: fontSize.md, color: colors.text },
  rowSub: { fontSize: fontSize.xs, color: colors.textFaint, marginTop: 2 },
  rowValue: { fontSize: fontSize.md, color: colors.textSub, fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  progressTrack: {
    width: '100%',
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  empty: { alignItems: 'center', padding: spacing.xl, gap: spacing.xs },
  emptyTitle: { fontSize: fontSize.md, color: colors.textSub, fontWeight: '600' },
  emptyDescription: { fontSize: fontSize.sm, color: colors.textFaint, textAlign: 'center' },
});
