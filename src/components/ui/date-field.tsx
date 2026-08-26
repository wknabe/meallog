/** 日付を選ぶ入力欄。タップするとOS標準の日付ピッカーが開く */
import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDayLabelWithYear, fromDayKey, toDayKey, type DayKey } from '@/lib/day';
import { colors, fontSize, radius, spacing } from '@/theme/colors';

export function DateField({
  value,
  onChange,
  placeholder = '選択してください',
  minimumDate,
  maximumDate,
}: {
  value: DayKey | null;
  onChange: (value: DayKey) => void;
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
}) {
  const [open, setOpen] = useState(false);

  return (
    <View>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.field, pressed && styles.pressed]}>
        <Text style={[styles.value, value == null && styles.placeholder]}>
          {value != null ? formatDayLabelWithYear(value) : placeholder}
        </Text>
      </Pressable>

      {open && (
        <DateTimePicker
          value={value != null ? fromDayKey(value) : (maximumDate ?? new Date())}
          mode="date"
          // Androidはダイアログ、iOSはインラインのカレンダーが自然な見た目になる
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onChange={(event, selected) => {
            // Androidは選択・キャンセルのどちらでもピッカーが閉じる
            if (Platform.OS === 'android') setOpen(false);
            if (event.type === 'set' && selected) onChange(toDayKey(selected));
          }}
        />
      )}

      {open && Platform.OS === 'ios' && (
        <Pressable onPress={() => setOpen(false)} style={styles.done}>
          <Text style={styles.doneText}>完了</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  pressed: { opacity: 0.7 },
  value: { fontSize: fontSize.lg, color: colors.text },
  placeholder: { color: colors.textFaint },
  done: { alignSelf: 'flex-end', padding: spacing.sm },
  doneText: { color: colors.primary, fontWeight: '700', fontSize: fontSize.md },
});
