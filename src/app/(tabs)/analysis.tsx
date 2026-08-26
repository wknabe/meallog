import { Screen, EmptyState } from '@/components/ui/layout';
import { ScreenHeader } from '@/components/ui/header';

/** 分析タブ。フェーズ4で実装する */
export default function AnalysisScreen() {
  return (
    <Screen>
      <ScreenHeader title="分析" />
      <EmptyState title="準備中" description="カロリー・PFC・体重のグラフをここに表示します。" />
    </Screen>
  );
}
