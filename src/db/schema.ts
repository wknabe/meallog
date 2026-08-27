/**
 * SQLiteのテーブル定義。
 *
 * マイグレーションは PRAGMA user_version を版数として管理する。
 * 既存ユーザーの端末でもデータを失わずに更新できるよう、
 * スキーマを変更するときは MIGRATIONS に配列要素を追加する（既存要素は書き換えない）。
 */

/**
 * 分量はすべてグラムで保存する。
 * 「1パック」「1杯」といった単位は food_units でグラムに換算し、表示のときだけ使う。
 * これがないと栄養の集計も買い物リストの合算もできなくなる。
 */
const V1 = `
-- ── プロフィール（単一行）────────────────────────────
CREATE TABLE profile (
  id                  INTEGER PRIMARY KEY CHECK (id = 1),
  gender              TEXT    NOT NULL,            -- 'male' | 'female'
  birth_date          TEXT    NOT NULL,            -- YYYY-MM-DD（年齢は都度算出する）
  height_cm           REAL    NOT NULL,
  activity_level      INTEGER NOT NULL,            -- 1..5（低い〜非常に高い）
  target_weight_kg    REAL,
  target_date         TEXT,                        -- YYYY-MM-DD
  target_kcal         REAL    NOT NULL,
  target_protein_g    REAL    NOT NULL,
  target_fat_g        REAL    NOT NULL,
  target_carb_g       REAL    NOT NULL,
  -- 目標値を手で書き換えたかどうか。1ならプロフィール変更時に再計算で上書きしない
  targets_overridden  INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT    NOT NULL,
  updated_at          TEXT    NOT NULL
);

-- ── 設定（単一行）──────────────────────────────────
CREATE TABLE settings (
  id                        INTEGER PRIMARY KEY CHECK (id = 1),
  -- 1日の区切り時刻。0時/3時/4時/5時。深夜の間食を前日に含めるため既定は4
  day_start_hour            INTEGER NOT NULL DEFAULT 4,
  -- 食べ過ぎ調整
  adjustment_enabled        INTEGER NOT NULL DEFAULT 1,
  adjustment_days           INTEGER NOT NULL DEFAULT 7,       -- 3|5|7|14
  adjustment_cap_pct        INTEGER NOT NULL DEFAULT 15,      -- 10|15|20|0(=制限なし)
  adjustment_distribution   TEXT    NOT NULL DEFAULT 'even',  -- 'even'|'front'
  -- 消費カロリー
  burn_source               TEXT    NOT NULL DEFAULT 'estimate', -- 'estimate'|'watch'
  add_exercise_to_target    INTEGER NOT NULL DEFAULT 0,
  exercise_add_ratio        INTEGER NOT NULL DEFAULT 100,     -- 100|50
  -- 写真の保存期間（日数）。0=無期限、-1=保存しない
  meal_photo_retention_days INTEGER NOT NULL DEFAULT 0,
  label_photo_retention_days INTEGER NOT NULL DEFAULT 180,
  last_backup_at            TEXT,
  last_auto_backup_at       TEXT,
  updated_at                TEXT    NOT NULL
);

-- ── 食品マスタ ────────────────────────────────────
-- 成分表の食材・自分で登録した食品・市販商品を同じテーブルで扱い source で区別する
CREATE TABLE foods (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  source          TEXT    NOT NULL DEFAULT 'user',   -- 'standard'|'user'|'product'
  std_code        TEXT,                              -- 成分表の食品番号
  name            TEXT    NOT NULL,
  kana            TEXT,                              -- 検索用に記号や空白を除いた名称
  group_code      TEXT,                              -- 食品群コード '01'〜'18'
  maker           TEXT,                              -- 商品のメーカー名
  barcode         TEXT,
  refuse_pct      REAL    NOT NULL DEFAULT 0,        -- 廃棄率(%)

  -- 100gあたりの栄養価
  kcal            REAL NOT NULL DEFAULT 0,
  protein_g       REAL NOT NULL DEFAULT 0,
  fat_g           REAL NOT NULL DEFAULT 0,
  carb_g          REAL NOT NULL DEFAULT 0,
  fiber_g         REAL NOT NULL DEFAULT 0,
  salt_g          REAL NOT NULL DEFAULT 0,
  vit_a_ug        REAL NOT NULL DEFAULT 0,
  vit_d_ug        REAL NOT NULL DEFAULT 0,
  vit_e_mg        REAL NOT NULL DEFAULT 0,
  vit_k_ug        REAL NOT NULL DEFAULT 0,
  vit_b1_mg       REAL NOT NULL DEFAULT 0,
  vit_b2_mg       REAL NOT NULL DEFAULT 0,
  niacin_mg       REAL NOT NULL DEFAULT 0,
  vit_b6_mg       REAL NOT NULL DEFAULT 0,
  vit_b12_ug      REAL NOT NULL DEFAULT 0,
  folate_ug       REAL NOT NULL DEFAULT 0,
  pantothenic_mg  REAL NOT NULL DEFAULT 0,
  biotin_ug       REAL NOT NULL DEFAULT 0,
  vit_c_mg        REAL NOT NULL DEFAULT 0,
  sodium_mg       REAL NOT NULL DEFAULT 0,
  potassium_mg    REAL NOT NULL DEFAULT 0,
  calcium_mg      REAL NOT NULL DEFAULT 0,
  magnesium_mg    REAL NOT NULL DEFAULT 0,
  phosphorus_mg   REAL NOT NULL DEFAULT 0,
  iron_mg         REAL NOT NULL DEFAULT 0,
  zinc_mg         REAL NOT NULL DEFAULT 0,
  copper_mg       REAL NOT NULL DEFAULT 0,
  manganese_mg    REAL NOT NULL DEFAULT 0,
  iodine_ug       REAL NOT NULL DEFAULT 0,
  selenium_ug     REAL NOT NULL DEFAULT 0,
  chromium_ug     REAL NOT NULL DEFAULT 0,
  molybdenum_ug   REAL NOT NULL DEFAULT 0,

  -- 商品として登録した場合の付帯情報
  label_photo_path TEXT,                            -- 成分表の写真
  label_basis      TEXT,                            -- '100g'|'serving'（成分表の基準量）
  label_serving_g  REAL,                            -- 1食あたりのグラム数
  photo_path       TEXT,
  is_favorite      INTEGER NOT NULL DEFAULT 0,
  use_count        INTEGER NOT NULL DEFAULT 0,      -- よく使う順の並び替えに使う
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX idx_foods_name ON foods(name);
CREATE INDEX idx_foods_kana ON foods(kana);
CREATE INDEX idx_foods_source ON foods(source);

-- 食品ごとの常用単位（卵=1個50g、キャベツ=1玉1200g など）
CREATE TABLE food_units (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  food_id          INTEGER NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  name             TEXT    NOT NULL,               -- '個' 'パック' '玉' '切れ' '杯'
  grams            REAL    NOT NULL,
  -- 買い物リストで使う購入単位かどうか（キャベツ1玉、鮭1切れ など）
  is_purchase_unit INTEGER NOT NULL DEFAULT 0,
  sort_order       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_food_units_food ON food_units(food_id);

-- ── 料理マスタ ────────────────────────────────────
CREATE TABLE dishes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  kana        TEXT,
  -- 献立の枠（主食/主菜/副菜/汁物/その他）
  category    TEXT    NOT NULL,                    -- 'staple'|'main'|'side'|'soup'|'other'
  -- 気分の4軸のうち3つ。味の方向は複数該当するため dish_tastes に分離
  cuisine     TEXT,                                -- 'japanese'|'western'|'chinese'|'ethnic'
  effort      TEXT,                                -- 'full'|'easy'|'heatonly'|'nocook'
  volume      TEXT,                                -- 'hearty'|'normal'|'light'
  servings    REAL    NOT NULL DEFAULT 1,          -- 材料構成が何人前か
  cook_minutes INTEGER,
  steps       TEXT,                                -- 作り方のメモ
  photo_path  TEXT,
  source      TEXT    NOT NULL DEFAULT 'preset',   -- 'preset'|'user'
  is_favorite INTEGER NOT NULL DEFAULT 0,
  use_count   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);
CREATE INDEX idx_dishes_category ON dishes(category);
CREATE INDEX idx_dishes_name ON dishes(name);

-- 味の方向（さっぱり/こってり/辛い/温かい）。1つの料理に複数付けられる
CREATE TABLE dish_tastes (
  dish_id INTEGER NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  taste   TEXT    NOT NULL,                        -- 'light'|'rich'|'spicy'|'warm'
  PRIMARY KEY (dish_id, taste)
);

-- 料理の材料構成。栄養価はここから毎回計算する（料理に栄養値を直接持たせない）
CREATE TABLE dish_ingredients (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  dish_id      INTEGER NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  food_id      INTEGER NOT NULL REFERENCES foods(id),
  grams        REAL    NOT NULL,
  display_qty  REAL,                               -- 表示用の数量（1パックの「1」）
  display_unit TEXT,                               -- 表示用の単位（「パック」）
  -- 調味料は買い物リストで個別に出さず「調味料など」にまとめる
  is_seasoning INTEGER NOT NULL DEFAULT 0,
  sort_order   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_dish_ingredients_dish ON dish_ingredients(dish_id);

-- ── 食事記録 ──────────────────────────────────────
CREATE TABLE meals (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT    NOT NULL,                     -- 論理日 YYYY-MM-DD（区切り時刻を適用済み）
  slot       TEXT    NOT NULL,                     -- 'breakfast'|'lunch'|'dinner'|'snack'
  eaten_at   TEXT    NOT NULL,                     -- 実際の日時（ISO8601）
  photo_path TEXT,
  memo       TEXT,
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
);
CREATE INDEX idx_meals_date ON meals(date);

-- 食事の中身。食品と料理のどちらも入れられる。
-- 栄養価は記録時点の値を保存する（あとで料理のレシピを直しても過去の記録が変わらないようにするため）
CREATE TABLE meal_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  meal_id    INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  ref_type   TEXT    NOT NULL,                     -- 'food'|'dish'
  ref_id     INTEGER NOT NULL,
  name       TEXT    NOT NULL,                     -- 記録時点の名称
  -- 単位があればその個数（卵なら1）、なければグラム数。実重量は必ず grams を使う
  quantity   REAL    NOT NULL,
  unit_label TEXT,                                 -- '1パック' などの表示用
  grams      REAL    NOT NULL DEFAULT 0,           -- 実重量（買い物・在庫の計算用）
  -- 集計を速くするための主要栄養素
  kcal       REAL    NOT NULL DEFAULT 0,
  protein_g  REAL    NOT NULL DEFAULT 0,
  fat_g      REAL    NOT NULL DEFAULT 0,
  carb_g     REAL    NOT NULL DEFAULT 0,
  fiber_g    REAL    NOT NULL DEFAULT 0,
  -- ビタミン・ミネラルを含む全栄養素（JSON）
  nutrients  TEXT    NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_meal_items_meal ON meal_items(meal_id);

-- よく食べる食事（ワンタップ登録用のテンプレート）
CREATE TABLE meal_favorites (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  slot       TEXT,
  use_count  INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL
);
CREATE TABLE meal_favorite_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  favorite_id INTEGER NOT NULL REFERENCES meal_favorites(id) ON DELETE CASCADE,
  ref_type    TEXT    NOT NULL,
  ref_id      INTEGER NOT NULL,
  quantity    REAL    NOT NULL,
  unit_label  TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- ── 体重 ────────────────────────────────────────
CREATE TABLE weights (
  date         TEXT PRIMARY KEY,                   -- 1日1件。再入力は上書き
  weight_kg    REAL NOT NULL,
  body_fat_pct REAL,
  recorded_at  TEXT NOT NULL
);

-- ── 運動（手入力）──────────────────────────────────
CREATE TABLE activities (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  date         TEXT    NOT NULL,
  type         TEXT    NOT NULL,                   -- 'walk'|'run'|'strength'|'other'
  name         TEXT,                               -- '腹筋ローラー' など
  duration_min REAL,
  distance_km  REAL,
  reps         INTEGER,
  sets         INTEGER,
  kcal         REAL,
  memo         TEXT,
  created_at   TEXT    NOT NULL
);
CREATE INDEX idx_activities_date ON activities(date);

-- ── スマートウォッチ由来のデータ ──────────────────────
-- 推定値と混ざらないようテーブルごと分けている（企画書の「勝手に合算しない」を構造で担保）
CREATE TABLE health_daily (
  date          TEXT PRIMARY KEY,
  steps         INTEGER,
  distance_km   REAL,
  active_kcal   REAL,                              -- 活動による消費
  total_kcal    REAL,                              -- 総消費（基礎代謝込み）
  exercise_min  REAL,
  resting_hr    INTEGER,
  sleep_min     REAL,
  source        TEXT,                              -- 'health_connect'|'healthkit'
  synced_at     TEXT
);

-- ── 冷蔵庫の在庫 ──────────────────────────────────
CREATE TABLE pantry (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  food_id    INTEGER NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  grams      REAL    NOT NULL,
  expires_on TEXT,                                 -- 賞味期限（任意）
  updated_at TEXT    NOT NULL
);
CREATE INDEX idx_pantry_food ON pantry(food_id);

-- ── 献立 ────────────────────────────────────────
CREATE TABLE meal_plans (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT    NOT NULL,
  slot       TEXT    NOT NULL,
  ref_type   TEXT    NOT NULL,                     -- 'dish'|'food'
  ref_id     INTEGER NOT NULL,
  quantity   REAL    NOT NULL DEFAULT 1,           -- dishは人数分、foodはグラム
  -- 「作った」を押すと1になり、そのとき在庫を減らす（自動では減らさない）
  cooked     INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL
);
CREATE INDEX idx_meal_plans_date ON meal_plans(date);

-- ── 買い物リスト ──────────────────────────────────
CREATE TABLE shopping_lists (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  start_date TEXT NOT NULL,
  end_date   TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE shopping_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id       INTEGER NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  food_id       INTEGER REFERENCES foods(id),
  name          TEXT    NOT NULL,
  group_code    TEXT,                              -- 売り場のカテゴリ分けに使う
  need_grams    REAL    NOT NULL,                  -- 献立から集計した必要量
  purchase_qty  REAL,                              -- 購入単位に切り上げた数量
  purchase_unit TEXT,                              -- '玉' '切れ' など
  checked       INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_shopping_items_list ON shopping_items(list_id);
`;

/**
 * 同梱データの投入状況などを覚えておくための小さなキー値テーブル。
 * 料理データはあとから品数を増やすため、どこまで投入したかを版数で持つ。
 */
const V2 = `
CREATE TABLE app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/**
 * 同梱の料理データを「名前」で同一視していると、ユーザーが改名しただけで
 * 次の更新時に重複して入ってしまう。名前とは別に、変わらない識別子を持たせる。
 * is_customized は、プリセットを編集したかどうかの目印。
 */
const V3 = `
ALTER TABLE dishes ADD COLUMN seed_key TEXT;
ALTER TABLE dishes ADD COLUMN is_customized INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX idx_dishes_seed_key ON dishes(seed_key) WHERE seed_key IS NOT NULL;

-- すでに投入済みの料理は、当時の名前をそのまま識別子として引き継ぐ
UPDATE dishes SET seed_key = name WHERE source = 'preset';
`;

const V4 = `
-- メッツの数字をそのまま出すか、体感の言葉で出すか
ALTER TABLE settings ADD COLUMN show_mets INTEGER NOT NULL DEFAULT 0;

-- 筋トレの種目ごとの記録。
-- activities に1行だけ持たせると「ベンチ60kg×10回×3セット、次はラットプル…」が書けないため、
-- 1回のトレーニング（activities の1行）にぶら下げる形で分ける。
CREATE TABLE activity_exercises (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id  INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  -- 器具・種目の識別子。一覧に無いものは NULL にして name だけ使う
  equipment_key TEXT,
  name         TEXT    NOT NULL,
  -- 種目の中での並び順
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL
);
CREATE INDEX idx_activity_exercises_activity ON activity_exercises(activity_id);

-- 種目ごとのセット。セットごとに重さを変えられるようにする
CREATE TABLE activity_sets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  exercise_id INTEGER NOT NULL REFERENCES activity_exercises(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL DEFAULT 0,
  weight_kg   REAL,
  reps        INTEGER
);
CREATE INDEX idx_activity_sets_exercise ON activity_sets(exercise_id);

-- GPSで測ったウォーキング・ランニングの軌跡。
-- 地図は出さないので、距離の再計算と簡易な線図に使うぶんだけ持つ
CREATE TABLE activity_tracks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  lat         REAL    NOT NULL,
  lng         REAL    NOT NULL,
  recorded_at TEXT    NOT NULL
);
CREATE INDEX idx_activity_tracks_activity ON activity_tracks(activity_id, position);
`;

const V5 = `
-- 端末の健康アプリ（Health Connect / ヘルスケア）から自動で取り込むか
ALTER TABLE settings ADD COLUMN auto_sync_health INTEGER NOT NULL DEFAULT 1;
-- 最後に取り込んだ時刻。短い間隔で何度も読みに行かないため
ALTER TABLE settings ADD COLUMN last_health_sync_at TEXT;
`;

const V6 = `
-- 市販商品のカタログ（Open Food Facts 由来）。
--
-- foods に直接入れない理由:
--   1. 4万件をビタミン・ミネラルまで持つ30列のテーブルに入れると初回起動が重い
--   2. 商品の栄養表示にビタミン類はほとんど無く、列の大半が0で埋まる
--   3. バックアップに4万件が乗ってしまう
-- 検索でヒットしたものだけを foods へ写して使う（手で登録した商品と同じ扱いになる）。
CREATE TABLE product_catalog (
  barcode     TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  kana        TEXT,                 -- 検索用。記号や空白を除いた名称
  maker       TEXT,
  quantity    TEXT,                 -- '350 ml' のような内容量の表記
  serving_g   REAL,                 -- 1食あたりのグラム数。分かるものだけ
  kcal        REAL NOT NULL,
  protein_g   REAL NOT NULL DEFAULT 0,
  fat_g       REAL NOT NULL DEFAULT 0,
  carb_g      REAL NOT NULL DEFAULT 0,
  fiber_g     REAL,
  sugar_g     REAL,
  salt_g      REAL
);
CREATE INDEX idx_product_catalog_name ON product_catalog(name);
CREATE INDEX idx_product_catalog_kana ON product_catalog(kana);
`;

const V7 = `
-- 手で入力した歩数。
-- ヘルスアプリから取り込んだ steps とは別の列にする。
-- 同じ列に入れると、次の自動取り込みで手入力が消えてしまう。
ALTER TABLE health_daily ADD COLUMN manual_steps INTEGER;
`;

/**
 * マイグレーション。配列の添字+1が user_version になる。
 * 既存の要素は絶対に書き換えず、変更は末尾への追加で行う。
 */
export const MIGRATIONS: string[] = [V1, V2, V3, V4, V5, V6, V7];

export const LATEST_VERSION = MIGRATIONS.length;
