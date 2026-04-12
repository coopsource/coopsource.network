# V9.2.1 PLC Service Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `#coopsource` / `CoopSourceNetwork` service entry to cooperative PLC DID documents during provisioning, so external ATProto clients can discover CSN's governance AppView.

**Architecture:** Extend `provisionCooperative()` with the PDS identity email-token flow (`requestPlcOperationSignature` → extract token from Mailpit → `signPlcOperation` → `submitPlcOperation`). New `MailpitClient` handles email interception in dev/test. PDS gets SMTP config pointing to Mailpit in Docker.

**Tech Stack:** TypeScript strict, `@atproto/api` (AtpAgent), Mailpit REST API, Vitest, Docker Compose

**Spec:** `docs/superpowers/specs/2026-04-12-plc-service-entry-design.md`

---

## Task 1: Infrastructure — PDS SMTP Config + Global Setup

Wire the PDS container to send email through Mailpit and ensure Mailpit is started for federation tests.

**Files:**
- Modify: `infrastructure/docker-compose.yml:58-88`
- Modify: `packages/federation/tests/global-setup.ts:72-76,106-110`
- Modify: `Makefile:83-86`

- [ ] **Step 1: Add SMTP env vars and Mailpit dependency to PDS in docker-compose.yml**

In `infrastructure/docker-compose.yml`, add to the `pds` service's `environment` block (after `PDS_CRAWLERS`):

```yaml
      PDS_EMAIL_SMTP_URL: smtp://mailpit:1025
      PDS_EMAIL_FROM_ADDRESS: noreply@coopsource.local
```

And add `mailpit` to the PDS `depends_on`:

```yaml
    depends_on:
      plc:
        condition: service_healthy
      mailpit:
        condition: service_started
```

- [ ] **Step 2: Add `mailpit` to global-setup.ts container startup**

In `packages/federation/tests/global-setup.ts`, update the `up` command at line 73:

```typescript
    execSync(
      `docker compose -f "${COMPOSE_FILE}" up -d plc pds mailpit`,
      { stdio: 'pipe' },
    );
```

And update the `stop` command in `teardown()` at line 107:

```typescript
    execSync(
      `docker compose -f "${COMPOSE_FILE}" stop plc pds mailpit`,
      { stdio: 'pipe' },
    );
```

Add `MAILPIT_URL` to the env vars set after health checks (after line 96):

```typescript
  process.env.MAILPIT_URL = 'http://localhost:8025';
```

- [ ] **Step 3: Add `mailpit` to `test:pds` and `test:all` Makefile targets**

In `Makefile`, update `test\:pds` (line 83-86):

```makefile
test\:pds: pds-up ## Run PDS integration tests (starts PDS containers, waits for health)
	@echo "Waiting for PDS to be healthy..."
	@docker compose -f infrastructure/docker-compose.yml up -d --wait plc pds mailpit
	PDS_URL=http://localhost:2583 PLC_URL=http://localhost:2582 MAILPIT_URL=http://localhost:8025 pnpm --filter @coopsource/federation test
```

Update `test\:all` similarly (line 88-91):

```makefile
test\:all: pds-reset start ## Run ALL tests with real PDS (Docker required, resets volumes)
	@echo "Waiting for PDS + PLC to be healthy..."
	@docker compose -f infrastructure/docker-compose.yml up -d --wait plc pds mailpit
	pnpm test
```

- [ ] **Step 4: Verify PDS starts with SMTP config**

```bash
docker compose -f infrastructure/docker-compose.yml down plc pds mailpit 2>/dev/null; \
docker compose -f infrastructure/docker-compose.yml up -d plc pds mailpit && \
docker compose -f infrastructure/docker-compose.yml logs pds 2>&1 | tail -5
```

Expected: PDS starts without errors. No SMTP-related failures in logs.

- [ ] **Step 5: Commit**

```bash
git checkout -b feature/v9.2.1-plc-service-entry
git add infrastructure/docker-compose.yml packages/federation/tests/global-setup.ts Makefile
git commit -m "infra: wire PDS SMTP to Mailpit, add mailpit to test targets"
```

---

## Task 2: Prerequisite Spike — Verify PDS Email-Token Flow

Before writing the production code, verify the PDS identity endpoint flow works end-to-end. This spike determines the email format for `extractPlcToken` and confirms the flow. Run it interactively — no need to commit the spike script.

**Files:**
- Create (temporary): `packages/federation/tests/spike-plc-service-entry.ts`

- [ ] **Step 1: Write the spike script**

Create `packages/federation/tests/spike-plc-service-entry.ts`:

```typescript
/**
 * Spike script: verify the PDS identity email-token flow for PLC updates.
 * Run with: npx tsx packages/federation/tests/spike-plc-service-entry.ts
 *
 * Prerequisites:
 *   docker compose -f infrastructure/docker-compose.yml up -d plc pds mailpit
 *   Ensure PDS has PDS_EMAIL_SMTP_URL=smtp://mailpit:1025
 */

import { AtpAgent } from '@atproto/api';

const PDS_URL = process.env.PDS_URL ?? 'http://localhost:2583';
const PDS_ADMIN_PASSWORD = process.env.PDS_ADMIN_PASSWORD ?? 'admin';
const PLC_URL = process.env.PLC_URL ?? 'http://localhost:2582';
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';

async function main() {
  // ── Step 1: Clear Mailpit inbox ──
  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' });
  console.log('Cleared Mailpit inbox');

  // ── Step 2: Create a test account ──
  const adminAuth = 'Basic ' + Buffer.from(`admin:${PDS_ADMIN_PASSWORD}`).toString('base64');
  const inviteRes = await fetch(`${PDS_URL}/xrpc/com.atproto.server.createInviteCode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': adminAuth },
    body: JSON.stringify({ useCount: 1 }),
  });
  const { code: inviteCode } = await inviteRes.json() as { code: string };

  const handle = `spike-${Date.now()}.test`;
  const email = `spike-${Date.now()}@coopsource.local`;
  const agent = new AtpAgent({ service: PDS_URL });
  const createResult = await agent.com.atproto.server.createAccount({
    handle,
    email,
    password: `spike-${crypto.randomUUID()}`,
    inviteCode,
  });
  const did = createResult.data.did;
  console.log(`Created account: ${did} (${handle})`);

  // The agent now has a live session from createAccount.
  // Resume the session so the agent uses it for subsequent calls.
  await agent.resumeSession({
    did: createResult.data.did,
    handle: createResult.data.handle,
    accessJwt: createResult.data.accessJwt,
    refreshJwt: createResult.data.refreshJwt,
    active: true,
  });

  // ── Step 3: Call requestPlcOperationSignature ──
  console.log('Calling requestPlcOperationSignature...');
  try {
    await agent.com.atproto.identity.requestPlcOperationSignature();
    console.log('requestPlcOperationSignature succeeded (200)');
  } catch (err: unknown) {
    console.error('requestPlcOperationSignature failed:', err);
    process.exit(1);
  }

  // ── Step 4: Fetch email from Mailpit ──
  console.log('Waiting for email in Mailpit...');
  let emailBody = '';
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    const msgRes = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=5`);
    const msgs = await msgRes.json() as { messages: Array<{ ID: string; To: Array<{ Address: string }> }> };
    const match = msgs.messages?.find(m =>
      m.To?.some(t => t.Address === email)
    );
    if (match) {
      const bodyRes = await fetch(`${MAILPIT_URL}/api/v1/message/${match.ID}`);
      const full = await bodyRes.json() as { Text: string; HTML: string; Subject: string };
      console.log('=== EMAIL SUBJECT ===');
      console.log(full.Subject);
      console.log('=== EMAIL TEXT BODY ===');
      console.log(full.Text);
      console.log('=== EMAIL HTML BODY ===');
      console.log(full.HTML);
      emailBody = full.Text || full.HTML;
      break;
    }
  }
  if (!emailBody) {
    console.error('No email received after 15s. Check PDS SMTP config.');
    process.exit(1);
  }

  // ── Step 5: Extract token (manual inspection — look at the email output) ──
  // Try common patterns: the token might be a code in the body
  const tokenMatch = emailBody.match(/([A-Za-z0-9_-]{20,})/);
  const token = tokenMatch?.[1] ?? 'COULD_NOT_EXTRACT';
  console.log(`Extracted token candidate: ${token}`);

  // ── Step 6: Get current DID document for defensive services map ──
  const didDocRes = await fetch(`${PLC_URL}/${encodeURIComponent(did)}`);
  const didDoc = await didDocRes.json() as {
    service: Array<{ id: string; type: string; serviceEndpoint: string }>;
  };
  console.log('Current DID doc services:', JSON.stringify(didDoc.service, null, 2));

  // ── Step 7: Call signPlcOperation with token + services ──
  console.log('Calling signPlcOperation...');
  try {
    const signResult = await agent.com.atproto.identity.signPlcOperation({
      token,
      services: {
        atproto_pds: {
          type: 'AtprotoPersonalDataServer',
          endpoint: PDS_URL,
        },
        coopsource: {
          type: 'CoopSourceNetwork',
          endpoint: 'http://localhost:3001',
        },
      },
    });
    console.log('signPlcOperation returned:', JSON.stringify(signResult.data, null, 2));

    // ── Step 8: Call submitPlcOperation ──
    console.log('Calling submitPlcOperation...');
    await agent.com.atproto.identity.submitPlcOperation({
      operation: signResult.data.operation,
    });
    console.log('submitPlcOperation succeeded');
  } catch (err: unknown) {
    console.error('signPlcOperation or submitPlcOperation failed:', err);
    process.exit(1);
  }

  // ── Step 9: Verify DID document ──
  const verifyRes = await fetch(`${PLC_URL}/${encodeURIComponent(did)}`);
  const verifyDoc = await verifyRes.json() as {
    service: Array<{ id: string; type: string; serviceEndpoint: string }>;
  };
  console.log('Updated DID doc services:', JSON.stringify(verifyDoc.service, null, 2));

  const hasCoopsource = verifyDoc.service?.some(
    (s: { id: string }) => s.id === '#coopsource'
  );
  const hasPds = verifyDoc.service?.some(
    (s: { id: string }) => s.id === '#atproto_pds'
  );
  console.log(`#coopsource present: ${hasCoopsource}`);
  console.log(`#atproto_pds preserved: ${hasPds}`);

  if (hasCoopsource && hasPds) {
    console.log('\n✓ Spike successful — email-token flow works end-to-end');
  } else {
    console.log('\n✗ Spike failed — check output above');
    process.exit(1);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Run the spike**

```bash
docker compose -f infrastructure/docker-compose.yml up -d plc pds mailpit && \
sleep 5 && \
npx tsx packages/federation/tests/spike-plc-service-entry.ts
```

Expected output: the email body prints to stdout, the token is extracted, `signPlcOperation` and `submitPlcOperation` succeed, and the final DID document shows both `#atproto_pds` and `#coopsource`.

**Record these findings before proceeding:**
- The email subject line (for Mailpit search filtering)
- The token format and how to extract it from the email body (exact regex)
- Whether `signPlcOperation` merges or replaces services (check if `#atproto_pds` survives even if you only pass `coopsource` in the services map — but keep the defensive map regardless)

- [ ] **Step 3: If the spike fails because email was not sent**

This means `PDS_DEV_MODE=true` needs explicit SMTP config. Check:
1. PDS logs: `docker compose -f infrastructure/docker-compose.yml logs pds | grep -i smtp`
2. Verify the SMTP env vars from Task 1 are present: `docker compose -f infrastructure/docker-compose.yml exec pds env | grep EMAIL`
3. If the PDS can't reach Mailpit, check network — both are on the same Docker network.

- [ ] **Step 4: Delete the spike script (do not commit)**

```bash
rm packages/federation/tests/spike-plc-service-entry.ts
```

---

## Task 3: MailpitClient — Email Token Extraction

Build the Mailpit REST API client used by `provisionCooperative()` to extract the PLC confirmation token from intercepted emails.

**Files:**
- Create: `packages/federation/src/email/mailpit-client.ts`
- Modify: `packages/federation/src/email/index.ts`
- Create: `packages/federation/tests/mailpit-client.test.ts`

- [ ] **Step 1: Write failing tests for MailpitClient**

Create `packages/federation/tests/mailpit-client.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { MailpitClient } from '../src/email/mailpit-client.js';

const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';

describe('MailpitClient', () => {
  const client = new MailpitClient(MAILPIT_URL);

  describe('clearInbox', () => {
    it('succeeds when inbox is empty', async () => {
      await client.clearInbox();
      // No throw = success
    });
  });

  describe('extractPlcToken', () => {
    // NOTE: Update the email body string below to match the actual format
    // observed during the Task 2 spike. The placeholder below assumes the
    // PDS sends a confirmation code in the email body.
    it('extracts the token from a PDS PLC operation email', () => {
      // Replace this with the actual email body format from the spike.
      // The token pattern will be determined empirically.
      const emailBody = 'Your confirmation code is: ABCD-1234-EFGH-5678';
      const token = client.extractPlcToken(emailBody);
      expect(token).toBe('ABCD-1234-EFGH-5678');
    });

    it('throws if no token is found in the email body', () => {
      expect(() => client.extractPlcToken('Hello, no token here.')).toThrow(
        /Could not extract PLC confirmation token/,
      );
    });
  });

  // waitForEmail is an integration test — needs a running Mailpit.
  // Tested end-to-end in Task 5's integration test.
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @coopsource/federation test -- --run tests/mailpit-client.test.ts
```

Expected: FAIL — `mailpit-client.ts` does not exist.

- [ ] **Step 3: Implement MailpitClient**

Create `packages/federation/src/email/mailpit-client.ts`:

```typescript
/**
 * Mailpit REST API client for dev/test email token extraction.
 *
 * Used by `provisionCooperative()` to extract the PLC operation
 * confirmation token from emails sent by the PDS during the
 * `requestPlcOperationSignature` → `signPlcOperation` flow.
 *
 * Mailpit API docs: https://mailpit.axllent.org/docs/api-v1/
 */

interface MailpitMessage {
  ID: string;
  Created: string;
  To: Array<{ Address: string }>;
  Subject: string;
}

interface MailpitMessageDetail {
  Text: string;
  HTML: string;
  Subject: string;
}

interface MailpitSearchResult {
  messages: MailpitMessage[];
  messages_count: number;
}

export class MailpitClient {
  constructor(private baseUrl: string) {}

  /**
   * Delete all messages in the Mailpit inbox.
   * Call before tests to avoid stale token interference.
   */
  async clearInbox(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/v1/messages`, {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 200) {
      throw new Error(`Mailpit clearInbox failed (${res.status})`);
    }
  }

  /**
   * Poll for an email matching the given recipient. Returns the plain-text
   * body (or HTML body as fallback). Polls every 500ms.
   *
   * @param to — recipient email address
   * @param opts.timeoutMs — max wait (default 15000)
   * @param opts.afterTimestamp — only consider emails received after this time
   */
  async waitForEmail(
    to: string,
    opts?: { timeoutMs?: number; afterTimestamp?: Date },
  ): Promise<string> {
    const timeout = opts?.timeoutMs ?? 15_000;
    const after = opts?.afterTimestamp ?? new Date(0);
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      const searchRes = await fetch(
        `${this.baseUrl}/api/v1/messages?limit=10`,
      );
      if (!searchRes.ok) {
        throw new Error(`Mailpit search failed (${searchRes.status})`);
      }
      const result = (await searchRes.json()) as MailpitSearchResult;

      const match = result.messages?.find(
        (m) =>
          m.To?.some((t) => t.Address === to) &&
          new Date(m.Created) > after,
      );

      if (match) {
        const detailRes = await fetch(
          `${this.baseUrl}/api/v1/message/${match.ID}`,
        );
        if (!detailRes.ok) {
          throw new Error(
            `Mailpit message fetch failed (${detailRes.status})`,
          );
        }
        const detail = (await detailRes.json()) as MailpitMessageDetail;
        return detail.Text || detail.HTML;
      }

      await new Promise((r) => setTimeout(r, 500));
    }

    throw new Error(
      `No email to ${to} received within ${timeout}ms — check PDS SMTP config`,
    );
  }

  /**
   * Extract the PLC operation confirmation token from a PDS email body.
   *
   * The PDS sends a confirmation code for `requestPlcOperationSignature`.
   * NOTE: The regex pattern below was determined by the Task 2 spike.
   * Update if the PDS email format changes.
   */
  extractPlcToken(emailBody: string): string {
    // The PDS typically sends a token as a standalone code in the email.
    // Pattern determined during prerequisite spike — update after running
    // the spike script in Task 2.
    //
    // Common patterns from @atproto/pds:
    //   - A hyphenated code: "ABCD-1234-EFGH-5678"
    //   - A plain alphanumeric token on its own line
    //
    // This regex matches a sequence of word chars/hyphens that looks like
    // a confirmation token (at least 8 chars, contains hyphens or is 20+).
    const match = emailBody.match(
      /\b([A-Za-z0-9][A-Za-z0-9-]{6,}[A-Za-z0-9])\b/,
    );
    if (!match) {
      throw new Error(
        'Could not extract PLC confirmation token from email body',
      );
    }
    return match[1];
  }
}
```

**IMPORTANT**: The `extractPlcToken` regex above is a starting pattern. After running the Task 2 spike, update the regex to match the actual email format observed. The spike prints the email body — use that to write the exact regex.

- [ ] **Step 4: Update barrel export**

In `packages/federation/src/email/index.ts`, add:

```typescript
export { MailpitClient } from './mailpit-client.js';
```

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @coopsource/federation test -- --run tests/mailpit-client.test.ts
```

Expected: PASS (2 tests — `clearInbox` and `extractPlcToken`). Update the test's email body string and expected token to match the actual format from the spike if needed.

- [ ] **Step 6: Commit**

```bash
git add packages/federation/src/email/mailpit-client.ts packages/federation/src/email/index.ts packages/federation/tests/mailpit-client.test.ts
git commit -m "feat(federation): add MailpitClient for PLC email token extraction"
```

---

## Task 4: Extend provisionCooperative() with PLC Service Entry

Add the email-token PLC update flow to provisioning, gated on `serviceEndpoint`.

**Files:**
- Modify: `packages/federation/src/local/cooperative-provisioning.ts`

- [ ] **Step 1: Add new options to ProvisionCooperativeOptions**

In `packages/federation/src/local/cooperative-provisioning.ts`, add to `ProvisionCooperativeOptions` (after the `description` field):

```typescript
  /** CSN service endpoint URL for the #coopsource PLC entry (e.g. 'https://coopsource.network').
   *  If omitted, no PLC service entry is added (V9.1 behavior). */
  serviceEndpoint?: string;
  /** Mailpit base URL for email token extraction (required when serviceEndpoint is set). */
  mailpitUrl?: string;
```

- [ ] **Step 2: Add the import for MailpitClient**

At the top of the file, add:

```typescript
import { MailpitClient } from '../email/mailpit-client.js';
```

- [ ] **Step 3: Add validation at the top of provisionCooperative()**

After destructuring `options` (after line 107), add:

```typescript
  if (options.serviceEndpoint && !options.mailpitUrl) {
    throw new Error(
      'mailpitUrl is required when serviceEndpoint is set — ' +
      'no production email path exists yet, only Mailpit-based dev/test',
    );
  }
```

- [ ] **Step 4: Resume the agent session after createAccount**

After the `createAccount` call (after line 143), add:

```typescript
  // Resume the session on the agent so it can be used for subsequent
  // authenticated calls (createAppPassword, identity endpoints).
  // AtpAgent does not auto-adopt the createAccount session.
  await agent.resumeSession({
    did: createResult.data.did,
    handle: createResult.data.handle,
    accessJwt: createResult.data.accessJwt,
    refreshJwt: createResult.data.refreshJwt,
    active: true,
  });
```

- [ ] **Step 5: Replace raw fetch for createAppPassword with agent call**

Replace the raw `fetch` call for `createAppPassword` (lines 150-174) with:

```typescript
  // ─── Step 3: Create an app password via the agent session ─────────────
  const appPasswordResult =
    await agent.com.atproto.server.createAppPassword({
      name: 'coopsource-api',
      privileged: true,
    });
  const appPassword = appPasswordResult.data.password;
```

This is cleaner and uses the agent's session management. The agent already has the session from `resumeSession` above.

- [ ] **Step 6: Add the PLC service entry step after DB writes**

After the `auth_credential` insert (after line 202), add:

```typescript
  // ─── Step 5: Add #coopsource service entry to PLC (optional) ─────────
  if (options.serviceEndpoint) {
    const mailpit = new MailpitClient(options.mailpitUrl!);

    // 5a. Get current DID credentials for the defensive services map
    const recommended =
      await agent.com.atproto.identity.getRecommendedDidCredentials();
    const currentServices = (recommended.data.services ?? {}) as Record<
      string,
      { type: string; endpoint: string }
    >;

    // 5b. Request PLC operation signature — PDS emails a confirmation token
    const beforeEmail = new Date();
    await agent.com.atproto.identity.requestPlcOperationSignature();

    // 5c. Extract token from Mailpit
    const emailBody = await mailpit.waitForEmail(email, {
      afterTimestamp: beforeEmail,
    });
    const token = mailpit.extractPlcToken(emailBody);

    // 5d. Sign the PLC operation with defensive services map
    const signResult = await agent.com.atproto.identity.signPlcOperation({
      token,
      services: {
        ...currentServices,
        coopsource: {
          type: 'CoopSourceNetwork',
          endpoint: options.serviceEndpoint,
        },
      },
    });

    // 5e. Submit the signed operation to PLC
    await agent.com.atproto.identity.submitPlcOperation({
      operation: signResult.data.operation,
    });
  }
```

- [ ] **Step 7: Run existing tests to verify backward compatibility**

```bash
pnpm test
```

Expected: All 761+ tests pass. The new code path is only triggered when `serviceEndpoint` is provided, which no existing test does.

- [ ] **Step 8: Commit**

```bash
git add packages/federation/src/local/cooperative-provisioning.ts
git commit -m "feat(federation): add #coopsource PLC service entry to provisionCooperative"
```

---

## Task 5: Integration Test — PLC Service Entry After Provisioning

Validate the end-to-end flow: provision a cooperative with `serviceEndpoint`, verify the DID document contains `#coopsource`.

**Files:**
- Create: `packages/federation/tests/plc-service-entry.test.ts`

- [ ] **Step 1: Write the integration test**

Create `packages/federation/tests/plc-service-entry.test.ts`:

```typescript
/**
 * V9.2.1 validation gate — verifies that provisionCooperative() adds a
 * #coopsource service entry to the cooperative's PLC DID document when
 * serviceEndpoint is provided.
 *
 * Runs under `make test:pds` — the federation global-setup auto-starts
 * PDS + PLC + Mailpit Docker containers.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import {
  Kysely,
  PostgresDialect,
  FileMigrationProvider,
  Migrator,
} from 'kysely';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import type { Database } from '@coopsource/db';
import { provisionCooperative } from '../src/local/cooperative-provisioning.js';
import { PlcClient } from '../src/local/plc-client.js';
import { MailpitClient } from '../src/email/mailpit-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEST_DB_NAME = 'coopsource_v921_plc_test';
const PG_ADMIN_URL = 'postgresql://localhost:5432/postgres';
const TEST_KEY_ENC_KEY = Buffer.alloc(32, 9).toString('base64');

async function createFreshTestDb(): Promise<void> {
  const client = new pg.Client({ connectionString: PG_ADMIN_URL });
  await client.connect();
  try {
    await client.query(
      `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [TEST_DB_NAME],
    );
    await client.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await client.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  } finally {
    await client.end();
  }
}

async function dropTestDb(): Promise<void> {
  const client = new pg.Client({ connectionString: PG_ADMIN_URL });
  await client.connect();
  try {
    await client.query(
      `DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE)`,
    );
  } finally {
    await client.end();
  }
}

function createTestDbHandle(): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({
        connectionString: `postgresql://localhost:5432/${TEST_DB_NAME}`,
        max: 5,
      }),
    }),
  });
}

async function runMigrations(db: Kysely<Database>): Promise<void> {
  const migrationsPath = path.resolve(
    __dirname,
    '../../../packages/db/src/migrations',
  );
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({ fs, path, migrationFolder: migrationsPath }),
  });
  const { error } = await migrator.migrateToLatest();
  if (error) throw error;
}

// ─── The test ──────────────────────────────────────────────────────────────

describe('V9.2.1 validation gate — PLC #coopsource service entry', () => {
  const PDS_URL = process.env.PDS_URL ?? 'http://localhost:2583';
  const PDS_ADMIN_PASSWORD = process.env.PDS_ADMIN_PASSWORD ?? 'admin';
  const PLC_URL = process.env.PLC_URL ?? 'http://localhost:2582';
  const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';
  const SERVICE_ENDPOINT = 'http://localhost:3001';

  let db: Kysely<Database>;
  let plc: PlcClient;
  let coopDid: string;

  beforeAll(async () => {
    await createFreshTestDb();
    db = createTestDbHandle();
    await runMigrations(db);
    plc = new PlcClient(PLC_URL);

    // Clear Mailpit inbox to avoid stale emails from prior test runs
    const mailpit = new MailpitClient(MAILPIT_URL);
    await mailpit.clearInbox();

    // Provision with serviceEndpoint — triggers the PLC service entry flow
    const handle = `plc-gate-${Date.now()}.test`;
    const result = await provisionCooperative({
      db,
      pdsUrl: PDS_URL,
      adminPassword: PDS_ADMIN_PASSWORD,
      keyEncKey: TEST_KEY_ENC_KEY,
      handle,
      displayName: 'V9.2.1 PLC Gate Test',
      description: 'Ephemeral test cooperative — deleted at end of run',
      serviceEndpoint: SERVICE_ENDPOINT,
      mailpitUrl: MAILPIT_URL,
    });
    coopDid = result.did;
  }, 60_000);

  afterAll(async () => {
    if (db) await db.destroy();
    await dropTestDb();
  }, 30_000);

  it('DID document contains #atproto_pds (preserved by defensive map)', async () => {
    const didDoc = (await plc.resolve(coopDid)) as {
      service: Array<{ id: string; type: string; serviceEndpoint: string }>;
    };
    const pdsEntry = didDoc.service?.find((s) => s.id === '#atproto_pds');
    expect(pdsEntry).toBeDefined();
    expect(pdsEntry!.type).toBe('AtprotoPersonalDataServer');
  });

  it('DID document contains #coopsource with correct type and endpoint', async () => {
    const didDoc = (await plc.resolve(coopDid)) as {
      service: Array<{ id: string; type: string; serviceEndpoint: string }>;
    };
    const csEntry = didDoc.service?.find((s) => s.id === '#coopsource');
    expect(csEntry).toBeDefined();
    expect(csEntry!.type).toBe('CoopSourceNetwork');
    expect(csEntry!.serviceEndpoint).toBe(SERVICE_ENDPOINT);
  });

  it('entity row was written (provisioning completed fully)', async () => {
    const entity = await db
      .selectFrom('entity')
      .where('did', '=', coopDid)
      .select(['did', 'type', 'status'])
      .executeTakeFirst();
    expect(entity).toBeDefined();
    expect(entity!.type).toBe('cooperative');
    expect(entity!.status).toBe('active');
  });
});
```

- [ ] **Step 2: Run the integration test**

```bash
make test:pds
```

Expected: All federation tests pass, including the new `plc-service-entry.test.ts` (3 assertions).

- [ ] **Step 3: Run the full test suite for regression**

```bash
pnpm test
```

Expected: All 761+ tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/federation/tests/plc-service-entry.test.ts
git commit -m "test(federation): V9.2.1 validation gate — PLC #coopsource service entry"
```

---

## Task 6: Cleanup + Documentation

Fix the stale comment in the V9.1 test, update ARCHITECTURE-V9.md, and verify everything.

**Files:**
- Modify: `packages/federation/tests/coop-write-auth-mode.test.ts:1-38`
- Modify: `ARCHITECTURE-V9.md`

- [ ] **Step 1: Fix stale comment in coop-write-auth-mode.test.ts**

Replace the JSDoc comment at the top of `packages/federation/tests/coop-write-auth-mode.test.ts` (lines 1-38). The existing comment incorrectly says provisioning "Registers the DID in PLC with the signing key as `verificationMethods.atproto` and a `#coopsource` service entry." Replace lines 8-18 with:

```typescript
 *   2. Provisions a test cooperative via `provisionCooperative()` — the
 *      same library function `apps/api/scripts/provision-cooperative.ts`
 *      uses. Provisioning:
 *        - Creates an account on the PDS via `createAccount` (PDS
 *          generates keys and registers DID in PLC).
 *        - Creates a privileged app password via
 *          `com.atproto.server.createAppPassword` and stores it
 *          encrypted in `auth_credential`.
 *        - Optionally (V9.2.1+, when `serviceEndpoint` is provided)
 *          adds a `#coopsource` service entry to the DID document via
 *          the PDS identity email-token flow.
```

- [ ] **Step 2: Update ARCHITECTURE-V9.md phase table**

In `ARCHITECTURE-V9.md`, update the V9.2.1 entry in the phase table. Find:

```
| V9.2 | Governance AppView API | Immediate | Shipped — 4 XRPC query endpoints, shared dispatcher |
```

And add after it (or update the existing followup sub-phases note):

```
| V9.2.1 | PLC service entry | Immediate | Shipped — `#coopsource` / `CoopSourceNetwork` in cooperative DID docs |
```

- [ ] **Step 3: Final verification**

```bash
pnpm test && make test:pds
```

Expected: All tests pass (761+ unit/integration + federation PDS tests).

- [ ] **Step 4: Commit**

```bash
git add packages/federation/tests/coop-write-auth-mode.test.ts ARCHITECTURE-V9.md
git commit -m "docs(v9): update ARCHITECTURE-V9.md — V9.2.1 shipped, fix stale test comment"
```

---

## Verification Checklist

After all tasks are complete:

- [ ] `pnpm test` — all tests pass (761+ existing + new MailpitClient + PLC service entry tests)
- [ ] `make test:pds` — federation tests pass including V9.2.1 validation gate
- [ ] `git log --oneline` — 5 clean commits on `feature/v9.2.1-plc-service-entry`
- [ ] Manual spot-check (optional): `curl http://localhost:2582/{did}` shows `#coopsource` in services
