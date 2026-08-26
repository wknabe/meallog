import { Screen, EmptyState } from '@/components/ui/layout';
import { ScreenHeader } from '@/components/ui/header';

/** 献立タブ。フェーズ5で実装する */
export default function PlanScreen() {
  return (
    <Screen>
      <ScreenHeader title="献立" />
      <EmptyState title="準備中" description="気分と栄養履歴からの献立作成をここに表示します。" />
    </Screen>
  );
}
