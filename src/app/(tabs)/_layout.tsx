import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import type { ComponentProps } from 'react';

import { useAppStore } from '@/store/app';
import { colors, fontSize } from '@/theme/colors';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** モックアップの6タブ構成 */
const TABS: { name: string; title: string; icon: IoniconName; iconActive: IoniconName }[] = [
  { name: 'index', title: 'ホーム', icon: 'home-outline', iconActive: 'home' },
  { name: 'meals', title: '食事', icon: 'restaurant-outline', iconActive: 'restaurant' },
  { name: 'activity', title: '運動', icon: 'walk-outline', iconActive: 'walk' },
  { name: 'plan', title: '献立', icon: 'clipboard-outline', iconActive: 'clipboard' },
  { name: 'analysis', title: '分析', icon: 'bar-chart-outline', iconActive: 'bar-chart' },
  { name: 'settings', title: '設定', icon: 'settings-outline', iconActive: 'settings' },
];

export default function TabsLayout() {
  const profile = useAppStore((s) => s.profile);

  // プロフィールがないと目標値が決まらず、どの画面も成立しないためオンボーディングへ送る
  if (!profile) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: { fontSize: fontSize.xs, fontWeight: '600' },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? tab.iconActive : tab.icon}
                size={size ?? 24}
                color={color}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
