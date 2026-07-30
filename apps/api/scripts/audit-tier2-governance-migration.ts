#!/usr/bin/env -S pnpm --filter @coopsource/api exec tsx
import { pathToFileURL } from 'node:url';
import { createDb } from '@coopsource/db';
import { GovernanceTier2MigrationReadinessService } from '../src/services/governance-tier2-migration-readiness.js';

export interface Tier2MigrationReadinessOptions {
  readonly databaseUrl: string;
  readonly cooperativeDid?: string;
}

export function parseTier2MigrationReadinessArgs(
  argv: ReadonlyArray<string>,
  env: NodeJS.ProcessEnv,
): Tier2MigrationReadinessOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || !value) {
      throw new Error(
        'Usage: audit:tier2-governance-migration [--database-url <url>] [--cooperative-did <did>]',
      );
    }
    if (name !== '--database-url' && name !== '--cooperative-did') {
      throw new Error(`Unknown option: ${name}`);
    }
    values.set(name, value);
  }

  const databaseUrl = values.get('--database-url') ?? env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('Set DATABASE_URL or pass --database-url');
  }
  const cooperativeDid = values.get('--cooperative-did');
  if (cooperativeDid && !cooperativeDid.startsWith('did:')) {
    throw new Error('--cooperative-did must be a DID');
  }
  return {
    databaseUrl,
    ...(cooperativeDid ? { cooperativeDid } : {}),
  };
}

async function main(): Promise<void> {
  const options = parseTier2MigrationReadinessArgs(process.argv.slice(2), process.env);
  const db = createDb({ connectionString: options.databaseUrl });
  try {
    const report = await new GovernanceTier2MigrationReadinessService(db).inspect(
      options.cooperativeDid,
    );
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.readyForCopy) process.exitCode = 1;
  } finally {
    await db.destroy();
  }
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
