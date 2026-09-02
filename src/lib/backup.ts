/**
 * バックアップの書き出しと読み込み。
 *
 * データは端末内にしか無いため、機種変更・アプリ削除・端末故障で全部消える。
 * 書き出したファイルをクラウドやメールに保存してもらうことで、その備えにする。
 *
 * 形式はJSONにしている。中身が人間にも読め、
 * あとからクラウド同期を足すときもそのまま使えるため。
 */
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import JSZip from 'jszip';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getDatabase } from '@/db';
import { inTransaction } from '@/db/transaction';

/** 書き出す対象のテーブル。順序は読み込み時の依存関係に合わせている */
const TABLES = [
  'profile',
  'settings',
  'app_meta',
  'foods',
  'food_units',
  'dishes',
  'dish_tastes',
  'dish_ingredients',
  'meals',
  'meal_items',
  'meal_favorites',
  'meal_favorite_items',
  'weights',
  'activities',
  'activity_exercises',
  'activity_sets',
  'activity_tracks',
  'health_daily',
  'pantry',
  'meal_plans',
  'shopping_lists',
  'shopping_items',
] as const;

/**
 * 同梱データ（成分表・プリセット料理）は書き出しから除く。
 * 2,500件の食品と361品の料理でファイルが数MB膨らむが、
 * アプリを入れ直せば同じものが復元されるため持ち出す意味がない。
 */
const SEED_FILTERS: Partial<Record<(typeof TABLES)[number], string>> = {
  foods: "source <> 'standard'",
  dishes: "source <> 'preset' OR is_customized = 1",
};

export type BackupFile = {
  format: 'meallog-backup';
  version: number;
  createdAt: string;
  includesPhotos: boolean;
  tables: Record<string, Record<string, unknown>[]>;
};

const BACKUP_VERSION = 1;
const PHOTO_DIR = 'photos';

async function dumpTables(db: SQLiteDatabase): Promise<BackupFile['tables']> {
  const tables: BackupFile['tables'] = {};
  for (const table of TABLES) {
    const filter = SEED_FILTERS[table];
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM ${table}${filter ? ` WHERE ${filter}` : ''};`,
    );
    tables[table] = rows;
  }
  return tables;
}

/** 書き出したファイルの置き場所 */
function backupDirectory(): Directory {
  const dir = new Directory(Paths.document, 'backups');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/**
 * バックアップを書き出す。
 * includePhotos が false なら数MB程度のJSON、true なら写真を含むZIPになる。
 */
export async function exportBackup(includePhotos: boolean): Promise<string> {
  const db = getDatabase();
  const payload: BackupFile = {
    format: 'meallog-backup',
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    includesPhotos: includePhotos,
    tables: await dumpTables(db),
  };

  const dir = backupDirectory();

  if (!includePhotos) {
    const file = new File(dir, `meallog-${timestamp()}.json`);
    file.create({ overwrite: true });
    file.write(JSON.stringify(payload));
    return file.uri;
  }

  const zip = new JSZip();
  zip.file('backup.json', JSON.stringify(payload));

  for (const kind of ['meal', 'label']) {
    const photoDir = new Directory(Paths.document, PHOTO_DIR, kind);
    if (!photoDir.exists) continue;
    for (const entry of photoDir.list()) {
      if (!(entry instanceof File)) continue;
      // ZIPにはbase64で入れる。バイナリのまま扱う手段が限られるため
      zip.file(`${PHOTO_DIR}/${kind}/${entry.name}`, await entry.base64(), { base64: true });
    }
  }

  const base64 = await zip.generateAsync({ type: 'base64' });
  const file = new File(dir, `meallog-${timestamp()}.zip`);
  file.create({ overwrite: true });
  file.write(base64, { encoding: 'base64' });
  return file.uri;
}

/** 書き出したファイルを共有シートで渡す */
export async function shareBackup(uri: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('この端末では共有機能を使えません');
  }
  await Sharing.shareAsync(uri, {
    mimeType: uri.endsWith('.zip') ? 'application/zip' : 'application/json',
    dialogTitle: 'Meallogのバックアップ',
  });
}

function parseBackup(text: string): BackupFile {
  const parsed = JSON.parse(text) as Partial<BackupFile>;
  if (parsed.format !== 'meallog-backup' || typeof parsed.version !== 'number') {
    throw new Error('このファイルはMeallogのバックアップではありません');
  }
  if (parsed.version > BACKUP_VERSION) {
    throw new Error('新しいバージョンのバックアップです。アプリを更新してください');
  }
  if (!parsed.tables) throw new Error('バックアップの中身が壊れています');
  return parsed as BackupFile;
}

/**
 * バックアップを読み込んで復元する。
 * 現在のデータは全て置き換わる。呼び出す前に確認を取ること。
 */
export async function importBackup(uri: string): Promise<{ restored: number; photos: number }> {
  const db = getDatabase();
  const source = new File(uri);
  let payload: BackupFile;
  let photoEntries: { path: string; base64: string }[] = [];

  if (uri.endsWith('.zip')) {
    const zip = await JSZip.loadAsync(await source.base64(), { base64: true });
    const jsonFile = zip.file('backup.json');
    if (!jsonFile) throw new Error('バックアップの中身が見つかりません');
    payload = parseBackup(await jsonFile.async('string'));

    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir || !path.startsWith(`${PHOTO_DIR}/`)) continue;
      photoEntries.push({ path, base64: await entry.async('base64') });
    }
  } else {
    payload = parseBackup(await source.text());
  }

  let restored = 0;

  // 消してから入れ直すため、途中で失敗すると元のデータごと失われる。
  // withExclusiveTransactionAsync は専用の接続を渡してくるので、
  // 中の問い合わせは必ず txn 側に出すこと（db を使うとトランザクションの外になる）
  await inTransaction(db, async (txn) => {
    // 依存の逆順に消す。外部キー制約に引っかからないようにするため
    for (const table of [...TABLES].reverse()) {
      await txn.runAsync(`DELETE FROM ${table};`);
    }

    for (const table of TABLES) {
      const rows = payload.tables[table] ?? [];
      for (const row of rows) {
        const columns = Object.keys(row);
        if (columns.length === 0) continue;
        await txn.runAsync(
          `INSERT OR REPLACE INTO ${table} (${columns.join(',')})
           VALUES (${columns.map(() => '?').join(',')});`,
          columns.map((column) => row[column] as string | number | null),
        );
        restored++;
      }
    }
  });

  // 写真を戻す
  let photos = 0;
  for (const entry of photoEntries) {
    const segments = entry.path.split('/');
    const kind = segments[1];
    const name = segments[2];
    if (!kind || !name) continue;
    const dir = new Directory(Paths.document, PHOTO_DIR, kind);
    if (!dir.exists) dir.create({ intermediates: true });
    const file = new File(dir, name);
    file.create({ overwrite: true });
    file.write(entry.base64, { encoding: 'base64' });
    photos++;
  }

  return { restored, photos };
}

/** 端末内に置いてある自動バックアップの一覧（新しい順） */
export function listLocalBackups(): { name: string; uri: string; size: number }[] {
  const dir = backupDirectory();
  const files: { name: string; uri: string; size: number }[] = [];
  for (const entry of dir.list()) {
    if (entry instanceof File)
      files.push({ name: entry.name, uri: entry.uri, size: entry.size ?? 0 });
  }
  return files.sort((a, b) => b.name.localeCompare(a.name));
}

/** 自動バックアップは直近3世代だけ残す */
const AUTO_BACKUP_KEEP = 3;
const AUTO_BACKUP_INTERVAL_DAYS = 7;

/**
 * 週に1回、記録データだけを端末内に書き出す。
 * アプリの不具合でデータが壊れた場合の復旧用で、端末ごと失うケースには手動書き出しが必要。
 */
export async function runAutoBackup(lastRunAt: string | null): Promise<string | null> {
  if (lastRunAt != null) {
    const elapsed = Date.now() - new Date(lastRunAt).getTime();
    if (elapsed < AUTO_BACKUP_INTERVAL_DAYS * 24 * 60 * 60 * 1000) return null;
  }

  const uri = await exportBackup(false);

  // 古い世代を消す
  const backups = listLocalBackups().filter((file) => file.name.endsWith('.json'));
  for (const file of backups.slice(AUTO_BACKUP_KEEP)) {
    const target = new File(file.uri);
    if (target.exists) target.delete();
  }

  return uri;
}
