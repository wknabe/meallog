/**
 * 同梱した市販商品カタログの検索。
 *
 * カタログは読むだけのデータで、選んだものを foods へ写して初めて記録に使える。
 * 写したあとは手で登録した商品と同じ扱いになるので、名前や栄養を直せるし、
 * バックアップにも入る（カタログ4万件はバックアップに入れない）。
 */
import { getDatabase } from '@/db';

export type CatalogProduct = {
  barcode: string;
  name: string;
  maker: string | null;
  quantity: string | null;
  servingG: number | null;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  fiberG: number | null;
  sugarG: number | null;
  saltG: number | null;
};

type CatalogRow = {
  barcode: string;
  name: string;
  maker: string | null;
  quantity: string | null;
  serving_g: number | null;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
  salt_g: number | null;
};

const toProduct = (row: CatalogRow): CatalogProduct => ({
  barcode: row.barcode,
  name: row.name,
  maker: row.maker,
  quantity: row.quantity,
  servingG: row.serving_g,
  kcal: row.kcal,
  proteinG: row.protein_g,
  fatG: row.fat_g,
  carbG: row.carb_g,
  fiberG: row.fiber_g,
  sugarG: row.sugar_g,
  saltG: row.salt_g,
});

/** 検索側でも登録時と同じ規則で記号を落とす */
function searchKey(keyword: string): string {
  return keyword.replace(/[\s［］[\]（）()・,、.-]/g, '').toLowerCase();
}

export async function searchCatalog(query: string, limit = 40): Promise<CatalogProduct[]> {
  const keyword = query.trim();
  if (keyword === '') return [];

  const db = getDatabase();
  const pattern = `%${keyword}%`;
  const normalized = `%${searchKey(keyword)}%`;

  const rows = await db.getAllAsync<CatalogRow>(
    `SELECT * FROM product_catalog
     WHERE name LIKE ? OR kana LIKE ?
     ORDER BY
       -- 名前の先頭に一致するものを先に出す
       CASE WHEN name LIKE ? THEN 0 ELSE 1 END,
       LENGTH(name) ASC
     LIMIT ?;`,
    [pattern, normalized, `${keyword}%`, limit],
  );
  return rows.map(toProduct);
}

/** バーコードから1件引く。読み取り機能を足したときに使う */
export async function findByBarcode(barcode: string): Promise<CatalogProduct | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<CatalogRow>(
    'SELECT * FROM product_catalog WHERE barcode = ?;',
    [barcode],
  );
  return row ? toProduct(row) : null;
}

/**
 * カタログの商品を自分の食品として取り込む。
 * すでに同じバーコードで取り込んでいれば、その食品を返して二重に作らない。
 */
export async function importProduct(product: CatalogProduct): Promise<number> {
  const db = getDatabase();

  const existing = await db.getFirstAsync<{ id: number }>(
    "SELECT id FROM foods WHERE barcode = ? AND source = 'product';",
    [product.barcode],
  );
  if (existing) return existing.id;

  const now = new Date().toISOString();
  const result = await db.runAsync(
    `INSERT INTO foods
       (source, name, kana, maker, barcode, kcal, protein_g, fat_g, carb_g, fiber_g, salt_g,
        created_at, updated_at)
     VALUES ('product', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      product.name,
      searchKey(`${product.name} ${product.maker ?? ''}`),
      product.maker,
      product.barcode,
      product.kcal,
      product.proteinG,
      product.fatG,
      product.carbG,
      product.fiberG ?? 0,
      product.saltG ?? 0,
      now,
      now,
    ],
  );

  // 1食あたりのグラム数が分かっていれば、常用単位として入れておく
  if (product.servingG != null && product.servingG > 0) {
    await db.runAsync(
      `INSERT INTO food_units (food_id, name, grams, is_purchase_unit, sort_order)
       VALUES (?, '1食', ?, 1, 0);`,
      [result.lastInsertRowId, product.servingG],
    );
  }

  return result.lastInsertRowId;
}
