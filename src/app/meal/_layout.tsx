import { Stack } from 'expo-router';

import { stackScreenOptions } from '@/components/ui/stack-screen-options';

export default function MealLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="new" options={{ title: '食事を記録' }} />
      <Stack.Screen name="edit" options={{ title: '食事の記録' }} />
      <Stack.Screen name="manual" options={{ title: '手入力で記録' }} />
      <Stack.Screen name="favorites" options={{ title: 'よく食べる食事' }} />
      <Stack.Screen name="food-search" options={{ title: '食材・商品を検索' }} />
      <Stack.Screen name="food-detail" options={{ title: '食品の詳細' }} />
    </Stack>
  );
}
