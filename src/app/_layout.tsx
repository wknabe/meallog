import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { stackScreenOptions } from '@/components/ui/stack-screen-options';
import { useAppStore } from '@/store/app';
import { colors, fontSize, radius, spacing } from '@/theme/colors';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const ready = useAppStore((s) => s.ready);
  const bootError = useAppStore((s) => s.bootError);
  const bootstrap = useAppStore((s) => s.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    // 失敗したときもスプラッシュを閉じないと、案内が見えないまま固まる
    if (ready || bootError != null) SplashScreen.hideAsync();
  }, [ready, bootError]);

  if (bootError != null) {
    return (
      <SafeAreaProvider>
        <View style={styles.errorScreen}>
          <Text style={styles.errorTitle}>起動できませんでした</Text>
          <Text style={styles.errorBody}>{bootError}</Text>
          <Pressable onPress={() => void bootstrap()} style={styles.retry}>
            <Text style={styles.retryText}>もう一度試す</Text>
          </Pressable>
        </View>
      </SafeAreaProvider>
    );
  }

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

const styles = StyleSheet.create({
  errorScreen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  errorTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  errorBody: { fontSize: fontSize.sm, color: colors.textSub, textAlign: 'center', lineHeight: 20 },
  retry: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.xl,
  },
  retryText: { color: colors.textOnPrimary, fontWeight: '700', fontSize: fontSize.md },
});
