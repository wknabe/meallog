import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { stackScreenOptions } from '@/components/ui/stack-screen-options';
import { useAppStore } from '@/store/app';
import { colors } from '@/theme/colors';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const ready = useAppStore((s) => s.ready);
  const bootstrap = useAppStore((s) => s.bootstrap);

  useEffect(() => {
    bootstrap().catch((error) => {
      console.error('起動処理に失敗しました', error);
    });
  }, [bootstrap]);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // DBの読み込みが終わるまではスプラッシュを出したままにする
  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="meal" />
          <Stack.Screen name="workout" />
          <Stack.Screen name="library" />
          <Stack.Screen name="suggest" />
          <Stack.Screen
            name="weight"
            options={{ ...stackScreenOptions, title: '体重' }}
          />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
