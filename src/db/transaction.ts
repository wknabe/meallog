/**
 * まとめて成功させたい書き込みを1つのトランザクションで囲む窓口。
 *
 * expo-sqlite の withExclusiveTransactionAsync は専用の接続を新しく開いて
 * 引数で渡してくる。中で外側の接続を使うと BEGIN/COMMIT の外で走ってしまい、
 * 見た目はトランザクションでも実際には囲えていない。
 * それを間違えないよう、渡された接続を必ず task の引数として受け取る形にしている。
 *
 * Web には排他版が無いので、そちらは transaction.web.ts で通常版に切り替える。
 */
import type { SQLiteDatabase } from 'expo-sqlite';

/** 問い合わせの出し先。通常の接続でも、トランザクション用の接続でも渡せる */
export type DbExecutor = Pick<
  SQLiteDatabase,
  'getAllAsync' | 'getFirstAsync' | 'runAsync' | 'execAsync'
>;

export async function inTransaction(
  db: SQLiteDatabase,
  task: (txn: DbExecutor) => Promise<void>,
): Promise<void> {
  await db.withExclusiveTransactionAsync(async (txn) => {
    await task(txn);
  });
}
