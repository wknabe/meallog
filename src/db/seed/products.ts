/**
 * 市販商品のカタログをDBへ投入する。
 *
 * assets/data/products.json は tools/build-product-seed.mjs で生成している。
 * 出典: Open Food Facts（Open Database License v1.0）
 *
 * 件数が多いので初回起動をここで止めない。
 * アプリが立ち上がったあと、裏で少しずつ入れる。
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import { inTransaction } from '@/db/transaction';

type ProductSeed = {
  /** バーコード */
  c: string;
  /** 商品名 */
  n: string;
  /** メーカー */
  m: string;
  /** 内容量の表記 */
  q: string;
  /** 1食あたりのグラム数 */
  s: number | null;
  k: number;
  p: number;
  f: number;
  b: number;
  i: number | null;
  u: number | null;
  l: number | null;
};

type ProductSeedFile = {
  source: string;
  licence: string;
  url: string;
  generatedAt: string;
  products: ProductSeed[];
};

// import ではなく require を使う。
// 件数が多く、import すると型推論が巨大になって型チェックが極端に遅くなるため
const seed = require('@/assets/data/products.json') as ProductSeedFile;

export const PRODUCT_DATA_SOURCE = {
  name: seed.source,
  licence: seed.licence,
  url: seed.url,
  generatedAt: seed.generatedAt,
  count: seed.products.length,
};

/**
 * 検索用の文字列を作る。
 * 商品名は「コカ・コーラ ゼロ 500ml」のように記号や空白が混ざるので、
 * 検索側と同じ規則で取り除いておかないと「コカコーラ」で引けない。
 */
function searchKey(name: string, maker: string): string {
  return `${name} ${maker}`.replace(/[\s［］[\]（）()・,、.-]/g, '').toLowerCase();
}

/** 1回のINSERTでまとめる件数。SQLiteのプレースホルダ数の上限に余裕を持たせている */
const BATCH_SIZE = 50;

/** 1回の処理で入れる件数。これを超えたら一度手を離し、画面の操作を妨げないようにする */
const CHUNK_SIZE = 2_000;

export async function countCatalog(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM product_catalog;',
  );
  return row?.count ?? 0;
}

/**
 * まだ入っていなければ投入する。
 * 途中で中断されても続きから入れられるよう、入っている件数を見て残りだけを処理する。
 */
export async function seedProductCatalog(
  db: SQLiteDatabase,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const total = seed.products.length;
  let done = await countCatalog(db);
  if (done >= total) return 0;

  let inserted = 0;

  while (done < total) {
    const chunk = seed.products.slice(done, done + CHUNK_SIZE);
    await inTransaction(db, async (txn) => {
      for (let offset = 0; offset < chunk.length; offset += BATCH_SIZE) {
        const batch = chunk.slice(offset, offset + BATCH_SIZE);
        const values: (string | number | null)[] = [];
        for (const product of batch) {
          values.push(
            product.c,
            product.n,
            searchKey(product.n, product.m),
            product.m === '' ? null : product.m,
            product.q === '' ? null : product.q,
            product.s,
            product.k,
            product.p,
            product.f,
            product.b,
            product.i,
            product.u,
            product.l,
          );
        }
        await txn.runAsync(
          `INSERT OR IGNORE INTO product_catalog
             (barcode, name, kana, maker, quantity, serving_g,
              kcal, protein_g, fat_g, carb_g, fiber_g, sugar_g, salt_g)
           VALUES ${batch.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',')};`,
          values,
        );
      }
    });

    inserted += chunk.length;
    done += chunk.length;
    onProgress?.(done, total);

    // 次のチャンクの前に一度制御を返す。まとめて入れると画面が固まる
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return inserted;
}
