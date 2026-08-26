import { Screen, EmptyState } from '@/components/ui/layout';
import { ScreenHeader } from '@/components/ui/header';

/** 食事タブ。フェーズ2で実装する */
export default function MealsScreen() {
  return (
    <Screen>
      <ScreenHeader title="食事" />
      <EmptyState title="準備中" description="食事の記録と履歴をここに表示します。" />
    </Screen>
  );
}
