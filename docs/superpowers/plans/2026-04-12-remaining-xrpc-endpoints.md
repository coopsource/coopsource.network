# V9.2.3 Remaining XRPC Query Endpoints -- Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 3 XRPC query endpoints (listMembers, getVoteEligibility, getOfficers) with a DB migration for directory visibility and an optional-auth dispatcher mode, completing the endpoint surface needed by V9.3 Inlay governance components.

**Architecture:** Extends the existing XRPC dispatcher (`apps/api/src/xrpc/dispatcher.ts`) with a new `'optional'` auth mode that resolves viewer identity without 401ing. Three new handler files follow the established pattern of importing `XrpcContext` and calling `assertOpenGovernance`. The `listMembers` handler applies three-tier privacy filtering in the handler layer (not the service layer), keeping the membership service reusable. The `directory_visible` column is added to the existing disposable migration file.

**Tech Stack:** TypeScript (strict), Express, Kysely (PostgreSQL), ATProto Lexicons, Vitest, Supertest

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/db/src/migrations/005_membership.ts` | Modify (line 66) | Add `directory_visible` boolean column |
| `packages/db/src/schema.ts` | Modify (line 187) | Add `directory_visible` to `MembershipTable` |
| `apps/api/src/services/membership-service.ts` | Modify (lines 13-20, 40-46) | Add `directoryVisible` to `MemberWithRoles`, select it in queries |
| `apps/api/src/xrpc/dispatcher.ts` | Modify (lines 11, 78-86) | Add `'optional'` auth mode |
| `packages/lexicons/network/coopsource/admin/getOfficers.json` | Create | Lexicon schema |
| `packages/lexicons/network/coopsource/org/listMembers.json` | Create | Lexicon schema |
| `packages/lexicons/network/coopsource/governance/getVoteEligibility.json` | Create | Lexicon schema |
| `apps/api/src/xrpc/handlers/get-officers.ts` | Create | Handler |
| `apps/api/src/xrpc/handlers/list-members.ts` | Create | Handler with three-tier privacy |
| `apps/api/src/xrpc/handlers/get-vote-eligibility.ts` | Create | Handler |
| `apps/api/src/xrpc/index.ts` | Modify | Register 3 new handlers |
| `apps/api/tests/xrpc-officers.test.ts` | Create | Integration tests |
| `apps/api/tests/xrpc-list-members.test.ts` | Create | Integration tests |
| `apps/api/tests/xrpc-vote-eligibility.test.ts` | Create | Integration tests |
| `packages/lexicons/tests/lexicons.test.ts` | Modify | Update schema count 40 -> 43 |
| `ARCHITECTURE-V9.md` | Modify | Mark V9.2.3 shipped |

---

### Task 1: DB Migration + Schema Type

**Files:**
- Modify: `packages/db/src/migrations/005_membership.ts:66` (add column after `status_reason`)
- Modify: `packages/db/src/schema.ts:187` (add type after `status_reason`)
- Modify: `apps/api/src/services/membership-service.ts:13-20,40-46,77-84,105-111` (add `directoryVisible` to interface and queries)

- [ ] **Step 1: Add `directory_visible` column to migration**

In `packages/db/src/migrations/005_membership.ts`, add the following line after `.addColumn('status_reason', 'text')` (line 66) and before `.addColumn('created_at', ...)` (line 67):

```typescript
    .addColumn('directory_visible', 'boolean', (col) => col.notNull().defaultTo(false))
```

- [ ] **Step 2: Add `directory_visible` to `MembershipTable` type**

In `packages/db/src/schema.ts`, add the following line after `status_reason: string | null;` (line 187) and before `created_at`:

```typescript
  directory_visible: ColumnType<boolean, boolean | undefined, boolean>;
```

- [ ] **Step 3: Add `directoryVisible` to `MemberWithRoles` interface**

In `apps/api/src/services/membership-service.ts`, update the `MemberWithRoles` interface (lines 13-20) to:

```typescript
export interface MemberWithRoles {
  did: string;
  displayName: string;
  status: string;
  roles: string[];
  membershipId: string;
  joinedAt: Date | null;
  directoryVisible: boolean;
}
```

- [ ] **Step 4: Select `directory_visible` in `listMembers` query**

In `apps/api/src/services/membership-service.ts`, update the `.select([...])` array in `listMembers` (around line 40) to include:

```typescript
      .select([
        'membership.id',
        'membership.member_did',
        'membership.status',
        'membership.joined_at',
        'membership.created_at',
        'membership.directory_visible',
        'entity.display_name',
      ])
```

And update the item mapping (around line 77) to include `directoryVisible`:

```typescript
      items.push({
        did: row.member_did,
        displayName: row.display_name,
        status: row.status,
        roles: roleRows.map((r) => r.role),
        membershipId: row.id,
        joinedAt: row.joined_at,
        directoryVisible: row.directory_visible,
      });
```

- [ ] **Step 5: Select `directory_visible` in `getMember` query**

In `apps/api/src/services/membership-service.ts`, update the `.select([...])` array in `getMember` (around line 105) to include:

```typescript
      .select([
        'membership.id',
        'membership.member_did',
        'membership.status',
        'membership.joined_at',
        'membership.directory_visible',
        'entity.display_name',
      ])
```

And update the return object (around line 122) to include `directoryVisible`:

```typescript
    return {
      did: row.member_did,
      displayName: row.display_name,
      status: row.status,
      roles: roleRows.map((r) => r.role),
      membershipId: row.id,
      joinedAt: row.joined_at,
      directoryVisible: row.directory_visible,
    };
```

- [ ] **Step 6: Verify DB migration applies cleanly**

Run: `pnpm --filter @coopsource/db build`
Expected: Build succeeds with no TypeScript errors.

Then run: `pnpm test -- --filter @coopsource/api`
Expected: Existing tests still pass (the new column has a default value, so nothing breaks).

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/migrations/005_membership.ts packages/db/src/schema.ts apps/api/src/services/membership-service.ts
git commit -m "feat(db): add directory_visible column to membership table

Privacy on by default -- members opt in to appearing in the public
directory. Adds column to migration 005, MembershipTable type, and
MemberWithRoles interface."
```

---

### Task 2: Dispatcher Optional Auth

**Files:**
- Modify: `apps/api/src/xrpc/dispatcher.ts:11,78-86`

**Important implementation note:** The `requireViewer` Express middleware sends `res.status(401).json(...)` directly on failure and never calls `next()`. This means the Promise wrapper used for `auth: 'viewer'` would hang forever on auth failure -- it only resolves when `next()` is called. For `optional` auth, we cannot wrap `requireViewer` in try/catch. Instead, we must replicate the viewer lookup logic directly: check `req.session?.did`, look up the entity, and set `req.viewer` if found -- without sending any 401 response on failure.

The DB reference needed for the entity lookup is available indirectly through `container.db` (passed to `createXrpcRoutes`). However, the auth check runs before the handler context is built. The cleanest approach is to perform the optional viewer resolution inline in the dispatcher, using the `container.db` that `createXrpcRoutes` already closes over.

- [ ] **Step 1: Update auth type union**

In `apps/api/src/xrpc/dispatcher.ts`, change line 11 from:

```typescript
  auth: 'none' | 'viewer';
```

to:

```typescript
  auth: 'none' | 'viewer' | 'optional';
```

- [ ] **Step 2: Add optional auth handling**

In `apps/api/src/xrpc/dispatcher.ts`, after the `if (handler.auth === 'viewer')` block (line 86) and before the rate limiting section, add the `optional` auth block. The full auth section (lines 78-86+) should become:

```typescript
      // Auth: run requireViewer if needed
      if (handler.auth === 'viewer') {
        await new Promise<void>((resolve, reject) => {
          requireViewer(req, res, (err?: unknown) =>
            err ? reject(err) : resolve(),
          );
        });
        if (res.headersSent) return;
      }

      // Optional auth: resolve viewer if session exists, but don't 401 on failure.
      // We cannot reuse requireViewer here because it sends a 401 response
      // directly (never calling next()), which would leave the Promise hanging.
      if (handler.auth === 'optional') {
        const did = req.session?.did;
        if (did) {
          const entity = await container.db
            .selectFrom('entity')
            .where('did', '=', did)
            .where('status', '=', 'active')
            .select(['did', 'display_name'])
            .executeTakeFirst();
          if (entity) {
            req.viewer = {
              did: entity.did,
              displayName: entity.display_name,
            };
          }
        }
      }
```

- [ ] **Step 3: Verify build**

Run: `pnpm --filter @coopsource/api build`
Expected: Build succeeds.

Run: `pnpm --filter @coopsource/api test`
Expected: All existing tests pass (no behavior changed for existing `'none'` and `'viewer'` handlers).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/xrpc/dispatcher.ts
git commit -m "feat(xrpc): add optional auth mode to dispatcher

Resolves viewer identity from session when present, but does not
401 when missing. Needed for listMembers three-tier visibility."
```

---

### Task 3: Lexicon Schemas (All 3 JSON Files)

**Files:**
- Create: `packages/lexicons/network/coopsource/admin/getOfficers.json`
- Create: `packages/lexicons/network/coopsource/org/listMembers.json`
- Create: `packages/lexicons/network/coopsource/governance/getVoteEligibility.json`

All lexicons follow the pattern established in `packages/lexicons/network/coopsource/org/getMembership.json` and `packages/lexicons/network/coopsource/governance/listProposals.json`.

- [ ] **Step 1: Create `getOfficers.json`**

Create file `packages/lexicons/network/coopsource/admin/getOfficers.json`:

```json
{
  "lexicon": 1,
  "id": "network.coopsource.admin.getOfficers",
  "defs": {
    "main": {
      "type": "query",
      "description": "Get current officers of an open-governance cooperative.",
      "parameters": {
        "type": "params",
        "required": ["cooperative"],
        "properties": {
          "cooperative": {
            "type": "string",
            "format": "did",
            "description": "DID of the cooperative whose officers to list."
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": ["officers"],
          "properties": {
            "officers": {
              "type": "array",
              "items": {
                "type": "ref",
                "ref": "#officer"
              }
            }
          }
        }
      }
    },
    "officer": {
      "type": "object",
      "required": ["did", "title", "appointedAt"],
      "properties": {
        "did": {
          "type": "string",
          "format": "did"
        },
        "displayName": {
          "type": "string"
        },
        "title": {
          "type": "string"
        },
        "appointedAt": {
          "type": "string",
          "format": "datetime"
        },
        "termEndsAt": {
          "type": "string",
          "format": "datetime"
        }
      }
    }
  }
}
```

- [ ] **Step 2: Create `listMembers.json`**

Create file `packages/lexicons/network/coopsource/org/listMembers.json`:

```json
{
  "lexicon": 1,
  "id": "network.coopsource.org.listMembers",
  "defs": {
    "main": {
      "type": "query",
      "description": "List members of an open-governance cooperative with cursor-based pagination. Visibility depends on caller: unauthenticated callers see only directory-visible members; authenticated non-members see all members but private ones are redacted; fellow members see full detail.",
      "parameters": {
        "type": "params",
        "required": ["cooperative"],
        "properties": {
          "cooperative": {
            "type": "string",
            "format": "did",
            "description": "DID of the cooperative whose members to list."
          },
          "limit": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100,
            "default": 50
          },
          "cursor": {
            "type": "string"
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": ["members"],
          "properties": {
            "members": {
              "type": "array",
              "items": {
                "type": "ref",
                "ref": "#member"
              }
            },
            "cursor": {
              "type": "string"
            }
          }
        }
      }
    },
    "member": {
      "type": "object",
      "required": ["did", "private"],
      "properties": {
        "did": {
          "type": "string",
          "format": "did"
        },
        "displayName": {
          "type": "string"
        },
        "roles": {
          "type": "array",
          "items": { "type": "string" }
        },
        "joinedAt": {
          "type": "string",
          "format": "datetime"
        },
        "private": {
          "type": "boolean",
          "description": "Whether this member's details are redacted due to directory visibility settings."
        }
      }
    }
  }
}
```

- [ ] **Step 3: Create `getVoteEligibility.json`**

Create file `packages/lexicons/network/coopsource/governance/getVoteEligibility.json`:

```json
{
  "lexicon": 1,
  "id": "network.coopsource.governance.getVoteEligibility",
  "defs": {
    "main": {
      "type": "query",
      "description": "Check the authenticated viewer's eligibility to vote on a governance proposal. Returns weight (including delegated votes) and whether the viewer has already voted.",
      "parameters": {
        "type": "params",
        "required": ["proposal"],
        "properties": {
          "proposal": {
            "type": "string",
            "description": "Proposal UUID."
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": ["eligible", "weight", "hasVoted"],
          "properties": {
            "eligible": {
              "type": "boolean"
            },
            "weight": {
              "type": "integer",
              "description": "Vote weight including delegated votes. 0 when ineligible."
            },
            "hasVoted": {
              "type": "boolean"
            },
            "reason": {
              "type": "string",
              "description": "Reason for ineligibility, if applicable.",
              "knownValues": ["not_active_member", "proposal_not_voting", "already_voted"]
            }
          }
        }
      }
    }
  }
}
```

- [ ] **Step 4: Verify lexicons parse correctly**

Run: `pnpm --filter @coopsource/lexicons lex:generate`

This outputs TypeScript to `packages/lexicons/src/generated/lexicons.ts`. The output may contain warning lines before the TypeScript code. If so, edit `packages/lexicons/src/generated/lexicons.ts` to remove any non-TypeScript warning lines at the top.

Then build: `pnpm --filter @coopsource/lexicons build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add packages/lexicons/network/coopsource/admin/getOfficers.json packages/lexicons/network/coopsource/org/listMembers.json packages/lexicons/network/coopsource/governance/getVoteEligibility.json packages/lexicons/src/generated/lexicons.ts
git commit -m "feat(lexicons): add getOfficers, listMembers, getVoteEligibility schemas

Three query lexicons for V9.2.3. listMembers uses a member def with
a private flag for redacted entries. getVoteEligibility uses integer
weight (ATProto has no number type)."
```

---

### Task 4: `getOfficers` Handler + Tests

This is the simplest endpoint: no auth, no privacy filtering, no pagination.

**Files:**
- Create: `apps/api/src/xrpc/handlers/get-officers.ts`
- Create: `apps/api/tests/xrpc-officers.test.ts`

**Important context:**
- `officerRecordService.getCurrent(cooperativeDid)` returns `Selectable<AdminOfficerTable>[]` -- these rows have `officer_did` and `title` but NOT `displayName`. The handler must join entity data itself or do a separate lookup.
- `AdminOfficerTable` has: `id`, `uri`, `cid`, `cooperative_did`, `officer_did`, `title`, `appointed_at`, `term_ends_at`, `appointment_type`, `responsibilities`, `status`, `created_at`, `indexed_at`, `invalidated_at`.
- The simplest approach: call `getCurrent()` to get officer rows, then batch-look up display names from the `entity` table.

- [ ] **Step 1: Write the test file**

Create `apps/api/tests/xrpc-officers.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin, type TestApp } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('network.coopsource.admin.getOfficers', () => {
  let testApp: TestApp;
  let coopDid: string;
  let adminDid: string;

  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
    testApp = createTestApp();
    const setup = await setupAndLogin(testApp);
    coopDid = setup.coopDid;
    adminDid = setup.adminDid;
  });

  it('returns empty officers list when none appointed', async () => {
    const res = await testApp.agent
      .get('/xrpc/network.coopsource.admin.getOfficers')
      .query({ cooperative: coopDid })
      .expect(200);

    expect(res.body.officers).toEqual([]);
  });

  it('returns current officers with display name', async () => {
    const now = new Date();
    const termEnds = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

    await testApp.container.officerRecordService.appoint(coopDid, {
      officerDid: adminDid,
      title: 'President',
      appointedAt: now.toISOString(),
      termEndsAt: termEnds.toISOString(),
      appointmentType: 'elected',
    });

    const res = await testApp.agent
      .get('/xrpc/network.coopsource.admin.getOfficers')
      .query({ cooperative: coopDid })
      .expect(200);

    expect(res.body.officers).toHaveLength(1);
    expect(res.body.officers[0]).toMatchObject({
      did: adminDid,
      displayName: 'Test Admin',
      title: 'President',
    });
    expect(res.body.officers[0].appointedAt).toBeDefined();
    expect(res.body.officers[0].termEndsAt).toBeDefined();
  });

  it('does not include ended officers', async () => {
    const officer = await testApp.container.officerRecordService.appoint(coopDid, {
      officerDid: adminDid,
      title: 'Secretary',
      appointedAt: new Date().toISOString(),
      appointmentType: 'appointed',
    });

    await testApp.container.officerRecordService.endTerm(officer.id, coopDid);

    const res = await testApp.agent
      .get('/xrpc/network.coopsource.admin.getOfficers')
      .query({ cooperative: coopDid })
      .expect(200);

    expect(res.body.officers).toEqual([]);
  });

  it('returns 404 for closed-governance cooperative', async () => {
    await testApp.container.db
      .updateTable('cooperative_profile')
      .set({ governance_visibility: 'closed' })
      .where('entity_did', '=', coopDid)
      .execute();

    await testApp.agent
      .get('/xrpc/network.coopsource.admin.getOfficers')
      .query({ cooperative: coopDid })
      .expect(404);
  });

  it('does not require authentication', async () => {
    const bare = supertest(testApp.app);
    const res = await bare
      .get('/xrpc/network.coopsource.admin.getOfficers')
      .query({ cooperative: coopDid })
      .expect(200);

    expect(res.body.officers).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @coopsource/api test -- xrpc-officers`
Expected: FAIL -- handler not found (404 MethodNotFound for all tests).

- [ ] **Step 3: Write the handler**

Create `apps/api/src/xrpc/handlers/get-officers.ts`:

```typescript
import type { XrpcContext } from '../dispatcher.js';
import { assertOpenGovernance } from './open-governance-gate.js';

export async function handleGetOfficers(ctx: XrpcContext): Promise<unknown> {
  const cooperativeDid = ctx.params.cooperative as string;
  await assertOpenGovernance(ctx.container.db, cooperativeDid);

  const officers = await ctx.container.officerRecordService.getCurrent(cooperativeDid);

  // Batch look up display names from entity table
  const officerDids = officers.map((o) => o.officer_did);
  const entities = officerDids.length > 0
    ? await ctx.container.db
        .selectFrom('entity')
        .where('did', 'in', officerDids)
        .select(['did', 'display_name'])
        .execute()
    : [];
  const nameMap = new Map(entities.map((e) => [e.did, e.display_name]));

  return {
    officers: officers.map((o) => ({
      did: o.officer_did,
      displayName: nameMap.get(o.officer_did) ?? undefined,
      title: o.title,
      appointedAt: o.appointed_at instanceof Date
        ? o.appointed_at.toISOString()
        : o.appointed_at,
      termEndsAt: o.term_ends_at
        ? (o.term_ends_at instanceof Date
            ? o.term_ends_at.toISOString()
            : o.term_ends_at)
        : undefined,
    })),
  };
}
```

- [ ] **Step 4: Register the handler**

In `apps/api/src/xrpc/index.ts`, add the import at the top:

```typescript
import { handleGetOfficers } from './handlers/get-officers.js';
```

Add the handler registration before the `com.atproto.label.queryLabels` entry:

```typescript
  handlers.set('network.coopsource.admin.getOfficers', {
    auth: 'none',
    rateLimit: { windowMs: FIFTEEN_MINUTES, limit: 60 },
    handler: handleGetOfficers,
  });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @coopsource/api test -- xrpc-officers`
Expected: All 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/xrpc/handlers/get-officers.ts apps/api/src/xrpc/index.ts apps/api/tests/xrpc-officers.test.ts
git commit -m "feat(xrpc): add getOfficers endpoint

Public endpoint returning current officers with display names.
No auth required, sorted by title, filters out ended terms."
```

---

### Task 5: `listMembers` Handler + Tests

This is the most complex endpoint: optional auth with three-tier privacy filtering.

**Files:**
- Create: `apps/api/src/xrpc/handlers/list-members.ts`
- Create: `apps/api/tests/xrpc-list-members.test.ts`

**Key design decisions:**
- The service `listMembers()` returns ALL members (including `directoryVisible` flag). Privacy filtering happens in the handler based on caller context.
- For unauthenticated callers: only `directoryVisible=true` members are returned at all.
- For authenticated non-members: all members returned, but `directoryVisible=false` ones are redacted to `{ did, joinedAt, private: true }`.
- For authenticated fellow members: all members with full detail.
- The service already filters to `invalidated_at IS NULL` but does NOT filter by `status`. The handler should only return `status='active'` members for the directory.

- [ ] **Step 1: Write the test file**

Create `apps/api/tests/xrpc-list-members.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin, type TestApp } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('network.coopsource.org.listMembers', () => {
  let testApp: TestApp;
  let coopDid: string;
  let adminDid: string;

  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
    testApp = createTestApp();
    const setup = await setupAndLogin(testApp);
    coopDid = setup.coopDid;
    adminDid = setup.adminDid;
  });

  /** Helper: insert a second member directly into the DB. */
  async function insertMember(opts: {
    did: string;
    displayName: string;
    directoryVisible: boolean;
  }) {
    const now = new Date();
    await testApp.container.db
      .insertInto('entity')
      .values({
        did: opts.did,
        type: 'person',
        display_name: opts.displayName,
        status: 'active',
        created_at: now,
        indexed_at: now,
      })
      .onConflict((oc) => oc.column('did').doNothing())
      .execute();

    await testApp.container.db
      .insertInto('membership')
      .values({
        member_did: opts.did,
        cooperative_did: coopDid,
        status: 'active',
        directory_visible: opts.directoryVisible,
        joined_at: now,
        created_at: now,
        indexed_at: now,
      })
      .execute();
  }

  describe('unauthenticated (no session)', () => {
    it('returns only directory-visible members', async () => {
      // Admin is directory_visible=false by default.
      // Add a visible member.
      await insertMember({
        did: 'did:plc:visible1',
        displayName: 'Visible Alice',
        directoryVisible: true,
      });

      const bare = supertest(testApp.app);
      const res = await bare
        .get('/xrpc/network.coopsource.org.listMembers')
        .query({ cooperative: coopDid })
        .expect(200);

      // Should only see the visible member, not the admin
      expect(res.body.members).toHaveLength(1);
      expect(res.body.members[0]).toMatchObject({
        did: 'did:plc:visible1',
        displayName: 'Visible Alice',
        private: false,
      });
    });

    it('returns empty list when no directory-visible members', async () => {
      const bare = supertest(testApp.app);
      const res = await bare
        .get('/xrpc/network.coopsource.org.listMembers')
        .query({ cooperative: coopDid })
        .expect(200);

      expect(res.body.members).toEqual([]);
    });
  });

  describe('authenticated non-member', () => {
    it('returns all members but redacts private ones', async () => {
      // Create a second cooperative with its own auth
      const otherCoopDid = 'did:web:other-coop.test';
      const now = new Date();
      await testApp.container.db
        .insertInto('entity')
        .values({
          did: otherCoopDid,
          type: 'cooperative',
          display_name: 'Other Coop',
          status: 'active',
          created_at: now,
          indexed_at: now,
        })
        .execute();
      await testApp.container.db
        .insertInto('cooperative_profile')
        .values({
          entity_did: otherCoopDid,
          cooperative_type: 'worker',
          membership_policy: 'open',
          governance_visibility: 'open',
          is_network: false,
          anon_discoverable: true,
          public_description: true,
          public_members: false,
          public_activity: false,
          public_agreements: false,
          public_campaigns: false,
        })
        .execute();

      // Add members to the other coop (admin is NOT a member of otherCoop)
      await testApp.container.db
        .insertInto('entity')
        .values({
          did: 'did:plc:othermember1',
          type: 'person',
          display_name: 'Public Bob',
          status: 'active',
          created_at: now,
          indexed_at: now,
        })
        .execute();
      await testApp.container.db
        .insertInto('membership')
        .values({
          member_did: 'did:plc:othermember1',
          cooperative_did: otherCoopDid,
          status: 'active',
          directory_visible: true,
          joined_at: now,
          created_at: now,
          indexed_at: now,
        })
        .execute();
      await testApp.container.db
        .insertInto('entity')
        .values({
          did: 'did:plc:othermember2',
          type: 'person',
          display_name: 'Private Carol',
          status: 'active',
          created_at: now,
          indexed_at: now,
        })
        .execute();
      await testApp.container.db
        .insertInto('membership')
        .values({
          member_did: 'did:plc:othermember2',
          cooperative_did: otherCoopDid,
          status: 'active',
          directory_visible: false,
          joined_at: now,
          created_at: now,
          indexed_at: now,
        })
        .execute();

      // Authenticated admin is NOT a member of otherCoop
      const res = await testApp.agent
        .get('/xrpc/network.coopsource.org.listMembers')
        .query({ cooperative: otherCoopDid })
        .expect(200);

      expect(res.body.members).toHaveLength(2);

      const publicMember = res.body.members.find(
        (m: { did: string }) => m.did === 'did:plc:othermember1',
      );
      expect(publicMember).toMatchObject({
        did: 'did:plc:othermember1',
        displayName: 'Public Bob',
        private: false,
      });

      const privateMember = res.body.members.find(
        (m: { did: string }) => m.did === 'did:plc:othermember2',
      );
      expect(privateMember).toMatchObject({
        did: 'did:plc:othermember2',
        private: true,
      });
      expect(privateMember.displayName).toBeUndefined();
      expect(privateMember.roles).toBeUndefined();
    });
  });

  describe('authenticated fellow member', () => {
    it('returns all members with full detail regardless of directory_visible', async () => {
      // Add a private member to admin's own coop
      await insertMember({
        did: 'did:plc:privatefellow',
        displayName: 'Private Fellow',
        directoryVisible: false,
      });

      // Admin IS a member of coopDid
      const res = await testApp.agent
        .get('/xrpc/network.coopsource.org.listMembers')
        .query({ cooperative: coopDid })
        .expect(200);

      // Should see both admin and the private fellow, with full detail
      expect(res.body.members).toHaveLength(2);

      const fellow = res.body.members.find(
        (m: { did: string }) => m.did === 'did:plc:privatefellow',
      );
      expect(fellow).toMatchObject({
        did: 'did:plc:privatefellow',
        displayName: 'Private Fellow',
        private: false,
      });
    });
  });

  describe('pagination', () => {
    it('paginates with cursor and respects limit', async () => {
      // Add 3 members (+ admin = 4 total)
      // Make all directory_visible so unauthenticated tests are simpler
      await testApp.container.db
        .updateTable('membership')
        .set({ directory_visible: true })
        .where('cooperative_did', '=', coopDid)
        .execute();

      for (let i = 1; i <= 3; i++) {
        testApp.clock.advance(1000);
        await insertMember({
          did: `did:plc:pagmember${i}`,
          displayName: `Member ${i}`,
          directoryVisible: true,
        });
      }

      const page1 = await testApp.agent
        .get('/xrpc/network.coopsource.org.listMembers')
        .query({ cooperative: coopDid, limit: 2 })
        .expect(200);

      expect(page1.body.members).toHaveLength(2);
      expect(page1.body.cursor).toBeDefined();

      const page2 = await testApp.agent
        .get('/xrpc/network.coopsource.org.listMembers')
        .query({ cooperative: coopDid, limit: 2, cursor: page1.body.cursor })
        .expect(200);

      expect(page2.body.members).toHaveLength(2);

      // Collect all DIDs across pages -- should have 4 unique members
      const allDids = [
        ...page1.body.members.map((m: { did: string }) => m.did),
        ...page2.body.members.map((m: { did: string }) => m.did),
      ];
      expect(new Set(allDids).size).toBe(4);
    });
  });

  it('returns 404 for closed-governance cooperative', async () => {
    await testApp.container.db
      .updateTable('cooperative_profile')
      .set({ governance_visibility: 'closed' })
      .where('entity_did', '=', coopDid)
      .execute();

    await testApp.agent
      .get('/xrpc/network.coopsource.org.listMembers')
      .query({ cooperative: coopDid })
      .expect(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @coopsource/api test -- xrpc-list-members`
Expected: FAIL -- handler not found.

- [ ] **Step 3: Write the handler**

Create `apps/api/src/xrpc/handlers/list-members.ts`:

```typescript
import type { XrpcContext } from '../dispatcher.js';
import { assertOpenGovernance } from './open-governance-gate.js';

export async function handleListMembers(ctx: XrpcContext): Promise<unknown> {
  const cooperativeDid = ctx.params.cooperative as string;
  await assertOpenGovernance(ctx.container.db, cooperativeDid);

  const limit = (ctx.params.limit as number | undefined) ?? 50;
  const cursor = ctx.params.cursor as string | undefined;

  const result = await ctx.container.membershipService.listMembers(
    cooperativeDid,
    { limit, cursor },
  );

  // Only include active members in the directory
  const activeMembers = result.items.filter((m) => m.status === 'active');

  // Determine caller context for three-tier privacy
  const viewer = ctx.viewer;
  let isFellowMember = false;

  if (viewer) {
    const viewerMembership = await ctx.container.membershipService.getMember(
      cooperativeDid,
      viewer.did,
    );
    isFellowMember = viewerMembership?.status === 'active';
  }

  const members = activeMembers
    .filter((m) => {
      // Tier 1 (no auth): only directory-visible members
      if (!viewer) return m.directoryVisible;
      // Tier 2 & 3 (authed): all members visible
      return true;
    })
    .map((m) => {
      // Tier 3 (fellow member) or directory-visible: full detail
      if (isFellowMember || m.directoryVisible) {
        return {
          did: m.did,
          displayName: m.displayName,
          roles: m.roles,
          joinedAt: m.joinedAt
            ? (m.joinedAt instanceof Date
                ? m.joinedAt.toISOString()
                : m.joinedAt)
            : undefined,
          private: false,
        };
      }

      // Tier 2 (authed non-member, private member): redacted
      return {
        did: m.did,
        joinedAt: m.joinedAt
          ? (m.joinedAt instanceof Date
              ? m.joinedAt.toISOString()
              : m.joinedAt)
          : undefined,
        private: true,
      };
    });

  return {
    members,
    cursor: result.cursor,
  };
}
```

- [ ] **Step 4: Register the handler**

In `apps/api/src/xrpc/index.ts`, add the import:

```typescript
import { handleListMembers } from './handlers/list-members.js';
```

Add the handler registration (after the `getMembership` entry):

```typescript
  handlers.set('network.coopsource.org.listMembers', {
    auth: 'optional',
    rateLimit: { windowMs: FIFTEEN_MINUTES, limit: 60 },
    handler: handleListMembers,
  });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @coopsource/api test -- xrpc-list-members`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/xrpc/handlers/list-members.ts apps/api/src/xrpc/index.ts apps/api/tests/xrpc-list-members.test.ts
git commit -m "feat(xrpc): add listMembers endpoint with three-tier privacy

Unauthenticated: directory-visible members only. Authenticated
non-member: all members with private ones redacted. Fellow member:
full detail for everyone."
```

---

### Task 6: `getVoteEligibility` Handler + Tests

**Files:**
- Create: `apps/api/src/xrpc/handlers/get-vote-eligibility.ts`
- Create: `apps/api/tests/xrpc-vote-eligibility.test.ts`

**Key context:**
- Proposal statuses in the DB are: `'draft', 'open', 'closed', 'resolved', 'withdrawn'`. The voting phase is `'open'` (not `'voting'`). The `reason` field should still say `proposal_not_voting` for clarity.
- Active votes have `retracted_at IS NULL`.
- `delegationVotingService.calculateVoteWeight()` returns a number (1 = own vote only, >1 includes delegations).
- Auth is `'viewer'` (required) -- unauthenticated returns 401.

- [ ] **Step 1: Write the test file**

Create `apps/api/tests/xrpc-vote-eligibility.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin, type TestApp } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('network.coopsource.governance.getVoteEligibility', () => {
  let testApp: TestApp;
  let coopDid: string;
  let adminDid: string;

  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
    testApp = createTestApp();
    const setup = await setupAndLogin(testApp);
    coopDid = setup.coopDid;
    adminDid = setup.adminDid;
  });

  /** Helper: create and open a proposal for voting. */
  async function createOpenProposal() {
    const createRes = await testApp.agent
      .post('/api/v1/proposals')
      .send({
        title: 'Eligibility test proposal',
        body: 'Test body.',
        votingType: 'binary',
        quorumType: 'simpleMajority',
      })
      .expect(201);

    await testApp.agent
      .post(`/api/v1/proposals/${createRes.body.id}/open`)
      .expect(200);

    return createRes.body.id as string;
  }

  it('returns eligible with weight for active member on open proposal', async () => {
    const proposalId = await createOpenProposal();

    const res = await testApp.agent
      .get('/xrpc/network.coopsource.governance.getVoteEligibility')
      .query({ proposal: proposalId })
      .expect(200);

    expect(res.body).toMatchObject({
      eligible: true,
      weight: 1,
      hasVoted: false,
    });
    expect(res.body.reason).toBeUndefined();
  });

  it('returns ineligible with reason when proposal is not open for voting', async () => {
    // Create a draft proposal (not opened)
    const createRes = await testApp.agent
      .post('/api/v1/proposals')
      .send({
        title: 'Draft proposal',
        body: 'Not open yet.',
        votingType: 'binary',
        quorumType: 'simpleMajority',
      })
      .expect(201);

    const res = await testApp.agent
      .get('/xrpc/network.coopsource.governance.getVoteEligibility')
      .query({ proposal: createRes.body.id })
      .expect(200);

    expect(res.body).toMatchObject({
      eligible: false,
      weight: 0,
      hasVoted: false,
      reason: 'proposal_not_voting',
    });
  });

  it('returns hasVoted true after casting a vote', async () => {
    const proposalId = await createOpenProposal();

    // Cast a vote
    await testApp.agent
      .post(`/api/v1/proposals/${proposalId}/vote`)
      .send({ choice: 'yes' })
      .expect(201);

    const res = await testApp.agent
      .get('/xrpc/network.coopsource.governance.getVoteEligibility')
      .query({ proposal: proposalId })
      .expect(200);

    expect(res.body).toMatchObject({
      eligible: false,
      hasVoted: true,
      reason: 'already_voted',
    });
    // Weight still calculated even when already voted
    expect(res.body.weight).toBeGreaterThanOrEqual(1);
  });

  it('returns 401 without session', async () => {
    const proposalId = await createOpenProposal();

    const bare = supertest(testApp.app);
    const res = await bare
      .get('/xrpc/network.coopsource.governance.getVoteEligibility')
      .query({ proposal: proposalId })
      .expect(401);

    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 404 for nonexistent proposal', async () => {
    const res = await testApp.agent
      .get('/xrpc/network.coopsource.governance.getVoteEligibility')
      .query({ proposal: '00000000-0000-0000-0000-000000000000' })
      .expect(404);

    expect(res.body.error).toBe('NotFound');
  });

  it('returns ineligible when viewer is not a member of the cooperative', async () => {
    const proposalId = await createOpenProposal();

    // Create a second user who is not a member of this cooperative
    // We'll simulate by removing admin's membership, checking, then restoring
    // Simpler approach: directly check via a user who has no membership in this coop
    // Since our test auth always uses admin, let's remove admin's membership
    await testApp.container.db
      .updateTable('membership')
      .set({ status: 'departed', invalidated_at: new Date() })
      .where('member_did', '=', adminDid)
      .where('cooperative_did', '=', coopDid)
      .execute();

    const res = await testApp.agent
      .get('/xrpc/network.coopsource.governance.getVoteEligibility')
      .query({ proposal: proposalId })
      .expect(200);

    expect(res.body).toMatchObject({
      eligible: false,
      weight: 0,
      hasVoted: false,
      reason: 'not_active_member',
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @coopsource/api test -- xrpc-vote-eligibility`
Expected: FAIL -- handler not found.

- [ ] **Step 3: Write the handler**

Create `apps/api/src/xrpc/handlers/get-vote-eligibility.ts`:

```typescript
import type { XrpcContext } from '../dispatcher.js';
import { NotFoundError } from '@coopsource/common';
import { assertOpenGovernance } from './open-governance-gate.js';

export async function handleGetVoteEligibility(
  ctx: XrpcContext,
): Promise<unknown> {
  const proposalId = ctx.params.proposal as string;
  const viewerDid = ctx.viewer!.did;

  // Look up the proposal
  const result = await ctx.container.proposalService.getProposal(proposalId);
  if (!result) {
    throw new NotFoundError('Proposal not found');
  }

  const { proposal } = result;

  // Verify the cooperative has open governance
  await assertOpenGovernance(ctx.container.db, proposal.cooperative_did);

  // Check proposal is in voting phase (status 'open' in DB)
  if (proposal.status !== 'open') {
    return {
      eligible: false,
      weight: 0,
      hasVoted: false,
      reason: 'proposal_not_voting',
    };
  }

  // Check viewer is an active member
  const member = await ctx.container.membershipService.getMember(
    proposal.cooperative_did,
    viewerDid,
  );
  if (!member || member.status !== 'active') {
    return {
      eligible: false,
      weight: 0,
      hasVoted: false,
      reason: 'not_active_member',
    };
  }

  // Calculate vote weight (includes delegations)
  const weight = await ctx.container.delegationVotingService.calculateVoteWeight(
    proposal.cooperative_did,
    viewerDid,
    proposalId,
  );

  // Check if viewer has already voted (active vote = retracted_at IS NULL)
  const existingVote = await ctx.container.db
    .selectFrom('vote')
    .where('proposal_id', '=', proposalId)
    .where('voter_did', '=', viewerDid)
    .where('retracted_at', 'is', null)
    .select('id')
    .executeTakeFirst();

  const hasVoted = !!existingVote;

  if (hasVoted) {
    return {
      eligible: false,
      weight,
      hasVoted: true,
      reason: 'already_voted',
    };
  }

  return {
    eligible: true,
    weight,
    hasVoted: false,
  };
}
```

- [ ] **Step 4: Register the handler**

In `apps/api/src/xrpc/index.ts`, add the import:

```typescript
import { handleGetVoteEligibility } from './handlers/get-vote-eligibility.js';
```

Add the handler registration (after the `getProposal` entry):

```typescript
  handlers.set('network.coopsource.governance.getVoteEligibility', {
    auth: 'viewer',
    rateLimit: { windowMs: FIFTEEN_MINUTES, limit: 200 },
    handler: handleGetVoteEligibility,
  });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @coopsource/api test -- xrpc-vote-eligibility`
Expected: All 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/xrpc/handlers/get-vote-eligibility.ts apps/api/src/xrpc/index.ts apps/api/tests/xrpc-vote-eligibility.test.ts
git commit -m "feat(xrpc): add getVoteEligibility endpoint

Returns eligibility, weight (including delegations), and hasVoted
status. Reasons: not_active_member, proposal_not_voting, already_voted."
```

---

### Task 7: Codegen + Snapshot Test + Final Verification + Docs

**Files:**
- Modify: `packages/lexicons/tests/lexicons.test.ts`
- Modify: `ARCHITECTURE-V9.md`

- [ ] **Step 1: Regenerate lexicon types**

Run: `pnpm --filter @coopsource/lexicons lex:generate`

If the output in `packages/lexicons/src/generated/lexicons.ts` contains warning lines before the TypeScript code (lines not starting with `//`, `import`, `export`, or whitespace), remove them manually. The file should start with valid TypeScript.

- [ ] **Step 2: Build lexicons to verify types**

Run: `pnpm --filter @coopsource/lexicons build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Update the lexicon snapshot test**

In `packages/lexicons/tests/lexicons.test.ts`:

Change line 6 from:
```typescript
  it('should export all 40 lexicon schemas', () => {
    expect(lexiconSchemas).toHaveLength(40);
  });
```
to:
```typescript
  it('should export all 43 lexicon schemas', () => {
    expect(lexiconSchemas).toHaveLength(43);
  });
```

In the sorted ID list in the second test, add these 3 entries in their correct alphabetical positions:

After `'network.coopsource.admin.fiscalPeriod',`:
```
      'network.coopsource.admin.getOfficers',
```

After `'network.coopsource.governance.getProposal',`:
```
      'network.coopsource.governance.getVoteEligibility',
```

After `'network.coopsource.org.getMembership',`:
```
      'network.coopsource.org.listMembers',
```

The full updated ID list should contain these 43 entries (showing just the insertion points):
```typescript
    expect(ids).toEqual([
      'network.coopsource.admin.complianceItem',
      'network.coopsource.admin.fiscalPeriod',
      'network.coopsource.admin.getOfficers',
      'network.coopsource.admin.memberNotice',
      'network.coopsource.admin.officer',
      'network.coopsource.agreement.amendment',
      'network.coopsource.agreement.contribution',
      'network.coopsource.agreement.master',
      'network.coopsource.agreement.signature',
      'network.coopsource.agreement.stakeholderTerms',
      'network.coopsource.alignment.interest',
      'network.coopsource.alignment.interestMap',
      'network.coopsource.alignment.outcome',
      'network.coopsource.alignment.stakeholder',
      'network.coopsource.commerce.collaborativeProject',
      'network.coopsource.commerce.intercoopAgreement',
      'network.coopsource.commerce.listing',
      'network.coopsource.commerce.need',
      'network.coopsource.commerce.resource',
      'network.coopsource.connection.binding',
      'network.coopsource.connection.link',
      'network.coopsource.finance.expenseApproval',
      'network.coopsource.funding.campaign',
      'network.coopsource.funding.pledge',
      'network.coopsource.governance.delegation',
      'network.coopsource.governance.getProposal',
      'network.coopsource.governance.getVoteEligibility',
      'network.coopsource.governance.listProposals',
      'network.coopsource.legal.document',
      'network.coopsource.legal.meetingRecord',
      'network.coopsource.ops.schedule',
      'network.coopsource.ops.task',
      'network.coopsource.ops.taskAcceptance',
      'network.coopsource.ops.timeEntry',
      'network.coopsource.org.cooperative',
      'network.coopsource.org.getCooperative',
      'network.coopsource.org.getMembership',
      'network.coopsource.org.listMembers',
      'network.coopsource.org.memberApproval',
      'network.coopsource.org.membership',
      'network.coopsource.org.project',
      'network.coopsource.org.role',
      'network.coopsource.org.team',
    ]);
```

- [ ] **Step 4: Run lexicon tests**

Run: `pnpm --filter @coopsource/lexicons test`
Expected: All tests pass with 43 schemas.

- [ ] **Step 5: Run full API test suite**

Run: `pnpm --filter @coopsource/api test`
Expected: All tests pass (existing 761+ plus 17 new tests from Tasks 4-6).

- [ ] **Step 6: Update ARCHITECTURE-V9.md**

Find the line referencing V9.2.3 in `ARCHITECTURE-V9.md` (around line 453):
```
**Followup sub-phases (unchanged):** V9.2.1 (PLC service entry), V9.2.2 (OAuth scope rewrite), V9.2.3 (remaining endpoints for V9.3 Inlay), V9.2.4 (closed-governance), V9.2.5 (DPoP cross-service auth)
```

Change `V9.2.3 (remaining endpoints for V9.3 Inlay)` to `V9.2.3 (remaining endpoints for V9.3 Inlay) [SHIPPED]`.

- [ ] **Step 7: Commit**

```bash
git add packages/lexicons/src/generated/lexicons.ts packages/lexicons/tests/lexicons.test.ts ARCHITECTURE-V9.md
git commit -m "chore: update lexicon codegen, snapshot test, and architecture docs

Lexicon count 40 -> 43. Mark V9.2.3 as shipped in ARCHITECTURE-V9."
```

---

## Spec Coverage Verification

| Spec Requirement | Task |
|-----------------|------|
| DB migration: `directory_visible` on membership | Task 1, Step 1 |
| Schema type: `MembershipTable` update | Task 1, Step 2 |
| Service: `MemberWithRoles.directoryVisible` | Task 1, Steps 3-5 |
| Dispatcher: `'optional'` auth mode | Task 2 |
| Lexicon: `listMembers.json` | Task 3, Step 2 |
| Lexicon: `getVoteEligibility.json` | Task 3, Step 3 |
| Lexicon: `getOfficers.json` | Task 3, Step 1 |
| Handler: `getOfficers` + tests | Task 4 |
| Handler: `listMembers` + three-tier privacy + tests | Task 5 |
| Handler: `getVoteEligibility` + tests | Task 6 |
| Handler registration in `index.ts` | Tasks 4/5/6, Step 4 |
| Lexicon codegen + snapshot test update | Task 7, Steps 1-4 |
| Architecture docs update | Task 7, Step 6 |

## Implementation Notes

**Proposal status mapping:** The spec says to check `status === 'voting'`, but the actual DB constraint is `status IN ('draft', 'open', 'closed', 'resolved', 'withdrawn')`. The voting phase is `'open'`. The handler uses `proposal.status !== 'open'` and returns reason `'proposal_not_voting'`.

**Dispatcher optional auth:** The spec says "wrap requireViewer in try/catch that swallows auth errors." This would not work because `requireViewer` sends the 401 response directly via `res.status(401).json(...)` and never calls `next()`, leaving the Promise hanging forever. The implementation instead checks `req.session?.did` directly and looks up the entity without any 401 response -- a correct implementation of the same intent.

**`officerRecordService.getCurrent()`** returns raw `AdminOfficerTable` rows without entity display names. The handler batch-lookups display names from the entity table rather than modifying the shared service method.

---

### Critical Files for Implementation
- `/Users/alan/projects/utm/vmshared/coopsource.network/apps/api/src/xrpc/dispatcher.ts` -- the optional auth change is the most architecturally significant modification
- `/Users/alan/projects/utm/vmshared/coopsource.network/apps/api/src/services/membership-service.ts` -- MemberWithRoles interface change affects all consumers of listMembers/getMember
- `/Users/alan/projects/utm/vmshared/coopsource.network/packages/db/src/migrations/005_membership.ts` -- migration change is the data foundation
- `/Users/alan/projects/utm/vmshared/coopsource.network/apps/api/src/xrpc/handlers/list-members.ts` -- most complex new handler (three-tier privacy)
- `/Users/alan/projects/utm/vmshared/coopsource.network/apps/api/src/xrpc/index.ts` -- handler registry ties everything together

---

Plan complete. This plan should be saved to `docs/superpowers/plans/2026-04-12-remaining-xrpc-endpoints.md`. Two execution options:

**1. Subagent-Driven (recommended)** -- I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** -- Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
