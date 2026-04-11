#!/usr/bin/env -S pnpm --filter @coopsource/api exec tsx
/**
 * CLI wrapper around `provisionCooperative` in @coopsource/federation/local.
 *
 * Provisions a cooperative account on an ATProto PDS and stores a
 * privileged app password in `auth_credential` so the API's
 * `AtprotoPdsService` can use it for ongoing repo writes via
 * `AuthCredentialResolver`.
 *
 * See packages/federation/src/local/cooperative-provisioning.ts for the
 * full flow description and V9.1 scope decisions. See ARCHITECTURE-V9.md
 * §2 for the ecosystem-alignment rationale.
 *
 * Location: this script lives inside `apps/api/scripts/` (not the
 * top-level `scripts/` dir) because tsx resolves workspace package
 * imports relative to the script file's directory —
 * `apps/api/node_modules/@coopsource/*` symlinks are the resolution
 * anchor for `@coopsource/federation/local` and `@coopsource/db`.
 *
 * Usage:
 *   pnpm --filter @coopsource/api exec tsx scripts/provision-cooperative.ts \
 *     --pds-url http://localhost:2583 \
 *     --handle mycoop.test \
 *     --display-name "My Cooperative" \
 *     --description "A worker-owned cooperative"
 *
 * Reads from env: KEY_ENC_KEY, DATABASE_URL (both required).
 */

import { createDb } from '@coopsource/db';
import { provisionCooperative } from '@coopsource/federation/local';

interface CliOptions {
  pdsUrl: string;
  databaseUrl: string;
  keyEncKey: string;
  adminPassword: string;
  handle: string;
  displayName?: string;
  description?: string;
  email?: string;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const opts: Record<string, string> = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, '');
    const value = args[i + 1];
    if (key && value) {
      opts[key] = value;
    }
  }

  if (!opts['pds-url'] || !opts['handle']) {
    console.error(`Usage: provision-cooperative.ts
  --pds-url <url>           PDS base URL (e.g. http://localhost:2583)
  --database-url <url>      PostgreSQL connection string. Defaults to the
                            DATABASE_URL env var.
  --admin-password <pw>     PDS admin password (default: admin)
  --handle <handle>         Initial handle (e.g. mycoop.test)
  --display-name <name>     Display name for the cooperative
  --description <desc>      Short description
  --email <email>           Email for the account (optional)

Required env vars:
  KEY_ENC_KEY               Encryption key for auth_credential.secret_hash
                            (must match the API's KEY_ENC_KEY)`);
    process.exit(1);
  }

  const databaseUrl = opts['database-url'] ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error(
      'Error: --database-url or DATABASE_URL env var is required for writing the auth_credential row.',
    );
    process.exit(1);
  }

  const keyEncKey = process.env.KEY_ENC_KEY;
  if (!keyEncKey) {
    console.error(
      'Error: KEY_ENC_KEY env var is required for encrypting the app password at rest. ' +
        "Must match the API's KEY_ENC_KEY.",
    );
    process.exit(1);
  }

  return {
    pdsUrl: opts['pds-url']!,
    databaseUrl,
    keyEncKey,
    adminPassword: opts['admin-password'] ?? 'admin',
    handle: opts['handle']!,
    displayName: opts['display-name'],
    description: opts['description'],
    email: opts['email'],
  };
}

async function main(opts: CliOptions): Promise<void> {
  console.log(`\nProvisioning cooperative on PDS: ${opts.pdsUrl}`);
  console.log(`Handle: ${opts.handle}\n`);

  const db = createDb({ connectionString: opts.databaseUrl });
  try {
    const result = await provisionCooperative({
      db,
      pdsUrl: opts.pdsUrl,
      adminPassword: opts.adminPassword,
      keyEncKey: opts.keyEncKey,
      handle: opts.handle,
      email: opts.email,
      displayName: opts.displayName,
      description: opts.description,
    });

    console.log('\n' + '='.repeat(60));
    console.log('COOPERATIVE PROVISIONED SUCCESSFULLY');
    console.log('='.repeat(60));
    console.log(`DID:      ${result.did}`);
    console.log(`Handle:   ${result.handle}`);
    console.log(`PDS URL:  ${opts.pdsUrl}`);
    console.log(`Email:    ${result.email}`);
    console.log(`Password: ${result.password}   (account password — store securely, not used by API)`);
    console.log('');
    console.log('App password stored encrypted in auth_credential with');
    console.log(`credential_type='atproto-app-password'. AtprotoPdsService`);
    console.log('will use this to open login-based sessions for writes to this DID.');
    console.log('');
    console.log(`App password (also stored): ${result.appPassword}`);
    console.log('');
    console.log('='.repeat(60));
    console.log('ENVIRONMENT VARIABLES');
    console.log('='.repeat(60));
    console.log('');
    console.log('Add these to your .env file:');
    console.log('');
    console.log(`COOP_PDS_URL=${opts.pdsUrl}`);
    console.log(`COOP_DID=${result.did}`);
    console.log(`PDS_URL=${opts.pdsUrl}`);
    console.log(`PDS_ADMIN_PASSWORD=${opts.adminPassword}`);
    console.log('');
    console.log(`Done. The cooperative ${result.did} is ready.`);
  } finally {
    await db.destroy();
  }
}

main(parseArgs()).catch((err) => {
  console.error('Provisioning failed:', err);
  process.exit(1);
});
