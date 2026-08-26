/** サブ画面のStackで共通して使うヘッダーの見た目 */
import { colors, fontSize } from '@/theme/colors';

export const stackScreenOptions = {
  headerShown: true,
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.primary,
  headerTitleStyle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' as const },
  headerShadowVisible: false,
  headerBackTitle: '戻る',
  contentStyle: { backgroundColor: colors.background },
};
