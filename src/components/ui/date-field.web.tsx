/**
 * 日付・時刻を選ぶ入力欄（Web版）。
 *
 * @react-native-community/datetimepicker はブラウザでは何も出ないので、
 * ブラウザ標準の日付入力に置き換える。
 * 見た目は端末の作法に合わせられないが、確実に選べるほうを優先する。
 */
import { StyleSheet, View } from 'react-native';

import { toDayKey, type DayKey } from '@/lib/day';
import { colors, fontSize, radius, spacing } from '@/theme/colors';

/** Date を <input type="date"> が受け取る 'YYYY-MM-DD' に直す */
function toInputDate(date: Date | undefined): string | undefined {
  return date ? toDayKey(date) : undefined;
}

export function DateField({
  value,
  onChange,
  minimumDate,
  maximumDate,
}: {
  value: DayKey | null;
  onChange: (value: DayKey) => void;
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  /** ネイティブ版でリール表示にするための指定。Webでは常に標準の入力になる */
  wheel?: boolean;
}) {
  return (
    <View style={styles.field}>
      <input
        type="date"
        value={value ?? ''}
        min={toInputDate(minimumDate)}
        max={toInputDate(maximumDate)}
        onChange={(event) => {
          const next = event.target.value;
          // 消したときは空文字が来る。日付なしにはできないので何もしない
          if (next !== '') onChange(next as DayKey);
        }}
        style={inputStyle}
      />
    </View>
  );
}

export function TimeField({
  value,
  onChange,
}: {
  /** ISO8601の日時。時刻部分だけを編集する */
  value: string;
  onChange: (value: string) => void;
}) {
  const current = new Date(value);
  const hours = String(current.getHours()).padStart(2, '0');
  const minutes = String(current.getMinutes()).padStart(2, '0');

  return (
    <View style={styles.field}>
      <input
        type="time"
        value={`${hours}:${minutes}`}
        onChange={(event) => {
          const [hour, minute] = event.target.value.split(':').map(Number);
          if (!Number.isFinite(hour) || !Number.isFinite(minute)) return;
          const next = new Date(current);
          next.setHours(hour, minute, 0, 0);
          onChange(next.toISOString());
        }}
        style={inputStyle}
      />
    </View>
  );
}

/** ネイティブ版の入力欄と見た目を揃える */
const inputStyle: React.CSSProperties = {
  width: '100%',
  border: 'none',
  outline: 'none',
  background: 'transparent',
  fontSize: fontSize.lg,
  color: colors.text,
  fontFamily: 'inherit',
};

const styles = StyleSheet.create({
  field: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
});
