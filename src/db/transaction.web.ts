/**
 * トランザクションの窓口（Web版）。
 *
 * Web の expo-sqlite には排他版（withExclusiveTransactionAsync）が無く、
 * 呼ぶと例外になる。Web は接続が1つしかないため、通常のトランザクションでも
 * 同じ接続に BEGIN/COMMIT が出て、途中で失敗すればまとめて巻き戻る。
 * 排他にしたかった理由（他の非同期クエリの割り込み）だけは満たせないが、
 * まとめて成功させるという目的は達せられる。
 */
import type { SQLiteDatabase } from 'expo-sqlite';

export type DbExecutor = Pick<
  SQLiteDatabase,
  'getAllAsync' | 'getFirstAsync' | 'runAsync' | 'execAsync'
>;

export async function inTransaction(
  db: SQLiteDatabase,
  task: (txn: DbExecutor) => Promise<void>,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await task(db);
  });
}
