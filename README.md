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
| 運動 | 運動記録（メッツまたは種目ごとの重さ×回数×セット）、GPSでの距離計測、歩数、ヘルスアプリとの比較 |
| 献立 | 気分4軸と直近の栄養バランスからの献立作成、冷蔵庫、1週間献立、買い物リスト |
| 商品 | 同梱した市販商品カタログの検索、成分表の撮影＋手入力での登録 |
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
node tools/build-product-seed.mjs <products.csv.gz>  # 市販商品 → assets/data/products.json
node tools/verify-schema.mjs     # スキーマとデータ投入をNode組み込みSQLiteで検証
```

`tools/build-food-seed.mjs` は `data/raw/seibunhyo_honhyo.xlsx` を読みます。
このファイルは Git に含めていないので、初回は文部科学省のサイトから取得してください。

市販商品は Open Food Facts の公開ダンプ
（`https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz`、約1.3GB）
から日本の商品だけを抜き出しています。各社の通販サイトを巡回しないのは、
Open Food Facts が ODbL で再配布を明示的に許可しているのに対し、
小売各社は規約でデータの収集・再配布を禁じていることが多いためです。
日本の商品で栄養値まで入っているものは4,500件ほどで、網羅はしていません。

出典: 日本食品標準成分表（八訂）増補2023年（文部科学省）
出典: Open Food Facts（Open Database License v1.0）https://world.openfoodfacts.org/

## ヘルスアプリ連携

Android は Health Connect、iOS は HealthKit から歩数・距離・消費カロリー・睡眠を読みます。
どちらも他のアプリ（Google Fit、各メーカーの健康アプリ、スマートウォッチ）の値を集約しているので、
ウォッチを持っていなくてもスマホが数えた歩数が入ります。
アプリを開いたときに自動で取り込みます（15分間隔、設定でオフにできます）。

どちらもネイティブの機能のため、**Expo Go では動きません**。
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

iOS 側のコードは書いてありますが、実機で動かすには Apple Developer Program への登録が必要で、
まだ検証できていません。窓口は `src/lib/health.ts` にまとめてあります。

連携できない場合や許可しない場合のために、歩数は手でも入力できます。
手で入れた歩数は、歩幅（身長の45%）から距離を出して消費カロリーに換算し、
その日の消費に足します（設定でオフにできます）。
運動として記録済みの歩数は差し引き、ヘルスアプリから歩数を取り込めている日は
そちらの消費カロリーに含まれるので足しません。

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
