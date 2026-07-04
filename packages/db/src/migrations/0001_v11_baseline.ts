import { sql, type Kysely } from 'kysely';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Permanent baseline bootstrap. CSN is a PoC with no production data:
 * `schema.ts` is the source of truth for types, and `schema.sql` (a
 * `pg_dump --schema-only` of a database current with `schema.ts`) is the
 * source of truth for DDL. Schema changes edit both; they do NOT add
 * migration files. Regenerate with:
 *
 *   pg_dump --schema-only --no-owner --no-privileges coopsource_dev \
 *     | grep -v '^\\' > packages/db/src/migrations/schema.sql
 *
 * Historical incremental migrations live in ./.archive/ and are not
 * executed.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  const ddl = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8');
  await sql.raw(ddl).execute(db);
  // The pg_dump preamble empties search_path on this connection; restore it
  // so the migrator's own unqualified bookkeeping queries keep working.
  await sql.raw(`SET search_path TO public`).execute(db);
}

export async function down(): Promise<void> {
  // Baseline of a PoC database; no down migration.
}
