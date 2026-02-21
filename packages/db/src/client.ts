import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from './schema.js';

export interface DbConfig {
  connectionString: string;
  max?: number;
}

export function createDb(config: DbConfig): Kysely<Database> {
  const dialect = new PostgresDialect({
    pool: new pg.Pool({
      connectionString: config.connectionString,
      max: config.max ?? 10,
    }),
  });

  return new Kysely<Database>({ dialect });
}
