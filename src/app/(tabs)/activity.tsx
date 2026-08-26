import { Screen, EmptyState } from '@/components/ui/layout';
import { ScreenHeader } from '@/components/ui/header';

/** 運動タブ。フェーズ2で実装する */
export default function ActivityScreen() {
  return (
    <Screen>
      <ScreenHeader title="運動" />
      <EmptyState title="準備中" description="歩数・ランニング・筋トレの記録をここに表示します。" />
    </Screen>
  );
}
