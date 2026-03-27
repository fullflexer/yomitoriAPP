import pg, { type PoolClient, type QueryResult, type QueryResultRow } from "pg";

const globalForPg = globalThis as typeof globalThis & {
  db?: pg.Pool;
};

const pool =
  globalForPg.db ??
  new pg.Pool({
    connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5433/yomitoriapp",
  });

if (process.env.NODE_ENV !== "production") {
  globalForPg.db = pool;
}

export { pool as db };

export type DbQuery = <TRow extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
) => Promise<QueryResult<TRow>>;

export type DbTransactionClient = Pick<PoolClient, "query">;

export async function query<TRow extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
) {
  return pool.query<TRow>(text, params as never[]);
}

export async function withTransaction<T>(
  callback: (client: DbTransactionClient) => Promise<T>,
) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
