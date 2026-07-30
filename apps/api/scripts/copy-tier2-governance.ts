#!/usr/bin/env -S pnpm --filter @coopsource/api exec tsx
import { pathToFileURL } from 'node:url';
import { createDb, type Database } from '@coopsource/db';
import { XrpcPermissionedRecordWritePort } from '@coopsource/spaces-consumer';
import { sql, type Kysely } from 'kysely';
import {
  createOAuthClient,
  oauthScopeForConfig,
} from '../src/auth/oauth-client.js';
import {
  GovernanceTier2CopyService,
  PermissionedRecordGovernanceTier2CopyTarget,
} from '../src/services/governance-tier2-copy-service.js';
import { OAuthPermissionedRecordWriteSessionProvider } from '../src/services/oauth-permissioned-record-write-session-provider.js';

export const TIER2_COPY_CONFIRMATION = 'COPY_TIER2_GOVERNANCE_TO_DRAFT_XRPC';

export interface Tier2GovernanceCopyOptions {
  readonly operation: 'copy' | 'verify';
  readonly databaseUrl: string;
  readonly cooperativeDid: string;
  readonly publicApiUrl?: string;
}

export function parseTier2GovernanceCopyArgs(
  argv: ReadonlyArray<string>,
  env: NodeJS.ProcessEnv,
): Tier2GovernanceCopyOptions {
  const values = new Map<string, string>();
  const known = new Set([
    '--operation',
    '--database-url',
    '--cooperative-did',
    '--public-api-url',
    '--confirm',
  ]);
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || !value || value.startsWith('--')) {
      throw usageError();
    }
    if (!known.has(name)) throw new Error(`Unknown option: ${name}`);
    if (values.has(name)) throw new Error(`Duplicate option: ${name}`);
    values.set(name, value);
  }

  if (env.TIER2_GOVERNANCE_MIGRATION_ENABLED !== 'true') {
    throw new Error(
      'Set TIER2_GOVERNANCE_MIGRATION_ENABLED=true to use this command',
    );
  }
  const operation = values.get('--operation');
  if (operation !== 'copy' && operation !== 'verify') {
    throw new Error('--operation must be copy or verify');
  }
  const databaseUrl = values.get('--database-url') ?? env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Set DATABASE_URL or pass --database-url');
  const cooperativeDid = values.get('--cooperative-did');
  if (!cooperativeDid?.startsWith('did:')) {
    throw new Error('--cooperative-did must be an explicit DID');
  }

  const publicApiUrl = values.get('--public-api-url') ?? env.PUBLIC_API_URL;
  if (operation === 'copy') {
    if (values.get('--confirm') !== TIER2_COPY_CONFIRMATION) {
      throw new Error(`Copy requires --confirm ${TIER2_COPY_CONFIRMATION}`);
    }
    if (!publicApiUrl) {
      throw new Error('Copy requires PUBLIC_API_URL or --public-api-url');
    }
    try {
      const parsed = new URL(publicApiUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('unsupported protocol');
      }
    } catch {
      throw new Error('--public-api-url must be an absolute HTTP(S) URL');
    }
  } else if (values.has('--confirm') || values.has('--public-api-url')) {
    throw new Error('--confirm and --public-api-url are only valid for copy');
  }

  return {
    operation,
    databaseUrl,
    cooperativeDid,
    ...(operation === 'copy' ? { publicApiUrl: publicApiUrl! } : {}),
  };
}

async function main(): Promise<void> {
  const options = parseTier2GovernanceCopyArgs(
    process.argv.slice(2),
    process.env,
  );
  const db = createDb({ connectionString: options.databaseUrl });
  try {
    const report = await withTier2GovernanceMigrationLock(
      db,
      options.cooperativeDid,
      async () => {
        const target =
          options.operation === 'copy'
            ? copyTarget(db, options.publicApiUrl!)
            : undefined;
        const service = new GovernanceTier2CopyService(db, target);
        return options.operation === 'copy'
          ? service.copy(options.cooperativeDid)
          : service.verify(options.cooperativeDid);
      },
    );
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.complete) process.exitCode = 1;
  } finally {
    await db.destroy();
  }
}

export async function withTier2GovernanceMigrationLock<T>(
  db: Kysely<Database>,
  cooperativeDid: string,
  run: () => Promise<T>,
): Promise<T> {
  return db.connection().execute(async (connection) => {
    const result = await sql<{ acquired: boolean }>`
      SELECT pg_try_advisory_lock(
        hashtext('csn-tier2-governance-migration'),
        hashtext(${cooperativeDid})
      ) AS acquired
    `.execute(connection);
    if (!result.rows[0]?.acquired) {
      throw new Error(
        `Tier 2 governance migration is already running for ${cooperativeDid}`,
      );
    }
    try {
      return await run();
    } finally {
      await sql`
        SELECT pg_advisory_unlock(
          hashtext('csn-tier2-governance-migration'),
          hashtext(${cooperativeDid})
        )
      `.execute(connection);
    }
  });
}

function copyTarget(
  db: ReturnType<typeof createDb>,
  publicApiUrl: string,
): PermissionedRecordGovernanceTier2CopyTarget {
  const oauthClient = createOAuthClient({
    publicUrl: publicApiUrl,
    db,
    scope: oauthScopeForConfig({
      PERMISSIONED_RECORD_WRITER_MODE: 'draft-xrpc',
      PERMISSIONED_REPO_READER_MODE: 'draft-xrpc',
    }),
  });
  const sessions = new OAuthPermissionedRecordWriteSessionProvider(oauthClient);
  return new PermissionedRecordGovernanceTier2CopyTarget(
    new XrpcPermissionedRecordWritePort({
      sessionProvider: sessions.sessionProvider,
    }),
  );
}

function usageError(): Error {
  return new Error(
    'Usage: migrate:tier2-governance --operation <copy|verify> --cooperative-did <did> [--database-url <url>] [--public-api-url <url>] [--confirm <phrase>]',
  );
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
