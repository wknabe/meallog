import { Stack } from 'expo-router';

import { stackScreenOptions } from '@/components/ui/stack-screen-options';

export default function LibraryLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ title: '食材・商品・料理' }} />
      <Stack.Screen name="products" options={{ title: 'マイ食品' }} />
      <Stack.Screen name="product-edit" options={{ title: '成分表を登録' }} />
      <Stack.Screen name="dishes" options={{ title: '料理' }} />
      <Stack.Screen name="dish-edit" options={{ title: '料理を編集' }} />
      <Stack.Screen name="food-search" options={{ title: '材料を選ぶ' }} />
    </Stack>
  );
}
