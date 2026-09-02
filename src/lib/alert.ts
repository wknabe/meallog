/**
 * 確認と案内のダイアログ。
 *
 * react-native の Alert は Web では中身が空の実装になっていて、呼んでも何も起きない。
 * 削除の確認が無反応になり、押しても消えない・エラーも出ないという状態になるため、
 * 画面からは直接 Alert を使わず、この窓口を通す（Web版は alert.web.ts）。
 */
import { Alert } from 'react-native';

export type AlertButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  Alert.alert(title, message, buttons);
}
