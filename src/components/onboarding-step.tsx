/** オンボーディング各ステップの共通枠（進捗表示・見出し・下部のボタン） */
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/controls';
import { colors, fontSize, radius, spacing } from '@/theme/colors';

const TOTAL_STEPS = 4;

export function OnboardingStep({
  step,
  title,
  description,
  children,
  nextLabel = '次へ',
  onNext,
  nextDisabled,
  onBack,
}: {
  step: number;
  title: string;
  description?: string;
  children: ReactNode;
  nextLabel?: string;
  onNext: () => void;
  nextDisabled?: boolean;
  onBack?: () => void;
}) {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <View style={styles.progressRow}>
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <View
                key={i}
                style={[styles.progressSegment, i < step && styles.progressSegmentDone]}
              />
            ))}
          </View>
          <Text style={styles.stepLabel}>
            ステップ {step} / {TOTAL_STEPS}
          </Text>
          <Text style={styles.title}>{title}</Text>
          {description != null && <Text style={styles.description}>{description}</Text>}
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>

        <View style={styles.footer}>
          <Button title={nextLabel} onPress={onNext} disabled={nextDisabled} />
          {onBack != null && <Button title="戻る" variant="ghost" onPress={onBack} />}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.xs },
  progressRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  progressSegmentDone: { backgroundColor: colors.primary },
  stepLabel: { fontSize: fontSize.xs, color: colors.textFaint, fontWeight: '700' },
  title: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  description: { fontSize: fontSize.sm, color: colors.textSub, lineHeight: 20 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    paddingTop: spacing.sm,
    gap: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
