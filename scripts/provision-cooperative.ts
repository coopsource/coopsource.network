#!/usr/bin/env -S pnpm --filter @coopsource/api exec tsx
/**
 * Provision a cooperative identity on a self-hosted ATProto PDS.
 *
 * This script:
 * 1. Creates an account on the PDS (which registers a did:plc with the PLC directory)
 * 2. Writes the cooperative's profile record to the PDS
 * 3. Outputs the DID and instructions for domain-as-handle DNS setup
 *
 * Usage:
 *   pnpm --filter @coopsource/api exec tsx ../../scripts/provision-cooperative.ts \
 *     --pds-url http://localhost:2583 \
 *     --admin-password admin \
 *     --handle mycoop.test \
 *     --display-name "My Cooperative" \
 *     --description "A worker-owned cooperative"
 *
 * The PDS handles PLC directory registration internally, using its own rotation key.
 * This means the cooperative's DID is anchored to the PDS's rotation key by default.
 *
 * For production deployments, you should later update the DID document to add
 * a cooperative-controlled rotation key via `com.atproto.identity.requestPlcOperationSignature`.
 */

import { AtpAgent } from '@atproto/api';
import { generateKeyPair, publicJwkToMultibase } from '@coopsource/federation/local';

interface ProvisionOptions {
  pdsUrl: string;
  adminPassword: string;
  handle: string;
  displayName?: string;
  description?: string;
  email?: string;
}

function parseArgs(): ProvisionOptions {
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
  --pds-url <url>         PDS base URL (e.g. http://localhost:2583)
  --admin-password <pw>   PDS admin password (default: admin)
  --handle <handle>       Initial handle (e.g. mycoop.test)
  --display-name <name>   Display name for the cooperative
  --description <desc>    Short description
  --email <email>         Email for the account (optional)`);
    process.exit(1);
  }

  return {
    pdsUrl: opts['pds-url']!,
    adminPassword: opts['admin-password'] ?? 'admin',
    handle: opts['handle']!,
    displayName: opts['display-name'],
    description: opts['description'],
    email: opts['email'],
  };
}

async function provision(opts: ProvisionOptions): Promise<void> {
  console.log(`\nProvisioning cooperative on PDS: ${opts.pdsUrl}`);
  console.log(`Handle: ${opts.handle}\n`);

  // Step 1: Generate a signing keypair for the cooperative
  console.log('1. Generating ECDSA P-256 signing keypair...');
  const { publicJwk, privateJwk } = await generateKeyPair();
  const signingKeyMultibase = publicJwkToMultibase(publicJwk);
  console.log(`   Signing key (multibase): ${signingKeyMultibase}`);

  // Step 2: Authenticate as PDS admin and create an invite code
  console.log('2. Authenticating as PDS admin...');
  const adminAgent = new AtpAgent({ service: opts.pdsUrl });
  await adminAgent.login({
    identifier: 'admin',
    password: opts.adminPassword,
  });

  console.log('3. Creating invite code...');
  const invite = await adminAgent.api.com.atproto.server.createInviteCode({
    useCount: 1,
  });

  // Step 3: Create the cooperative account on the PDS
  console.log('4. Creating cooperative account...');
  const email = opts.email ?? `${opts.handle.replace(/\./g, '-')}@coopsource.local`;
  const password = `coop-${crypto.randomUUID()}`;

  const agent = new AtpAgent({ service: opts.pdsUrl });
  const result = await agent.createAccount({
    handle: opts.handle,
    email,
    password,
    inviteCode: invite.data.code,
  });

  const did = result.data.did;
  console.log(`   Account created!`);
  console.log(`   DID: ${did}`);

  // Step 4: Write the cooperative profile record
  if (opts.displayName || opts.description) {
    console.log('5. Writing profile record...');
    await agent.api.app.bsky.actor.putProfile(
      (_prev) => ({
        displayName: opts.displayName ?? opts.handle,
        description: opts.description ?? '',
      }),
    );
    console.log('   Profile written.');
  }

  // Output results
  console.log('\n' + '='.repeat(60));
  console.log('COOPERATIVE PROVISIONED SUCCESSFULLY');
  console.log('='.repeat(60));
  console.log(`DID:      ${did}`);
  console.log(`Handle:   ${opts.handle}`);
  console.log(`PDS URL:  ${opts.pdsUrl}`);
  console.log(`Email:    ${email}`);
  console.log(`Password: ${password}`);
  console.log('');
  console.log('Signing Key (private JWK) — store securely:');
  console.log(JSON.stringify(privateJwk, null, 2));
  console.log('');

  // Step 5: DNS instructions for domain-as-handle
  const domain = opts.handle;
  console.log('='.repeat(60));
  console.log('DOMAIN-AS-HANDLE DNS SETUP');
  console.log('='.repeat(60));
  console.log('');
  console.log(`To verify ownership of @${domain}, add this DNS TXT record:`);
  console.log('');
  console.log(`  Host:  _atproto.${domain}`);
  console.log(`  Type:  TXT`);
  console.log(`  Value: did=${did}`);
  console.log('');
  console.log('Then update the handle on the PDS:');
  console.log(`  curl -X POST ${opts.pdsUrl}/xrpc/com.atproto.identity.updateHandle \\`);
  console.log(`    -H "Authorization: Bearer <session-token>" \\`);
  console.log(`    -H "Content-Type: application/json" \\`);
  console.log(`    -d '{"handle": "${domain}"}'`);
  console.log('');

  // Step 6: Environment variable instructions
  console.log('='.repeat(60));
  console.log('ENVIRONMENT VARIABLES');
  console.log('='.repeat(60));
  console.log('');
  console.log('Add these to your .env file:');
  console.log('');
  console.log(`COOP_PDS_URL=${opts.pdsUrl}`);
  console.log(`COOP_PDS_ADMIN_PASSWORD=${opts.adminPassword}`);
  console.log(`COOP_DID=${did}`);
  console.log(`PDS_URL=${opts.pdsUrl}`);
  console.log(`PDS_ADMIN_PASSWORD=${opts.adminPassword}`);
  console.log(`PLC_URL=https://plc.directory`);
  console.log('');

  // Verify the DID resolves
  console.log('='.repeat(60));
  console.log('VERIFICATION');
  console.log('='.repeat(60));
  console.log('');

  try {
    const describeRes = await agent.api.com.atproto.server.describeServer();
    console.log(`PDS available DIDs: ${describeRes.data.availableUserDomains.join(', ')}`);
  } catch {
    console.log('Could not query PDS server description (non-critical).');
  }

  try {
    const profile = await agent.api.app.bsky.actor.getProfile({ actor: did });
    console.log(`Profile resolved: @${profile.data.handle} — "${profile.data.displayName ?? '(no name)'}"`);
  } catch {
    console.log('Profile not yet resolvable via Bluesky AppView (expected for local PDS).');
  }

  console.log(`\nDone. The cooperative ${did} is ready.`);
}

const opts = parseArgs();
provision(opts).catch((err) => {
  console.error('Provisioning failed:', err);
  process.exit(1);
});
