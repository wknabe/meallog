/**
 * SQLiteの接続とマイグレーション。
 * アプリ起動時に initDatabase() を1回だけ呼ぶ。
 */
import * as SQLite from 'expo-sqlite';

import { LATEST_VERSION, MIGRATIONS } from './schema.ts';
import { seedPresetDishes } from './seed/dishes.ts';
import { seedStandardFoods } from './seed/foods.ts';

const DB_NAME = 'meallog.db';

let dbInstance: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * DBを開いてマイグレーションを適用する。
 * 複数箇所から同時に呼ばれても1回しか実行されないようにしている。
 */
export function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    // WALモード: 書き込み中でも読み取りが止まらないため、記録しながら画面を描画しても引っかからない
    await db.execAsync('PRAGMA journal_mode = WAL;');
    await db.execAsync('PRAGMA foreign_keys = ON;');
    await migrate(db);
    dbInstance = db;
    // 成分表データは初回起動時にだけ投入される
    const seeded = await seedStandardFoods(db);
    if (seeded > 0) console.log(`成分表データを投入しました: ${seeded}件`);
    // 料理データは版が上がったときに差分だけ追加される
    const dishes = await seedPresetDishes(db);
    if (dishes > 0) console.log(`料理データを投入しました: ${dishes}件`);
    return db;
  })();
  return initPromise;
}

/** 初期化済みのDBを取得する。initDatabase() より先に呼んではいけない */
export function getDatabase(): SQLite.SQLiteDatabase {
  if (!dbInstance) {
    throw new Error('データベースが初期化されていません。initDatabase() を先に呼んでください。');
  }
  return dbInstance;
}

async function migrate(db: SQLite.SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  const current = row?.user_version ?? 0;
  if (current >= LATEST_VERSION) return;

  for (let version = current; version < LATEST_VERSION; version++) {
    const sql = MIGRATIONS[version];
    await db.execAsync(sql);
    // PRAGMA はプレースホルダを使えないため文字列に埋め込む（値は配列の添字なので安全）
    await db.execAsync(`PRAGMA user_version = ${version + 1};`);
  }
}

/** 開発用: DBを削除して作り直す。設定画面のデバッグ操作から呼ぶ */
export async function resetDatabase() {
  if (dbInstance) {
    await dbInstance.closeAsync();
    dbInstance = null;
  }
  initPromise = null;
  await SQLite.deleteDatabaseAsync(DB_NAME);
  return initDatabase();
}
