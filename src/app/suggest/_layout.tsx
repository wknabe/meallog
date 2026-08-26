import { Stack } from 'expo-router';

import { stackScreenOptions } from '@/components/ui/stack-screen-options';

export default function SuggestLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ title: '今日あと何を食べればいい？' }} />
    </Stack>
  );
}
