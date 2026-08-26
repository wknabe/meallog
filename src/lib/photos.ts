/**
 * 写真の保存・縮小・削除。
 *
 * 撮った写真をそのまま保存すると1枚3〜5MBになり、1日3食×1年で数GBに達する。
 * 保存時に縮小し、DBにはファイルの場所だけを記録する。
 *
 * 保存するパスは端末内の絶対パスではなく「photos/meal/xxx.jpg」のような相対パスにする。
 * アプリの保存領域の絶対パスは再インストールやOSの更新で変わることがあり、
 * 絶対パスを保存していると過去の写真が全部表示できなくなるため。
 */
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export type PhotoKind = 'meal' | 'label';

/**
 * 縮小の基準。
 * 食事写真は振り返り用なので1,280pxで十分。
 * 成分表は文字を読む必要があり、後からOCRを入れる可能性もあるため1,920pxにしている。
 */
const SPEC: Record<PhotoKind, { maxSide: number; compress: number }> = {
  meal: { maxSide: 1280, compress: 0.8 },
  label: { maxSide: 1920, compress: 0.85 },
};

const ROOT_DIR = 'photos';

function directoryFor(kind: PhotoKind): Directory {
  return new Directory(Paths.document, ROOT_DIR, kind);
}

function ensureDirectory(kind: PhotoKind): Directory {
  const dir = directoryFor(kind);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** 相対パスから、画面で表示できる絶対URIを作る */
export function photoUri(relativePath: string | null | undefined): string | null {
  if (!relativePath) return null;
  return new File(Paths.document, relativePath).uri;
}

function makeFileName(): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${Date.now()}-${random}.jpg`;
}

/**
 * 写真を縮小してアプリの保存領域へ取り込み、相対パスを返す。
 * dimensions を渡すと、長辺だけを基準に縮小できる（縦横比は保たれる）。
 */
export async function savePhoto(
  sourceUri: string,
  kind: PhotoKind,
  dimensions?: { width: number; height: number }
): Promise<string> {
  const spec = SPEC[kind];
  const dir = ensureDirectory(kind);
  const fileName = makeFileName();

  const context = ImageManipulator.manipulate(sourceUri);

  // 長辺が基準を超えるときだけ縮小する。小さい写真を引き伸ばさないため
  if (dimensions) {
    const longest = Math.max(dimensions.width, dimensions.height);
    if (longest > spec.maxSide) {
      if (dimensions.width >= dimensions.height) {
        context.resize({ width: spec.maxSide });
      } else {
        context.resize({ height: spec.maxSide });
      }
    }
  }
  // 大きさが分からない場合は縮小しない。
  // 無条件にリサイズすると、小さい写真を引き伸ばして画質もファイルサイズも悪化するため。

  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: spec.compress });

  // 一時領域に出力されるので、アプリの保存領域へ移す
  const temp = new File(saved.uri);
  const destination = new File(dir, fileName);
  temp.move(destination);

  return `${ROOT_DIR}/${kind}/${fileName}`;
}

/** 写真を削除する。ファイルが無くてもエラーにしない */
export function deletePhoto(relativePath: string | null | undefined): void {
  if (!relativePath) return;
  const file = new File(Paths.document, relativePath);
  if (file.exists) file.delete();
}

/**
 * 保存期間を過ぎた写真を削除する。
 * retentionDays が 0 なら無期限、負なら即時削除（「保存しない」設定）。
 * 削除するのは画像ファイルだけで、記録と栄養データは残す。
 */
export function purgeExpiredPhotos(kind: PhotoKind, retentionDays: number): string[] {
  if (retentionDays === 0) return [];

  const dir = directoryFor(kind);
  if (!dir.exists) return [];

  const limitMs = retentionDays < 0 ? Date.now() : Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const removed: string[] = [];

  for (const entry of dir.list()) {
    if (!(entry instanceof File)) continue;
    // ファイル名の先頭に保存時刻を入れているので、名前だけで期限を判定できる
    const timestamp = Number(entry.name.split('-')[0]);
    if (!Number.isFinite(timestamp) || timestamp >= limitMs) continue;
    entry.delete();
    removed.push(`${ROOT_DIR}/${kind}/${entry.name}`);
  }

  return removed;
}

/** 写真が使っている容量（バイト）。設定画面に表示する */
export function photoStorageBytes(): number {
  let total = 0;
  for (const kind of ['meal', 'label'] as PhotoKind[]) {
    const dir = directoryFor(kind);
    if (!dir.exists) continue;
    for (const entry of dir.list()) {
      if (entry instanceof File) total += entry.size ?? 0;
    }
  }
  return total;
}

/** バイト数を読みやすい文字列にする */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
