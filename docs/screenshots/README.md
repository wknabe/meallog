# 画面のスクリーンショット

アプリの画面を残しておく場所です。

`assets/` ではなくここに置いているのは、`assets/` の中身はアプリ本体に
同梱される可能性があり、説明用の画像でアプリの容量が増えてしまうためです。

## 名前の付け方

`{画面}-{補足}.png` の形にしておくと、増えても見分けがつきます。

```
home.png                ホーム
home-over-target.png    ホーム（目標を超えて2周目に入った状態）
meals-list.png          食事の一覧
workout-strength.png    運動（筋トレを種目ごとに記録）
workout-gps.png         運動（GPSで距離を測っている）
analysis-week.png       分析（1週間）
menu-generate.png       献立の作成
```

## 撮り方

Android の実機で、電源ボタンと音量下ボタンを同時に押します。
撮った画像は端末の「Pictures/Screenshots」に入るので、PCへ移してここに置いてください。

## 貼り方

README などから相対パスで参照できます。

```markdown
![ホーム画面](docs/screenshots/home.png)
```
