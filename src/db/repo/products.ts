/**
 * 自分で登録した商品・食品（マイ食品）の読み書き。
 *
 * 成分表は「100gあたり」と「1食あたり」のどちらの表記もあるため、
 * 入力された基準量を保持しつつ、foods テーブルには必ず100gあたりに直して保存する。
 * これを揃えておかないと、グラム数からの計算が食品ごとに変わってしまう。
 */
import { getDatabase } from '@/db';
import { NUTRIENT_KEYS, type Nutrients } from '@/db/nutrients';
import type { LabelBasis } from '@/lib/ocr';
import { deletePhoto } from '@/lib/photos';

export type ProductInput = {
  name: string;
  maker: string | null;
  /** 成分表の基準量 */
  basis: LabelBasis;
  /** 1食あたり表記のときの内容量（g） */
  servingGrams: number | null;
  /** 基準量あたりの栄養価（100gあたり、または1食あたり） */
  values: Partial<Nutrients>;
  labelPhotoPath: string | null;
  /** 1食あたりを常用単位として登録するか */
  registerServingUnit: boolean;
};

/**
 * 入力値を100gあたりに換算する。
 * 1食あたり表記の場合は内容量で割り戻す。
 */
export function toPer100g(input: ProductInput): Partial<Nutrients> {
  if (input.basis === '100g') return input.values;
  const grams = input.servingGrams ?? 0;
  if (grams <= 0) {
    // 1食あたりの値を100gあたりとして保存すると、以後の記録がすべてずれる。
    // 呼び出し側で内容量の入力を必須にしているので、ここに来たら不具合として止める
    throw new Error('1食あたりの表記には内容量（g）が必要です');
  }
  const ratio = 100 / grams;
  const result: Partial<Nutrients> = {};
  for (const key of NUTRIENT_KEYS) {
    const value = input.values[key];
    if (value != null) result[key] = value * ratio;
  }
  return result;
}

function nutrientColumns(per100g: Partial<Nutrients>) {
  const columns: string[] = [];
  const values: number[] = [];
  for (const key of NUTRIENT_KEYS) {
    columns.push(key);
    values.push(per100g[key] ?? 0);
  }
  return { columns, values };
}

export async function createProduct(input: ProductInput): Promise<number> {
  const db = getDatabase();
  const per100g = toPer100g(input);
  const { columns, values } = nutrientColumns(per100g);
  const now = new Date().toISOString();

  let productId = 0;
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT INTO foods (
         source, name, kana, maker, label_basis, label_serving_g, label_photo_path,
         ${columns.join(', ')}, created_at, updated_at
       ) VALUES ('product', ?, ?, ?, ?, ?, ?, ${columns.map(() => '?').join(', ')}, ?, ?);`,
      [
        input.name,
        // 検索用。商品は日常語そのものなので名前をそのまま入れる
        input.name,
        input.maker,
        input.basis,
        input.servingGrams,
        input.labelPhotoPath,
        ...values,
        now,
        now,
      ],
    );
    productId = result.lastInsertRowId;

    // 1食あたりで登録した商品は「1食」を常用単位にしておくと記録が速い
    if (input.registerServingUnit && input.servingGrams != null && input.servingGrams > 0) {
      await db.runAsync(
        `INSERT INTO food_units (food_id, name, grams, is_purchase_unit, sort_order)
         VALUES (?, '個', ?, 1, 0);`,
        [productId, input.servingGrams],
      );
    }
  });

  return productId;
}

/**
 * 商品を更新する。再購入時に新しい成分表で上書きする用途を想定している。
 * 常用単位は既存のものを残す（ユーザーが調整している可能性があるため）。
 */
export async function updateProduct(id: number, input: ProductInput): Promise<void> {
  const db = getDatabase();
  const per100g = toPer100g(input);
  const { columns, values } = nutrientColumns(per100g);

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE foods SET
         name = ?, kana = ?, maker = ?, label_basis = ?, label_serving_g = ?, label_photo_path = ?,
         ${columns.map((column) => `${column} = ?`).join(', ')},
         updated_at = ?
       WHERE id = ?;`,
      [
        input.name,
        input.name,
        input.maker,
        input.basis,
        input.servingGrams,
        input.labelPhotoPath,
        ...values,
        new Date().toISOString(),
        id,
      ],
    );

    // 100gあたりから1食あたりに変えた場合、常用単位がまだ無ければ作る。
    // 既にあるものは触らない（ユーザーが調整している可能性があるため）
    if (input.registerServingUnit && input.servingGrams != null && input.servingGrams > 0) {
      const existing = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) AS count FROM food_units WHERE food_id = ?;',
        [id],
      );
      if ((existing?.count ?? 0) === 0) {
        await db.runAsync(
          `INSERT INTO food_units (food_id, name, grams, is_purchase_unit, sort_order)
           VALUES (?, '個', ?, 1, 0);`,
          [id, input.servingGrams],
        );
      }
    }
  });
}

/** この商品が料理の材料や買い物リストで使われている件数 */
export async function countProductReferences(id: number): Promise<number> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT
       (SELECT COUNT(*) FROM dish_ingredients WHERE food_id = ?)
     + (SELECT COUNT(*) FROM shopping_items WHERE food_id = ?)
     + (SELECT COUNT(*) FROM pantry WHERE food_id = ?) AS count;`,
    [id, id, id],
  );
  return row?.count ?? 0;
}

/**
 * 商品を削除する。
 * 料理の材料などから参照されている場合は外部キー制約で失敗するため、
 * 先に参照を数えて呼び出し側が案内できるようにしている。
 */
export async function deleteProduct(id: number): Promise<void> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ label_photo_path: string | null }>(
    "SELECT label_photo_path FROM foods WHERE id = ? AND source = 'product';",
    [id],
  );
  await db.runAsync("DELETE FROM foods WHERE id = ? AND source = 'product';", [id]);
  // 参照が残っていない写真は一緒に片付ける
  if (row?.label_photo_path) deletePhoto(row.label_photo_path);
}

export type ProductSummary = {
  id: number;
  name: string;
  maker: string | null;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  labelPhotoPath: string | null;
  labelBasis: LabelBasis | null;
  labelServingG: number | null;
  useCount: number;
};

export async function listProducts(keyword = ''): Promise<ProductSummary[]> {
  const db = getDatabase();
  const trimmed = keyword.trim();
  const rows = await db.getAllAsync<{
    id: number;
    name: string;
    maker: string | null;
    kcal: number;
    protein_g: number;
    fat_g: number;
    carb_g: number;
    label_photo_path: string | null;
    label_basis: string | null;
    label_serving_g: number | null;
    use_count: number;
  }>(
    `SELECT id, name, maker, kcal, protein_g, fat_g, carb_g,
            label_photo_path, label_basis, label_serving_g, use_count
     FROM foods
     WHERE source = 'product'
       ${trimmed === '' ? '' : 'AND (name LIKE ? OR maker LIKE ?)'}
     ORDER BY use_count DESC, updated_at DESC;`,
    trimmed === '' ? [] : [`%${trimmed}%`, `%${trimmed}%`],
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    maker: row.maker,
    kcal: row.kcal,
    proteinG: row.protein_g,
    fatG: row.fat_g,
    carbG: row.carb_g,
    labelPhotoPath: row.label_photo_path,
    labelBasis: (row.label_basis as LabelBasis) ?? null,
    labelServingG: row.label_serving_g,
    useCount: row.use_count,
  }));
}

/** 編集画面で使うため、保存されている値を入力フォームの形に戻す */
export async function getProductForEdit(id: number): Promise<ProductInput | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<Record<string, string | number | null>>(
    "SELECT * FROM foods WHERE id = ? AND source = 'product';",
    [id],
  );
  if (!row) return null;

  const basis = ((row.label_basis as string) ?? '100g') as LabelBasis;
  const servingGrams = row.label_serving_g == null ? null : Number(row.label_serving_g);

  // 保存は常に100gあたりなので、1食あたり表記だった商品は表示用に戻す
  const ratio = basis === 'serving' && servingGrams ? servingGrams / 100 : 1;
  const values: Partial<Nutrients> = {};
  for (const key of NUTRIENT_KEYS) {
    const value = Number(row[key] ?? 0);
    // 1食が大きい商品の微量成分が丸めで消えないよう、4桁まで残す
    if (value !== 0) values[key] = Math.round(value * ratio * 10000) / 10000;
  }

  return {
    name: String(row.name),
    maker: (row.maker as string) ?? null,
    basis,
    servingGrams,
    values,
    labelPhotoPath: (row.label_photo_path as string) ?? null,
    registerServingUnit: false,
  };
}
