/**
 * 「今日」を画面がフォーカスされるたびに取り直すフック。
 *
 * マウント時に一度だけ today() を評価すると、アプリを開いたまま日付をまたいだとき
 * 前日のまま固定され、記録が前日に入ってしまう。
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { today, type DayKey } from '@/lib/day';

export function useTodayKey(dayStartHour: number): DayKey {
  const [todayKey, setTodayKey] = useState(() => today(dayStartHour));

  useFocusEffect(
    useCallback(() => {
      const current = today(dayStartHour);
      setTodayKey((previous) => (previous === current ? previous : current));
    }, [dayStartHour])
  );

  return todayKey;
}

/**
 * 日付を選べる画面向け。
 * 表示中の日付が「前回の今日」のままなら、日付が変わったときに新しい今日へ送る。
 * ユーザーが自分で過去の日付を選んでいる場合はそのまま維持する。
 */
export function useSelectableDate(dayStartHour: number) {
  const [state, setState] = useState(() => {
    const initial = today(dayStartHour);
    return { date: initial, knownToday: initial };
  });

  useFocusEffect(
    useCallback(() => {
      setState((previous) => {
        const current = today(dayStartHour);
        if (current === previous.knownToday) return previous;
        return {
          date: previous.date === previous.knownToday ? current : previous.date,
          knownToday: current,
        };
      });
    }, [dayStartHour])
  );

  const setDate = useCallback((date: DayKey) => {
    setState((previous) => ({ ...previous, date }));
  }, []);

  return { date: state.date, todayKey: state.knownToday, setDate };
}
