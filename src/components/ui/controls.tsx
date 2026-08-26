/** 入力・選択の部品（ボタン・セグメント・選択リスト・数値入力・タグ） */
import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { colors, fontSize, radius, spacing } from '@/theme/colors';

// ── ボタン ──────────────────────────────────────
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const isFilled = variant === 'primary' || variant === 'danger';
  const background =
    variant === 'primary'
      ? colors.primary
      : variant === 'danger'
        ? colors.danger
        : variant === 'secondary'
          ? colors.primaryLight
          : 'transparent';
  const textColor =
    variant === 'primary' || variant === 'danger' ? colors.textOnPrimary : colors.primary;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background },
        !isFilled && variant === 'ghost' && styles.buttonGhost,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}>
      <Text style={[styles.buttonText, { color: textColor }]}>{title}</Text>
    </Pressable>
  );
}

// ── セグメント（横並びの切り替えタブ）──────────────
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  style,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.segment, style]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => onChange(option.value)}
            style={[styles.segmentItem, selected && styles.segmentItemSelected]}>
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── 選択リスト（縦並び。説明文を添えられる）────────
export function OptionList<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; description?: string }[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.optionList}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => onChange(option.value)}
            style={[styles.option, selected && styles.optionSelected]}>
            <View style={styles.flex}>
              <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                {option.label}
              </Text>
              {option.description != null && (
                <Text style={styles.optionDescription}>{option.description}</Text>
              )}
            </View>
            <View style={[styles.radio, selected && styles.radioSelected]}>
              {selected && <View style={styles.radioDot} />}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── タグ（気分の選択などで使う。未選択を許容する）────
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function ChipGroup({ children }: { children: ReactNode }) {
  return <View style={styles.chipGroup}>{children}</View>;
}

// ── ラベル付き入力欄 ───────────────────────────
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {hint != null && <Text style={styles.fieldHint}>{hint}</Text>}
    </View>
  );
}

/** 数値入力欄。右端に単位を表示できる */
export function NumberInput({
  value,
  onChangeText,
  unit,
  placeholder,
  ...rest
}: TextInputProps & { unit?: string }) {
  return (
    <View style={styles.inputWrap}>
      <TextInput
        {...rest}
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        style={styles.input}
      />
      {unit != null && <Text style={styles.inputUnit}>{unit}</Text>}
    </View>
  );
}

export function TextField(props: TextInputProps) {
  return (
    <View style={styles.inputWrap}>
      <TextInput
        {...props}
        placeholderTextColor={colors.textFaint}
        style={[styles.input, props.style]}
      />
    </View>
  );
}

/** 押せる行。設定画面などで使う */
export function PressableRow({
  label,
  value,
  onPress,
  destructive,
}: {
  label: string;
  value?: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.pressableRow, pressed && styles.pressed]}>
      <Text style={[styles.pressableLabel, destructive && { color: colors.danger }]}>{label}</Text>
      <View style={styles.pressableRight}>
        {value != null && <Text style={styles.pressableValue}>{value}</Text>}
        <Text style={styles.chevron}>›</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },

  button: {
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonGhost: { paddingVertical: spacing.sm },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { fontSize: fontSize.md, fontWeight: '700' },

  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: 3,
    gap: 3,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  segmentItemSelected: { backgroundColor: colors.primary },
  segmentText: { fontSize: fontSize.sm, color: colors.textSub, fontWeight: '600' },
  segmentTextSelected: { color: colors.textOnPrimary },

  optionList: { gap: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  optionLabel: { fontSize: fontSize.md, color: colors.text, fontWeight: '600' },
  optionLabelSelected: { color: colors.primaryDark },
  optionDescription: { fontSize: fontSize.sm, color: colors.textSub, marginTop: 2, lineHeight: 18 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },

  chipGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  chipText: { fontSize: fontSize.sm, color: colors.textSub, fontWeight: '600' },
  chipTextSelected: { color: colors.textOnPrimary },

  field: { gap: spacing.xs },
  fieldLabel: { fontSize: fontSize.sm, color: colors.textSub, fontWeight: '600' },
  fieldHint: { fontSize: fontSize.xs, color: colors.textFaint, lineHeight: 16 },

  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: fontSize.lg,
    color: colors.text,
  },
  inputUnit: { fontSize: fontSize.sm, color: colors.textSub, marginLeft: spacing.sm },

  pressableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    gap: spacing.md,
  },
  pressableLabel: { fontSize: fontSize.md, color: colors.text },
  pressableRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  pressableValue: { fontSize: fontSize.sm, color: colors.textSub },
  chevron: { fontSize: fontSize.lg, color: colors.textFaint },
});
