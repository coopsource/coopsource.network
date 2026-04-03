import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from './schema.js';

export interface DbConfig {
  connectionString: string;
  max?: number;
  connectionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
}

export function createDb(config: DbConfig): Kysely<Database> {
  const dialect = new PostgresDialect({
    pool: new pg.Pool({
      connectionString: config.connectionString,
      max: config.max ?? 10,
      connectionTimeoutMillis: config.connectionTimeoutMillis ?? 10_000,
      idleTimeoutMillis: config.idleTimeoutMillis ?? 30_000,
    }),
  });

  return new Kysely<Database>({ dialect });
}
