# Meallog

ダイエット・食事管理アプリ。記録して終わりではなく、
**記録 → 分析 → 献立提案 → 実行 → 記録** のサイクルを回すことを目指しています。

Expo（React Native）製で、データはすべて端末内の SQLite に保存します。
サーバーは使わず、オフラインで動きます。

## できること

| 画面 | 内容 |
|---|---|
| ホーム | 摂取カロリー・PFC・消費カロリー・体重・「今日あと何を食べればいい？」 |
| 食事 | 朝昼夕間食の記録（撮影／写真選択／検索／手入力／よく食べる食事）、履歴、栄養の内訳 |
| 運動 | 手入力の運動記録（METsから消費カロリーを推定）、スマートウォッチとの比較 |
| 献立 | 気分4軸と直近の栄養バランスからの献立作成、冷蔵庫、1週間献立、買い物リスト |
| 分析 | カロリー／PFC／体重／運動量を1週間〜1ヶ月で比較 |
| 設定 | プロフィール、目標、食べ過ぎ調整、写真の保存期間、バックアップ |

## 開発

```bash
npm install
npm start          # Expo Go で開く（QRコードをスマホで読み取る）
npm run typecheck  # 型チェック（本体とテストの両方）
npm test           # 計算ロジックの単体テスト
```

### データの再生成

同梱している食品・料理のデータは、`data/` の定義から生成しています。

```bash
node tools/build-food-seed.mjs   # 成分表 + 別名・常用単位 → assets/data/
node tools/build-dish-seed.mjs   # 料理361品 → assets/data/dishes.json（食品番号を検証）
node tools/verify-schema.mjs     # スキーマとデータ投入をNode組み込みSQLiteで検証
```

`tools/build-food-seed.mjs` は `data/raw/seibunhyo_honhyo.xlsx` を読みます。
このファイルは Git に含めていないので、初回は文部科学省のサイトから取得してください。

出典: 日本食品標準成分表（八訂）増補2023年（文部科学省）

## スマートウォッチ連携（Android / Health Connect）

Health Connect はネイティブの機能のため、**Expo Go では動きません**。
専用のアプリ（development build）をビルドして端末に入れる必要があります。

```bash
npm install -g eas-cli
eas login                              # Expoアカウントでログイン（無料枠あり）
eas build --profile development --platform android
```

ビルドが終わると APK のダウンロードリンクが出ます。端末に入れてから
`npx expo start --dev-client` で開くと、運動タブから Health Connect と連携できます。

端末側に Google の「Health Connect」アプリが必要です（Android 14 以降は標準搭載）。

Health Connect が Android 8.0 以上を必要とするため、`minSdkVersion` を 26 にしています
（`app.json` の expo-build-properties）。

iPhone（HealthKit）は Apple Developer Program への登録が必要なため未対応です。
コード側は `src/lib/health.ts` に窓口をまとめてあり、iOS 対応はそこに足せます。

## 構成

```
src/
├─ app/          画面（expo-router のファイルベースルーティング）
├─ components/   共通UI（カード・入力・グラフ）
├─ db/           SQLiteのスキーマ、マイグレーション、データアクセス、同梱データの投入
├─ lib/          計算ロジック（目標算出・調整・栄養・単位・献立生成・提案）
├─ store/        画面をまたぐ状態（zustand）
└─ theme/        配色
data/            食品の別名・常用単位、料理361品の定義
tools/           データ変換と検証のスクリプト
```

`src/lib/` はUIとDBから切り離した純粋な関数だけを置き、単体テストで担保しています。
特に食べ過ぎ調整と献立生成は境界条件が多く、画面から確かめるのが難しいためです。
