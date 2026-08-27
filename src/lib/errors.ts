/**
 * 画面から呼ぶ非同期処理の失敗を受け止めるための入れ物。
 *
 * onPress に async 関数をそのまま渡すと、失敗しても画面上は何も起きず、
 * 原因も残らないまま無反応に見えてしまう。自前で catch していない処理はこれを通す。
 *
 *   onPress={() => void attachPhoto('camera').catch(reportError('写真の取り込み'))}
 */
import { Alert } from 'react-native';

export function reportError(label: string): (error: unknown) => void {
  return (error) => {
    console.error(`${label}に失敗しました`, error);
    Alert.alert(`${label}に失敗しました`, 'もう一度お試しください。');
  };
}
