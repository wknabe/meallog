/**
 * 確認と案内のダイアログ（Web版）。
 *
 * react-native-web の Alert は何もしないので、ブラウザ標準の窓に置き換える。
 * 見た目は素っ気ないが、「押しても何も起きない」よりは確実に伝わる。
 */
export type AlertButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  const text = message != null && message !== '' ? `${title}\n\n${message}` : title;
  const list = buttons ?? [];
  const cancel = list.find((button) => button.style === 'cancel');
  // 取り消し以外のうち最初のものを「実行する側」とみなす。
  // このアプリのダイアログは「やめる／実行する」の2択しかないため、これで足りる
  const confirm = list.find((button) => button.style !== 'cancel');

  if (cancel == null) {
    // 選択肢が無い、または実質1つなら案内として出す
    window.alert(text);
    confirm?.onPress?.();
    return;
  }

  if (window.confirm(text)) confirm?.onPress?.();
  else cancel.onPress?.();
}
