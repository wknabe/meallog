import { Stack } from 'expo-router';

import { stackScreenOptions } from '@/components/ui/stack-screen-options';

export default function MenuLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="generate" options={{ title: '献立を作る' }} />
      <Stack.Screen name="today" options={{ title: '今日の献立' }} />
      <Stack.Screen name="pantry" options={{ title: '冷蔵庫の食材' }} />
      <Stack.Screen name="pantry-add" options={{ title: '食材を追加' }} />
      <Stack.Screen name="week" options={{ title: '1週間の献立' }} />
      <Stack.Screen name="shopping" options={{ title: '買い物リスト' }} />
    </Stack>
  );
}
