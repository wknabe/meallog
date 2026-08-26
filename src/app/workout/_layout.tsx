import { Stack } from 'expo-router';

import { stackScreenOptions } from '@/components/ui/stack-screen-options';

export default function WorkoutLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="new" options={{ title: '運動を追加' }} />
    </Stack>
  );
}
