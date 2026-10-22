import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

type Db = NodePgDatabase<typeof schema>;

let _pool: pg.Pool | undefined;
let _db: Db | undefined;

function getPool(): pg.Pool {
  if (!_pool) {
    _pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DB_POOL_MAX ?? 20),
    });
  }
  return _pool;
}

function getDb(): Db {
  if (!_db) _db = drizzle(getPool(), { schema });
  return _db;
}

// Lazy proxies: the pool is created on first use, not at import time.
function lazy<T extends object>(get: () => T): T {
  return new Proxy({} as T, {
    get(_t, prop) {
      const target = get();
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export const pool: pg.Pool = lazy(getPool);
export const db: Db = lazy(getDb);

export async function closeDb(): Promise<void> {
  const p = _pool;
  _pool = undefined;
  _db = undefined;
  if (p) await p.end();
}
