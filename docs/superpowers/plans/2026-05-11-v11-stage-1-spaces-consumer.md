# V11 Stage 1 — Spaces Consumer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pull-based spaces consumer (Stage 1 of the V11 9-stage migration) — the foundational substrate for everything that follows. Includes pre-flight housekeeping (CLAUDE.md sync verification, memory refresh, ecosystem-refresh cadence).

**Architecture:** New `packages/spaces-consumer/` package implementing a pull-based consumer over permissioned repos, wired into `apps/api/src/appview/` alongside the existing public-firehose Tap consumer (`loop.ts`). Built behind interfaces with sketch implementations where upstream protocol details (URI scheme, OAuth-spaces seam, controlled-DID API, notification protocol) are not yet settled. Real implementations slot in as the upstream stabilizes — see ARCHITECTURE-V11.md §17.3 for the load-bearing-vs-substrate split.

**Tech Stack:** TypeScript strict, pnpm workspace, Turborepo, Vitest 4, Kysely (for the projection cache), `@atproto/api`/`@atproto/sync` where applicable, `@noble/curves` or similar for ECMH primitives (research before committing).

**Status:** Implementation complete on `feature/v11-stage-1-spaces-consumer` as of 2026-05-11. See `packages/spaces-consumer/README.md` for the as-built package overview, and `CLAUDE-CODE-PROMPT-V11.md` Stage 1 progress note for the deviations from this plan (notably: `axis` → `kind` on `SpaceConsumerError`; `ClockedOptions` consolidation across in-memory sketches; `AlwaysOk` → `UnsafeAlwaysOkEcmhVerifier` rename; per-member try/catch scoping in the orchestrator).

---

## Context

V11 is the post-protocol-gap architecture: ATProto landed permissioned spaces (Holmgren), an Arbiter pattern for group management (Meri + Zicklag, Roomy team), and the surrounding ecosystem (HappyView, Tangled, NorthSky) in early 2026. ARCHITECTURE-V11.md and CLAUDE-CODE-PROMPT-V11.md specify the four-layer Spaces → Arbiter → GovernanceView → CoopView target.

Stage 1 (the spaces consumer) is the only stage with no upstream gate — every other V11 stage either depends on Stage 1 or depends on a still-open upstream design decision. It's the right place to start. Built right, Stage 1 is small (~400-800 lines of TypeScript, isolated package, sketch implementations behind clean interfaces). Built wrong, it leaks upstream-uncertainty into the rest of `apps/api` and we pay for that in every subsequent stage.

The deliverable is: a working consumer that takes a `(cooperative DID, space ref, member PDS)` tuple, pulls records, verifies them, cross-checks the author against the arbiter's authoritative member list, and dispatches accepted records to the same hook pipeline `loop.ts` uses for public-firehose records. Sketch implementations are explicit; real implementations track upstream resolution.

---

## File Structure

### New package: `packages/spaces-consumer/`

- `package.json` — workspace package declaration, type=module, depends on `@coopsource/common`, `@coopsource/db`, `@coopsource/federation`, `@atproto/api`
- `tsconfig.json` — extends `@coopsource/config/tsconfig.base.json`
- `vitest.config.ts` — Vitest 4 config
- `src/index.ts` — public exports
- `src/types.ts` — `SpaceRef`, `SpaceNotification`, `PulledRecord`, `ConsumerHealth`, error types
- `src/credential-store.ts` — `SpaceCredentialStore` interface + `InMemorySpaceCredentialStore` sketch impl
- `src/arbiter-member-list.ts` — `ArbiterMemberList` interface (Stage 2 provides real impl)
- `src/notification-subscriber.ts` — `NotificationSubscriber` interface + sketch poll impl
- `src/repo-puller.ts` — `RepoPuller` interface + sketch impl using `@atproto/sync`
- `src/ecmh-verifier.ts` — `EcmhVerifier` interface + sketch impl (returns ok until real impl exists)
- `src/consumer.ts` — `SpacesConsumer` class — orchestrates subscribe → pull → verify → cross-check → emit
- `src/dispatch.ts` — `SpacesConsumerDispatch` — wraps `SpacesConsumer` and feeds the existing hook pipeline
- `src/health.ts` — health/metrics state (mirrors `loop.ts`'s `FirehoseHealth` pattern)
- `src/__tests__/credential-store.test.ts`
- `src/__tests__/arbiter-member-list.test.ts`
- `src/__tests__/ecmh-verifier.test.ts`
- `src/__tests__/consumer.test.ts`
- `src/__tests__/dispatch.test.ts`

### `apps/api` integration

- Create `apps/api/src/appview/spaces-consumer-dispatch.ts` — thin glue: instantiate the package's `SpacesConsumerDispatch` against the existing `HookRegistry` and `IPdsService`
- Modify `apps/api/src/container.ts` — wire `spacesConsumer` alongside the existing `firehoseLoop` (from `loop.ts`)
- Modify `apps/api/src/config.ts` — add `SPACES_CONSUMER_ENABLED`, `ARBITER_NOTIFICATION_URL` (optional, sketch-mode toggle), `HAPPYVIEW_REFERENCE_URL` (optional, dev-only reference target)
- Modify `apps/api/src/routes/health.ts` (or equivalent) — expose `consumerHealth` alongside `firehoseHealth`

### Schema additions (`packages/db/src/schema.ts`, NOT a new migration)

- `did_rotation_history` table — Stage 3 will use; Stage 1 adds the column shape and a single helper read function so all DID-equality code can begin consulting it now
- `space_credential` table — per (cooperative, space) credential cache, including expiry and a short audit trail of issuance and use
- `spaces_consumer_cursor` table — per (cooperative, space) cursor for resumable pulls (rev or seq, depending on what the upstream protocol exposes)

### Pre-flight (housekeeping)

- Read CLAUDE.md to confirm V11 alignment (CLAUDE-CODE-PROMPT-V11.md claims it's still V9 — verify and resolve)
- Update `/Users/alan/.claude/projects/-Users-alan-projects-utm-vmshared-coopsource-network/memory/project_v9.md` and add a `project_v11.md` reflecting the V11 direction
- Add an ecosystem-refresh recurring task (the two-week cadence from ARCHITECTURE-V11.md §18.3)

---

## Pre-Flight Tasks

### Task P1: Verify CLAUDE.md V11-alignment

**Files:**
- Read: `CLAUDE.md`
- Read: `CLAUDE-CODE-PROMPT-V11.md` (already established as V11-aligned)
- Modify (only if mismatch found): `CLAUDE.md`

- [ ] **Step 1: Read both docs and compare to V11 commitments**

Look specifically for: bilateral membership references, six-tier ACL references, "ats://" as a constant, RFC 9421 references, custom labeler service references, founder-DID rooting. CLAUDE-CODE-PROMPT-V11.md §"When CLAUDE.md disagrees with this prompt" claims CLAUDE.md is still V9. Confirm from a direct read whether that claim is current.

- [ ] **Step 2: If CLAUDE.md is V11-aligned, log a one-line note and skip**

If CLAUDE.md already references V11 throughout and contradicts none of the V11 commitments in CLAUDE-CODE-PROMPT-V11.md's "Critical Constraints" section, the doc-sync claim in the prompt is stale. Update CLAUDE-CODE-PROMPT-V11.md to remove the "CLAUDE.md is V9-aligned" claim (one-line edit) and proceed.

- [ ] **Step 3: If CLAUDE.md is V9/V10-aligned, fix in a separate commit**

If any V9 pattern survives in CLAUDE.md (e.g., "Bilateral membership is non-negotiable" or "six-tier ACL"), produce a focused edit that re-aligns CLAUDE.md to V11 commitments. Commit on a branch named `chore/claude-md-v11-alignment` (not the V11 stage branch). Do not bundle with Stage 1 implementation.

- [ ] **Step 4: Commit (if any change made)**

```bash
git checkout -b chore/claude-md-v11-alignment
git add CLAUDE.md CLAUDE-CODE-PROMPT-V11.md
git commit -m "chore: align CLAUDE.md with V11 commitments"
```

### Task P2: Memory refresh

**Files:**
- Modify: `/Users/alan/.claude/projects/-Users-alan-projects-utm-vmshared-coopsource-network/memory/project_v9.md`
- Create: `/Users/alan/.claude/projects/-Users-alan-projects-utm-vmshared-coopsource-network/memory/project_v11.md`
- Modify: `/Users/alan/.claude/projects/-Users-alan-projects-utm-vmshared-coopsource-network/memory/MEMORY.md`

- [ ] **Step 1: Update project_v9.md to mark V9 archived**

Current memory says "next V9.4/V9.5". V9 is superseded by V11. Edit the project memory to state V9 is archived under `docs/archive/`, that V9.4/V9.5 plans are no longer active, and that V11 is the live direction.

- [ ] **Step 2: Create project_v11.md**

Capture: V11 is active; the 9-stage roadmap; Stage 1 is current focus; key files are ARCHITECTURE-V11.md and CLAUDE-CODE-PROMPT-V11.md; the four-layer architecture (Spaces → Arbiter → GovernanceView → CoopView); the load-bearing vs. substrate split (§17.3).

```markdown
---
name: V11 Active Architecture
description: V11 is the active CSN architecture; 9-stage migration in progress; Stage 1 (spaces consumer) is current focus
type: project
---

V11 supersedes V9 and V10 as of 2026-05-08. The 9-stage migration follows ARCHITECTURE-V11.md §16. Stage 1 (spaces consumer) has no upstream gate and is safe to start. Stages 2-5 each have upstream gates (Arbiter XRPC reference impl, controlled-DID system, URI scheme finalization, OAuth-spaces seam settling). Stages 6-8 are CSN-internal refactors and cleanup.

**Why:** The protocol gaps V9 worked around (permissioned spaces, group semantics, cross-org identity) closed in early 2026. V11 builds on what landed instead of carrying workarounds.

**How to apply:** When working on V11-era code, ARCHITECTURE-V11.md §17 (Design Commitments) and §17.3 (load-bearing vs. substrate) are the decision references. Surface upstream-dependent decisions to the user rather than guessing.
```

- [ ] **Step 3: Update MEMORY.md index**

Replace the V9 entry with a V11 entry; keep the V9 reference as historical. Single-line index entry:

```
- [V11 Active Architecture](project_v11.md) — V11 (May 2026) supersedes V9/V10; 9-stage migration; Stage 1 (spaces consumer) current
- [V9 Archived](project_v9.md) — V9 superseded by V11; historical reference only
```

### Task P3: Ecosystem-refresh cadence

**Files:**
- Reference only: `ARCHITECTURE-V11.md` §18.3
- Consider: a scheduled task (the user's `/schedule` skill or a calendar reminder)

- [ ] **Step 1: Write the watchlist memory file**

Create `/Users/alan/.claude/projects/-Users-alan-projects-utm-vmshared-coopsource-network/memory/reference_v11_ecosystem_watchlist.md` with the 9 URLs from ARCHITECTURE-V11.md §18.3 and the two-week cadence note. Future Claude sessions can fetch directly without re-deriving from the architecture doc.

```markdown
---
name: V11 Ecosystem Watchlist
description: Nine direct URLs to fetch on a two-week cadence to keep V11 architecture current with upstream
type: reference
---

Two-week refresh cadence (ARCHITECTURE-V11.md §18.3). Direct URL fetches, not search-driven discovery.

- `https://dholms.leaflet.pub` — Holmgren's diaries (permissioned data)
- `https://zicklag.leaflet.pub` — Zicklag's posts (Arbiter)
- `https://meri.leaflet.pub` — Meri's posts (Arbiter)
- `https://happyview.dev` — HappyView v2.5+ releases
- `https://tangled.org/gamesgamesgamesgames.games/happyview` — HappyView source
- `https://github.com/bluesky-social/atproto/compare/permissioned-data` — Protocol branch
- `https://discourse.atprotocol.community` — Private Data WG
- `https://www.npmjs.com/package/@atproto/oauth-scopes` — Granular OAuth scopes
- `https://blog.muni.town` — Roomy roadmap

The architecture document only changes when a refresh surfaces something load-bearing (ARCHITECTURE-V11.md §17.3 distinguishes load-bearing from substrate).
```

- [ ] **Step 2: Add the index entry to MEMORY.md**

```
- [V11 Ecosystem Watchlist](reference_v11_ecosystem_watchlist.md) — 9 URLs; two-week cadence per ARCHITECTURE-V11.md §18.3
```

---

## Stage 1 Tasks

### Task 1: Branch and package skeleton

**Files:**
- Create: `packages/spaces-consumer/package.json`
- Create: `packages/spaces-consumer/tsconfig.json`
- Create: `packages/spaces-consumer/vitest.config.ts`
- Create: `packages/spaces-consumer/src/index.ts` (empty export for now)
- Modify: `pnpm-workspace.yaml` (likely already includes `packages/*` — confirm)
- Modify: `turbo.json` (if it pins package names explicitly — confirm)

- [ ] **Step 1: Create branch**

```bash
git checkout -b feature/v11-stage-1-spaces-consumer
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "@coopsource/spaces-consumer",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "build": "tsc -b",
    "test": "vitest run",
    "lint": "eslint src --ext .ts"
  },
  "dependencies": {
    "@coopsource/common": "workspace:*",
    "@coopsource/db": "workspace:*",
    "@coopsource/federation": "workspace:*",
    "kysely": "^0.28"
  },
  "devDependencies": {
    "@coopsource/config": "workspace:*",
    "typescript": "^5.9",
    "vitest": "^4.0"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "extends": "@coopsource/config/tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: Create src/index.ts placeholder**

```typescript
export {};
```

- [ ] **Step 6: Verify pnpm sees the new package**

```bash
pnpm install
pnpm --filter @coopsource/spaces-consumer build
```

Expected: build completes (empty package compiles).

- [ ] **Step 7: Commit**

```bash
git add packages/spaces-consumer pnpm-lock.yaml
git commit -m "feat(spaces-consumer): create empty workspace package skeleton"
```

### Task 2: Core types

**Files:**
- Create: `packages/spaces-consumer/src/types.ts`
- Test: `packages/spaces-consumer/src/__tests__/types.test.ts`

The `SpaceRef = { arbiter: DID, type: string, skey: string }` substrate is the V11 invariant per ARCHITECTURE-V11.md §17.3 — independent of URI scheme decisions.

- [ ] **Step 1: Write failing test**

```typescript
// packages/spaces-consumer/src/__tests__/types.test.ts
import { describe, it, expect } from 'vitest';
import { spaceRefKey, type SpaceRef } from '../types.js';

describe('spaceRefKey', () => {
  it('returns a stable string key for a space ref', () => {
    const ref: SpaceRef = { arbiter: 'did:plc:abc', type: 'network.coopsource.org.cooperative', skey: 'members' };
    expect(spaceRefKey(ref)).toBe('did:plc:abc|network.coopsource.org.cooperative|members');
  });

  it('produces the same key for equal refs', () => {
    const a: SpaceRef = { arbiter: 'did:plc:abc', type: 'X', skey: 'Y' };
    const b: SpaceRef = { arbiter: 'did:plc:abc', type: 'X', skey: 'Y' };
    expect(spaceRefKey(a)).toBe(spaceRefKey(b));
  });
});
```

- [ ] **Step 2: Run test — expect FAIL ("module not found")**

```bash
pnpm --filter @coopsource/spaces-consumer test
```

- [ ] **Step 3: Implement types.ts**

```typescript
// packages/spaces-consumer/src/types.ts
import type { DID, AtUri, CID } from '@coopsource/common';

/**
 * Per ARCHITECTURE-V11.md §17.3, SpaceRef is the load-bearing substrate.
 * Independent of URI scheme decisions (ats:// vs at:// is not yet finalized upstream).
 */
export interface SpaceRef {
  readonly arbiter: DID;
  readonly type: string;
  readonly skey: string;
}

export function spaceRefKey(ref: SpaceRef): string {
  return `${ref.arbiter}|${ref.type}|${ref.skey}`;
}

export interface SpaceNotification {
  readonly space: SpaceRef;
  readonly since: string; // cursor/rev — upstream-protocol-dependent
  readonly receivedAt: Date;
}

export interface PulledRecord {
  readonly space: SpaceRef;
  readonly authorDid: DID;
  readonly collection: string;
  readonly rkey: string;
  readonly uri: AtUri;
  readonly cid: CID;
  readonly record: unknown;
  readonly rev: string;
  readonly commitSignature: string;
}

export interface ConsumerHealth {
  readonly subscribedSpaces: number;
  readonly lastPullAt: string | null;
  readonly recordsAccepted: number;
  readonly recordsRejected: number;
  readonly digestMismatches: number;
  readonly memberCrossCheckFailures: number;
  readonly errorCount: number;
  readonly startedAt: string;
}

export class SpaceConsumerError extends Error {
  constructor(
    public readonly axis: 'credential' | 'digest' | 'member-list' | 'protocol' | 'schema',
    message: string,
  ) {
    super(message);
    this.name = 'SpaceConsumerError';
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
pnpm --filter @coopsource/spaces-consumer test
```

- [ ] **Step 5: Commit**

```bash
git add packages/spaces-consumer/src
git commit -m "feat(spaces-consumer): add SpaceRef and core types"
```

### Task 3: SpaceCredentialStore

**Files:**
- Create: `packages/spaces-consumer/src/credential-store.ts`
- Test: `packages/spaces-consumer/src/__tests__/credential-store.test.ts`

Space credentials are bearer tokens — short-lived, per-(coop, space), refreshed on each batch (CLAUDE-CODE-PROMPT-V11.md "Space-Credential Management").

- [ ] **Step 1: Write failing test**

```typescript
// packages/spaces-consumer/src/__tests__/credential-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemorySpaceCredentialStore, type SpaceCredential } from '../credential-store.js';
import type { SpaceRef } from '../types.js';

const ref: SpaceRef = { arbiter: 'did:plc:abc', type: 'X', skey: 'members' };

describe('InMemorySpaceCredentialStore', () => {
  let store: InMemorySpaceCredentialStore;
  beforeEach(() => { store = new InMemorySpaceCredentialStore({ clock: () => new Date('2026-05-11T12:00:00Z') }); });

  it('returns undefined for a missing credential', async () => {
    expect(await store.get(ref)).toBeUndefined();
  });

  it('stores and retrieves a credential', async () => {
    const cred: SpaceCredential = { token: 't', expiresAt: new Date('2026-05-11T13:00:00Z') };
    await store.put(ref, cred);
    expect(await store.get(ref)).toEqual(cred);
  });

  it('treats expired credentials as missing', async () => {
    const cred: SpaceCredential = { token: 't', expiresAt: new Date('2026-05-11T11:00:00Z') };
    await store.put(ref, cred);
    expect(await store.get(ref)).toBeUndefined();
  });

  it('lists all live credentials', async () => {
    await store.put(ref, { token: 't1', expiresAt: new Date('2026-05-11T13:00:00Z') });
    await store.put({ ...ref, skey: 'board' }, { token: 't2', expiresAt: new Date('2026-05-11T13:00:00Z') });
    const live = await store.live();
    expect(live).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm --filter @coopsource/spaces-consumer test
```

- [ ] **Step 3: Implement credential-store.ts**

```typescript
// packages/spaces-consumer/src/credential-store.ts
import { spaceRefKey, type SpaceRef } from './types.js';

export interface SpaceCredential {
  readonly token: string;
  readonly expiresAt: Date;
}

export interface SpaceCredentialStore {
  get(ref: SpaceRef): Promise<SpaceCredential | undefined>;
  put(ref: SpaceRef, cred: SpaceCredential): Promise<void>;
  delete(ref: SpaceRef): Promise<void>;
  live(): Promise<Array<{ ref: SpaceRef; cred: SpaceCredential }>>;
}

export interface InMemoryOptions {
  clock: () => Date;
}

export class InMemorySpaceCredentialStore implements SpaceCredentialStore {
  private readonly map = new Map<string, { ref: SpaceRef; cred: SpaceCredential }>();
  constructor(private readonly opts: InMemoryOptions) {}

  async get(ref: SpaceRef): Promise<SpaceCredential | undefined> {
    const entry = this.map.get(spaceRefKey(ref));
    if (!entry) return undefined;
    if (entry.cred.expiresAt.getTime() <= this.opts.clock().getTime()) return undefined;
    return entry.cred;
  }

  async put(ref: SpaceRef, cred: SpaceCredential): Promise<void> {
    this.map.set(spaceRefKey(ref), { ref, cred });
  }

  async delete(ref: SpaceRef): Promise<void> {
    this.map.delete(spaceRefKey(ref));
  }

  async live(): Promise<Array<{ ref: SpaceRef; cred: SpaceCredential }>> {
    const now = this.opts.clock().getTime();
    return [...this.map.values()].filter((e) => e.cred.expiresAt.getTime() > now);
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
pnpm --filter @coopsource/spaces-consumer test
```

- [ ] **Step 5: Commit**

```bash
git add packages/spaces-consumer
git commit -m "feat(spaces-consumer): add SpaceCredentialStore with in-memory impl"
```

### Task 4: ArbiterMemberList interface

**Files:**
- Create: `packages/spaces-consumer/src/arbiter-member-list.ts`
- Test: `packages/spaces-consumer/src/__tests__/arbiter-member-list.test.ts`

Stage 2 (Arbiter integration) will provide the real implementation. For Stage 1, we define the interface and ship a `StaticArbiterMemberList` sketch impl plus a `DenyAllArbiterMemberList` for safe default. The cross-check is the load-bearing security boundary — records authored by DIDs not on the list are discarded.

- [ ] **Step 1: Write failing test**

```typescript
// packages/spaces-consumer/src/__tests__/arbiter-member-list.test.ts
import { describe, it, expect } from 'vitest';
import { StaticArbiterMemberList, DenyAllArbiterMemberList } from '../arbiter-member-list.js';
import type { SpaceRef } from '../types.js';

const ref: SpaceRef = { arbiter: 'did:plc:coop', type: 'X', skey: 'members' };

describe('StaticArbiterMemberList', () => {
  it('isMember returns true for listed DIDs', async () => {
    const list = new StaticArbiterMemberList({ [`${ref.arbiter}|${ref.type}|${ref.skey}`]: ['did:plc:alice', 'did:plc:bob'] });
    expect(await list.isMember(ref, 'did:plc:alice')).toBe(true);
  });
  it('isMember returns false for unlisted DIDs', async () => {
    const list = new StaticArbiterMemberList({});
    expect(await list.isMember(ref, 'did:plc:eve')).toBe(false);
  });
  it('list returns all members', async () => {
    const list = new StaticArbiterMemberList({ [`${ref.arbiter}|${ref.type}|${ref.skey}`]: ['did:plc:a', 'did:plc:b'] });
    expect(await list.list(ref)).toEqual(['did:plc:a', 'did:plc:b']);
  });
});

describe('DenyAllArbiterMemberList', () => {
  it('rejects every membership query', async () => {
    const list = new DenyAllArbiterMemberList();
    expect(await list.isMember(ref, 'did:plc:alice')).toBe(false);
    expect(await list.list(ref)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement arbiter-member-list.ts**

```typescript
// packages/spaces-consumer/src/arbiter-member-list.ts
import type { DID } from '@coopsource/common';
import { spaceRefKey, type SpaceRef } from './types.js';

/**
 * The arbiter's authoritative member list for a space. Stage 2 provides the real
 * XRPC-backed implementation; Stage 1 ships sketch impls behind this interface.
 *
 * Security note: the cross-check is the load-bearing boundary. Per
 * CLAUDE-CODE-PROMPT-V11.md "AppView Validation": records from DIDs not on
 * this list MUST be discarded.
 */
export interface ArbiterMemberList {
  isMember(space: SpaceRef, did: DID): Promise<boolean>;
  list(space: SpaceRef): Promise<DID[]>;
}

/**
 * Sketch impl — accepts a static map keyed by spaceRefKey. Useful for tests
 * and for dev setups where an arbiter XRPC client doesn't exist yet.
 */
export class StaticArbiterMemberList implements ArbiterMemberList {
  constructor(private readonly map: Record<string, DID[]>) {}

  async isMember(space: SpaceRef, did: DID): Promise<boolean> {
    return (this.map[spaceRefKey(space)] ?? []).includes(did);
  }

  async list(space: SpaceRef): Promise<DID[]> {
    return [...(this.map[spaceRefKey(space)] ?? [])];
  }
}

/**
 * Safe default for production-like environments where no real arbiter client
 * is wired yet — denies everything. Forces the developer to explicitly choose
 * a member-list source before any records are accepted.
 */
export class DenyAllArbiterMemberList implements ArbiterMemberList {
  async isMember(): Promise<boolean> { return false; }
  async list(): Promise<DID[]> { return []; }
}
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/spaces-consumer
git commit -m "feat(spaces-consumer): add ArbiterMemberList interface with sketch impls"
```

### Task 5: NotificationSubscriber interface

**Files:**
- Create: `packages/spaces-consumer/src/notification-subscriber.ts`
- Test: `packages/spaces-consumer/src/__tests__/notification-subscriber.test.ts`

Notifications are lightweight write-occurred events. The consumer subscribes per-space; on receiving a notification, it triggers a pull. Real impl is upstream-dependent; sketch impl emits notifications from an in-memory event source so the rest of the consumer is testable.

- [ ] **Step 1: Write failing test**

```typescript
// packages/spaces-consumer/src/__tests__/notification-subscriber.test.ts
import { describe, it, expect, vi } from 'vitest';
import { InMemoryNotificationSubscriber } from '../notification-subscriber.js';
import type { SpaceRef } from '../types.js';

const ref: SpaceRef = { arbiter: 'did:plc:coop', type: 'X', skey: 'members' };

describe('InMemoryNotificationSubscriber', () => {
  it('delivers an emitted notification to a subscribed handler', async () => {
    const sub = new InMemoryNotificationSubscriber({ clock: () => new Date('2026-05-11T12:00:00Z') });
    const handler = vi.fn();
    await sub.subscribe(ref, handler);
    await sub.emit(ref, 'rev-1');
    expect(handler).toHaveBeenCalledWith({ space: ref, since: 'rev-1', receivedAt: expect.any(Date) });
  });

  it('does not deliver to unsubscribed spaces', async () => {
    const sub = new InMemoryNotificationSubscriber({ clock: () => new Date() });
    const handler = vi.fn();
    await sub.subscribe(ref, handler);
    await sub.emit({ ...ref, skey: 'other' }, 'rev-1');
    expect(handler).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement notification-subscriber.ts**

```typescript
// packages/spaces-consumer/src/notification-subscriber.ts
import { spaceRefKey, type SpaceNotification, type SpaceRef } from './types.js';

export type NotificationHandler = (n: SpaceNotification) => Promise<void> | void;

export interface NotificationSubscriber {
  subscribe(space: SpaceRef, handler: NotificationHandler): Promise<void>;
  unsubscribe(space: SpaceRef): Promise<void>;
}

export interface InMemoryOptions {
  clock: () => Date;
}

export class InMemoryNotificationSubscriber implements NotificationSubscriber {
  private readonly handlers = new Map<string, NotificationHandler>();
  constructor(private readonly opts: InMemoryOptions) {}

  async subscribe(space: SpaceRef, handler: NotificationHandler): Promise<void> {
    this.handlers.set(spaceRefKey(space), handler);
  }

  async unsubscribe(space: SpaceRef): Promise<void> {
    this.handlers.delete(spaceRefKey(space));
  }

  async emit(space: SpaceRef, since: string): Promise<void> {
    const h = this.handlers.get(spaceRefKey(space));
    if (!h) return;
    await h({ space, since, receivedAt: this.opts.clock() });
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/spaces-consumer
git commit -m "feat(spaces-consumer): add NotificationSubscriber interface with in-memory impl"
```

### Task 6: EcmhVerifier (fail-closed sketch)

**Files:**
- Create: `packages/spaces-consumer/src/ecmh-verifier.ts`
- Test: `packages/spaces-consumer/src/__tests__/ecmh-verifier.test.ts`

ECMH (Elliptic Curve Multiset Hash) is the commit-chain digest scheme used by permissioned repos. The real verifier requires the upstream spec — Holmgren's Permissioned Data Diary 4/5 reference it; the `bluesky-social/atproto` `permissioned-data` branch is the implementation reference.

**Sketch policy**: the default sketch verifier (`FailClosedEcmhVerifier`) returns `{ ok: false, reason: 'no-verifier-wired' }` so accidental production wiring fails safely. Tests that need to bypass digest verification use `AlwaysOkEcmhVerifier` — explicit opt-in. Mirrors the `DenyAllArbiterMemberList` fail-closed pattern.

**Before implementing the real verifier**, surface a research finding: does a JS library (`@noble/curves` is a candidate) expose the curve operations ECMH needs? Or do we vendor an implementation? Do not commit to a library without checking.

- [ ] **Step 1: Write failing test**

```typescript
// packages/spaces-consumer/src/__tests__/ecmh-verifier.test.ts
import { describe, it, expect } from 'vitest';
import { FailClosedEcmhVerifier, AlwaysOkEcmhVerifier } from '../ecmh-verifier.js';

describe('FailClosedEcmhVerifier', () => {
  it('rejects every verification by default', async () => {
    const v = new FailClosedEcmhVerifier();
    const r = await v.verify({ records: [], expectedDigest: 'abc' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('no-verifier-wired');
  });

  it('isSketch is true', () => {
    expect(new FailClosedEcmhVerifier().isSketch).toBe(true);
  });
});

describe('AlwaysOkEcmhVerifier (test-only)', () => {
  it('returns ok for any input', async () => {
    const v = new AlwaysOkEcmhVerifier();
    const r = await v.verify({ records: [], expectedDigest: 'abc' });
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement ecmh-verifier.ts**

```typescript
// packages/spaces-consumer/src/ecmh-verifier.ts
import type { PulledRecord } from './types.js';

export interface EcmhVerifyInput {
  readonly records: ReadonlyArray<PulledRecord>;
  readonly expectedDigest: string;
}

export type EcmhVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'digest-mismatch' | 'malformed-input' | 'no-verifier-wired' };

export interface EcmhVerifier {
  readonly isSketch: boolean;
  verify(input: EcmhVerifyInput): Promise<EcmhVerifyResult>;
}

/**
 * Default sketch — FAILS CLOSED. Returns ok: false so accidental wiring into
 * a production-like context can never silently bypass digest verification.
 * Used as the safe default in dispatch wiring until the real verifier exists.
 *
 * Research gates before real impl:
 *   - Does @noble/curves or a sibling library expose the curve op surface
 *     ECMH needs? Or must we vendor an implementation?
 *   - What is the canonical encoding of a record for digest input?
 *   - How does the digest chain across commits? (Likely tracked per arbiter rev.)
 *
 * Surface findings to the user before committing the real implementation.
 */
export class FailClosedEcmhVerifier implements EcmhVerifier {
  readonly isSketch = true;
  async verify(_input: EcmhVerifyInput): Promise<EcmhVerifyResult> {
    return { ok: false, reason: 'no-verifier-wired' };
  }
}

/**
 * Test-only — accepts every input. Never wire into production. The name carries
 * the warning; the dispatch's UNSAFE_SKIP_ECMH config flag is the only path that
 * substitutes this in for FailClosedEcmhVerifier outside of tests.
 */
export class AlwaysOkEcmhVerifier implements EcmhVerifier {
  readonly isSketch = true;
  async verify(_input: EcmhVerifyInput): Promise<EcmhVerifyResult> {
    return { ok: true };
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/spaces-consumer
git commit -m "feat(spaces-consumer): add fail-closed EcmhVerifier sketch (real impl gated by upstream ECMH spec)"
```

### Task 7: RepoPuller (sketch)

**Files:**
- Create: `packages/spaces-consumer/src/repo-puller.ts`
- Test: `packages/spaces-consumer/src/__tests__/repo-puller.test.ts`

Given a member DID and a since-cursor, pull records that DID has written into the space's permissioned repo. The real impl wraps `@atproto/sync` against the member's PDS, filtered by space ref. Sketch impl reads from an in-memory store so the consumer is testable end-to-end.

- [ ] **Step 1: Write a test factory + failing test**

Create a tiny test fixture helper to avoid `as any` casts on branded types throughout the suite. If `@coopsource/common` already exposes `AtUri.unsafeFrom(string)` or similar test constructors, use those instead.

```typescript
// packages/spaces-consumer/src/__tests__/helpers/factories.ts
import type { AtUri, CID, DID } from '@coopsource/common';
import type { PulledRecord, SpaceRef } from '../../types.js';

export const fakeUri = (s: string) => s as unknown as AtUri;
export const fakeCid = (s: string) => s as unknown as CID;

export function buildPulledRecord(overrides: Partial<PulledRecord> & { space: SpaceRef; authorDid: DID; rev: string }): PulledRecord {
  return {
    space: overrides.space,
    authorDid: overrides.authorDid,
    collection: overrides.collection ?? 'network.coopsource.governance.vote',
    rkey: overrides.rkey ?? 'rk',
    uri: overrides.uri ?? fakeUri(`at://${overrides.authorDid}/network.coopsource.governance.vote/${overrides.rkey ?? 'rk'}`),
    cid: overrides.cid ?? fakeCid(`cid-${overrides.rev}`),
    record: overrides.record ?? {},
    rev: overrides.rev,
    commitSignature: overrides.commitSignature ?? 'sig',
  };
}
```

```typescript
// packages/spaces-consumer/src/__tests__/repo-puller.test.ts
import { describe, it, expect } from 'vitest';
import { InMemoryRepoPuller } from '../repo-puller.js';
import { buildPulledRecord } from './helpers/factories.js';
import type { SpaceRef } from '../types.js';

const ref: SpaceRef = { arbiter: 'did:plc:coop', type: 'X', skey: 'members' };

describe('InMemoryRepoPuller', () => {
  it('returns records authored by the requested DID after the cursor', async () => {
    const records = [
      buildPulledRecord({ space: ref, authorDid: 'did:plc:alice', rkey: 'r1', rev: '1' }),
      buildPulledRecord({ space: ref, authorDid: 'did:plc:alice', rkey: 'r2', rev: '2' }),
    ];
    const p = new InMemoryRepoPuller(records);
    const pulled = await p.pull({ space: ref, memberDid: 'did:plc:alice', since: '0' });
    expect(pulled).toHaveLength(2);
  });
});
```

The `as unknown as T` cast in `fakeUri`/`fakeCid` is the single contained place that bypasses brand checks. If `@coopsource/common` provides safe test constructors, prefer those and delete this helper.

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement repo-puller.ts**

```typescript
// packages/spaces-consumer/src/repo-puller.ts
import type { DID } from '@coopsource/common';
import { spaceRefKey, type PulledRecord, type SpaceRef } from './types.js';

export interface PullRequest {
  readonly space: SpaceRef;
  readonly memberDid: DID;
  readonly since: string;
}

export interface RepoPuller {
  pull(req: PullRequest): Promise<PulledRecord[]>;
}

/**
 * Sketch impl — pulls from an in-memory record store. Useful for tests and
 * for development against a known-shape fixture. Real impl wraps @atproto/sync
 * against the member's PDS, scoped by space ref.
 */
export class InMemoryRepoPuller implements RepoPuller {
  constructor(private readonly records: ReadonlyArray<PulledRecord>) {}

  async pull(req: PullRequest): Promise<PulledRecord[]> {
    return this.records.filter(
      (r) => spaceRefKey(r.space) === spaceRefKey(req.space) && r.authorDid === req.memberDid && r.rev > req.since,
    );
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/spaces-consumer
git commit -m "feat(spaces-consumer): add RepoPuller interface with in-memory sketch"
```

### Task 8: SpacesConsumer orchestrator

**Files:**
- Create: `packages/spaces-consumer/src/consumer.ts`
- Test: `packages/spaces-consumer/src/__tests__/consumer.test.ts`

This is the load-bearing class: on receiving a notification for a space, it walks the arbiter's authoritative member list, pulls each member's records since the per-(space, member) cursor, verifies the ECMH digest, cross-checks each record's author DID against the member list (defense in depth), and emits accepted records to a downstream handler.

- [ ] **Step 1: Write failing test**

```typescript
// packages/spaces-consumer/src/__tests__/consumer.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpacesConsumer } from '../consumer.js';
import { InMemoryNotificationSubscriber } from '../notification-subscriber.js';
import { StaticArbiterMemberList } from '../arbiter-member-list.js';
import { InMemoryRepoPuller } from '../repo-puller.js';
import { AlwaysOkEcmhVerifier, FailClosedEcmhVerifier } from '../ecmh-verifier.js';
import { buildPulledRecord } from './helpers/factories.js';
import type { SpaceRef } from '../types.js';

const ref: SpaceRef = { arbiter: 'did:plc:coop', type: 'X', skey: 'members' };
const aliceRecord = buildPulledRecord({ space: ref, authorDid: 'did:plc:alice', rkey: 'r1', rev: '1' });
const eveRecord = buildPulledRecord({ space: ref, authorDid: 'did:plc:eve', rkey: 'r2', rev: '1' });

describe('SpacesConsumer', () => {
  let onAccepted: ReturnType<typeof vi.fn>;
  let consumer: SpacesConsumer;
  let subscriber: InMemoryNotificationSubscriber;
  let memberList: StaticArbiterMemberList;
  const cursorStore = new Map<string, string>();

  beforeEach(() => {
    onAccepted = vi.fn();
    subscriber = new InMemoryNotificationSubscriber({ clock: () => new Date('2026-05-11T12:00:00Z') });
    memberList = new StaticArbiterMemberList({
      [`${ref.arbiter}|${ref.type}|${ref.skey}`]: ['did:plc:alice'], // alice is a member; eve is not
    });
    cursorStore.clear();
    consumer = new SpacesConsumer({
      subscriber,
      memberList,
      puller: new InMemoryRepoPuller([aliceRecord, eveRecord]),
      verifier: new AlwaysOkEcmhVerifier(), // tests opt into the always-ok verifier explicitly
      cursors: {
        get: async (k) => cursorStore.get(k) ?? '0',
        set: async (k, v) => { cursorStore.set(k, v); },
      },
      onAccepted,
      onError: vi.fn(),
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });
  });

  it('subscribes to a space, accepts member records, rejects non-member records', async () => {
    await consumer.start([ref]);
    await subscriber.emit(ref, '0');
    expect(onAccepted).toHaveBeenCalledTimes(1);
    expect(onAccepted).toHaveBeenCalledWith(aliceRecord);
  });

  it('advances the cursor after accepting records', async () => {
    await consumer.start([ref]);
    await subscriber.emit(ref, '0');
    expect(cursorStore.get(`${ref.arbiter}|${ref.type}|${ref.skey}|did:plc:alice`)).toBe('1');
  });

  it('counts member-cross-check failures in health', async () => {
    await consumer.start([ref]);
    await subscriber.emit(ref, '0');
    expect(consumer.health().memberCrossCheckFailures).toBe(1); // eve was rejected
    expect(consumer.health().recordsAccepted).toBe(1);
  });

  it('counts digest mismatches and skips records when verifier fails closed', async () => {
    const failConsumer = new SpacesConsumer({
      subscriber, memberList,
      puller: new InMemoryRepoPuller([aliceRecord]),
      verifier: new FailClosedEcmhVerifier(),
      cursors: { get: async () => '0', set: async () => {} },
      onAccepted, onError: vi.fn(),
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });
    await failConsumer.start([ref]);
    await subscriber.emit(ref, '0');
    expect(onAccepted).not.toHaveBeenCalled();
    expect(failConsumer.health().digestMismatches).toBe(1);
  });

  it('reports errors via onError callback (no silent swallowing)', async () => {
    const onError = vi.fn();
    const throwingPuller = { pull: async () => { throw new Error('puller-boom'); } };
    const throwConsumer = new SpacesConsumer({
      subscriber, memberList, puller: throwingPuller,
      verifier: new AlwaysOkEcmhVerifier(),
      cursors: { get: async () => '0', set: async () => {} },
      onAccepted, onError,
      clock: () => new Date('2026-05-11T12:00:00Z'),
    });
    await throwConsumer.start([ref]);
    await subscriber.emit(ref, '0');
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'puller-boom' }), expect.any(Object));
    expect(throwConsumer.health().errorCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement consumer.ts**

```typescript
// packages/spaces-consumer/src/consumer.ts
import type { ArbiterMemberList } from './arbiter-member-list.js';
import type { EcmhVerifier } from './ecmh-verifier.js';
import type { NotificationSubscriber } from './notification-subscriber.js';
import type { RepoPuller } from './repo-puller.js';
import { spaceRefKey, type ConsumerHealth, type PulledRecord, type SpaceNotification, type SpaceRef } from './types.js';

export interface CursorStore {
  get(key: string): Promise<string>;
  set(key: string, value: string): Promise<void>;
}

export interface SpacesConsumerOptions {
  readonly subscriber: NotificationSubscriber;
  readonly memberList: ArbiterMemberList;
  readonly puller: RepoPuller;
  readonly verifier: EcmhVerifier;
  readonly cursors: CursorStore;
  readonly onAccepted: (r: PulledRecord) => Promise<void> | void;
  readonly onError: (err: unknown, context: { space: SpaceRef; memberDid?: string }) => Promise<void> | void;
  readonly clock: () => Date;
}

export class SpacesConsumer {
  private readonly startedAt: string;
  private subscribedSpaces = 0;
  private lastPullAt: string | null = null;
  private recordsAccepted = 0;
  private recordsRejected = 0;
  private digestMismatches = 0;
  private memberCrossCheckFailures = 0;
  private errorCount = 0;

  constructor(private readonly opts: SpacesConsumerOptions) {
    this.startedAt = opts.clock().toISOString();
  }

  async start(spaces: ReadonlyArray<SpaceRef>): Promise<void> {
    for (const space of spaces) {
      await this.opts.subscriber.subscribe(space, (n) => this.handleNotification(n));
      this.subscribedSpaces += 1;
    }
  }

  health(): ConsumerHealth {
    return {
      subscribedSpaces: this.subscribedSpaces,
      lastPullAt: this.lastPullAt,
      recordsAccepted: this.recordsAccepted,
      recordsRejected: this.recordsRejected,
      digestMismatches: this.digestMismatches,
      memberCrossCheckFailures: this.memberCrossCheckFailures,
      errorCount: this.errorCount,
      startedAt: this.startedAt,
    };
  }

  private async handleNotification(n: SpaceNotification): Promise<void> {
    let currentMember: string | undefined;
    try {
      const members = await this.opts.memberList.list(n.space);
      for (const memberDid of members) {
        currentMember = memberDid;
        const cursorKey = `${spaceRefKey(n.space)}|${memberDid}`;
        const since = await this.opts.cursors.get(cursorKey);
        const pulled = await this.opts.puller.pull({ space: n.space, memberDid, since });
        if (pulled.length === 0) continue;

        // expectedDigest is upstream-dependent — when the notification protocol
        // settles, the digest will arrive on the notification itself. Until then
        // the verifier interface is in place but the wired default (FailClosed)
        // refuses anyway, so the placeholder is safe.
        const digestResult = await this.opts.verifier.verify({
          records: pulled,
          expectedDigest: n.since, // best-available pre-protocol-finalization placeholder
        });
        if (!digestResult.ok) {
          this.digestMismatches += 1;
          continue;
        }

        let maxRev = since;
        for (const r of pulled) {
          // Defense-in-depth cross-check: even within a single pull batch,
          // verify each record's author is on the member list.
          const ok = await this.opts.memberList.isMember(n.space, r.authorDid);
          if (!ok) {
            this.memberCrossCheckFailures += 1;
            this.recordsRejected += 1;
            continue;
          }
          await this.opts.onAccepted(r);
          this.recordsAccepted += 1;
          if (r.rev > maxRev) maxRev = r.rev;
        }
        if (maxRev !== since) await this.opts.cursors.set(cursorKey, maxRev);
      }
      this.lastPullAt = this.opts.clock().toISOString();
    } catch (err) {
      this.errorCount += 1;
      await this.opts.onError(err, { space: n.space, memberDid: currentMember });
    }
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/spaces-consumer
git commit -m "feat(spaces-consumer): add SpacesConsumer orchestrator with member cross-check"
```

### Task 9: Schema additions

**Files:**
- Modify: `packages/db/src/schema.ts` — add `did_rotation_history` and `spaces_consumer_cursor` tables

Per CLAUDE.md Pitfall #16: "CSN is a PoC with no production data; schema changes go directly into `packages/db/src/schema.ts`." Do NOT create new migration files.

**Scope note:** `space_credential` table is deferred to Stage 2 (per design review). Stage 1's `SpaceCredentialStore` uses the in-memory impl only; persistence becomes meaningful once we actually issue credentials against a real arbiter.

- [ ] **Step 1: Read current schema.ts head section to confirm conventions**

```bash
head -80 packages/db/src/schema.ts
```

Confirm: how tables are declared, naming, whether UUIDs or AT URIs are used as PKs, where `Generated`/`ColumnType` apply.

- [ ] **Step 2: Add `did_rotation_history` table**

```typescript
// packages/db/src/schema.ts (insert in appropriate alphabetical location)
export interface DidRotationHistoryTable {
  id: Generated<string>;
  current_did: string;
  prior_did: string;
  rotated_at: Date;
  evidence_uri: string | null; // PLC operation reference, if available
  recorded_at: Generated<Date>;
}
```

And add to `Database` interface:

```typescript
did_rotation_history: DidRotationHistoryTable;
```

- [ ] **Step 3: Add `spaces_consumer_cursor` table**

```typescript
export interface SpacesConsumerCursorTable {
  cooperative_did: string;
  space_type: string;
  space_skey: string;
  member_did: string;
  cursor: string; // rev or seq, upstream-protocol-dependent
  updated_at: Generated<Date>;
}
```

Composite primary key on `(cooperative_did, space_type, space_skey, member_did)`.

- [ ] **Step 4: Run schema build**

```bash
pnpm --filter @coopsource/db build
```

Expected: clean build.

- [ ] **Step 5: Run db migrate to re-apply schema**

```bash
pnpm --filter @coopsource/db migrate
```

Expected: new tables created.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema.ts
git commit -m "feat(db): add V11 Stage 1 schema (did_rotation_history, spaces_consumer_cursor)"
```

### Task 10: Persistent cursor store (Kysely-backed)

**Files:**
- Create: `packages/spaces-consumer/src/kysely-cursor-store.ts`
- Test: `packages/spaces-consumer/src/__tests__/kysely-cursor-store.test.ts`

The in-memory cursor map in Task 8's test is fine for unit tests; production needs persistence. Implement `CursorStore` against the `spaces_consumer_cursor` table.

**Test environment**: use the existing test DB pattern in the repo (locate via `grep -r "describe.*db\|kysely" apps/api/src/services/*.test.ts | head -5` — the repo likely has either a Vitest setup that runs against `coopsource_test` Postgres or a `pg-mem` shim). Follow that pattern; do not introduce a new one.

- [ ] **Step 1: Write failing test**

```typescript
// packages/spaces-consumer/src/__tests__/kysely-cursor-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Kysely, PostgresDialect } from 'kysely';
import type { Database } from '@coopsource/db';
import { KyselyCursorStore } from '../kysely-cursor-store.js';
import { createTestDb, resetTestDb } from './helpers/db.js'; // wire to repo's existing helper

describe('KyselyCursorStore', () => {
  let db: Kysely<Database>;
  let store: KyselyCursorStore;
  const key = 'did:plc:coop|network.coopsource.org.cooperative|members|did:plc:alice';

  beforeEach(async () => {
    db = await createTestDb();
    await resetTestDb(db);
    store = new KyselyCursorStore(db);
  });

  it('returns "0" for an unknown cursor key', async () => {
    expect(await store.get(key)).toBe('0');
  });

  it('persists a cursor and reads it back', async () => {
    await store.set(key, 'rev-42');
    expect(await store.get(key)).toBe('rev-42');
  });

  it('upserts on conflict (later set replaces earlier value)', async () => {
    await store.set(key, 'rev-1');
    await store.set(key, 'rev-2');
    expect(await store.get(key)).toBe('rev-2');
  });

  it('scopes cursors per member DID', async () => {
    const otherKey = 'did:plc:coop|network.coopsource.org.cooperative|members|did:plc:bob';
    await store.set(key, 'rev-alice');
    await store.set(otherKey, 'rev-bob');
    expect(await store.get(key)).toBe('rev-alice');
    expect(await store.get(otherKey)).toBe('rev-bob');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (module not found)**

```bash
pnpm --filter @coopsource/spaces-consumer test
```

- [ ] **Step 3: Implement against Kysely**

```typescript
// packages/spaces-consumer/src/kysely-cursor-store.ts
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { CursorStore } from './consumer.js';

export class KyselyCursorStore implements CursorStore {
  constructor(private readonly db: Kysely<Database>) {}

  async get(key: string): Promise<string> {
    const [coop, type, skey, member] = key.split('|');
    const row = await this.db
      .selectFrom('spaces_consumer_cursor')
      .select('cursor')
      .where('cooperative_did', '=', coop!)
      .where('space_type', '=', type!)
      .where('space_skey', '=', skey!)
      .where('member_did', '=', member!)
      .executeTakeFirst();
    return row?.cursor ?? '0';
  }

  async set(key: string, value: string): Promise<void> {
    const [coop, type, skey, member] = key.split('|');
    await this.db
      .insertInto('spaces_consumer_cursor')
      .values({ cooperative_did: coop!, space_type: type!, space_skey: skey!, member_did: member!, cursor: value })
      .onConflict((oc) =>
        oc.columns(['cooperative_did', 'space_type', 'space_skey', 'member_did']).doUpdateSet({ cursor: value }),
      )
      .execute();
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/spaces-consumer
git commit -m "feat(spaces-consumer): add Kysely-backed CursorStore"
```

### Task 11: apps/api dispatch glue

**Files:**
- Create: `apps/api/src/appview/spaces-consumer-dispatch.ts`
- Modify: `apps/api/src/container.ts` — wire `spacesConsumer`
- Modify: `apps/api/src/config.ts` — add `SPACES_CONSUMER_ENABLED`, `UNSAFE_SKIP_ECMH`
- Modify: `apps/api/src/routes/health.ts` — surface `spacesConsumer.health()` (locate exact filename first — health route may live elsewhere)

The dispatch wraps the `SpacesConsumer` and feeds accepted records to the same hook pipeline `loop.ts` uses (`processFirehoseEvent`). The consumer is feature-flagged: in V11 Stage 1, `SPACES_CONSUMER_ENABLED=false` by default. Real reference target (HappyView vs. direct against `permissioned-data` branch) is deferred entirely per the design-review decision — Stage 1 wires the dispatch but it never fires against real data.

**Verifier wiring:** default is `FailClosedEcmhVerifier`. Setting `UNSAFE_SKIP_ECMH=true` swaps in `AlwaysOkEcmhVerifier` and logs a loud `warn`-level message at startup. Production deploys must leave `UNSAFE_SKIP_ECMH` unset; the flag exists only for explicit local development before the real verifier lands.

- [ ] **Step 1: Add `@coopsource/spaces-consumer` to `apps/api/package.json` deps**

```bash
pnpm --filter @coopsource/api add @coopsource/spaces-consumer@workspace:*
```

- [ ] **Step 2: Read `apps/api/src/appview/loop.ts` and `apps/api/src/appview/hooks/pipeline.ts` to confirm the dispatch shape**

The new dispatch must produce a `FirehoseEvent`-shaped payload (or an analogue) the hook pipeline accepts. The exact event shape determines how `PulledRecord` is adapted.

- [ ] **Step 3: Create `spaces-consumer-dispatch.ts`**

```typescript
// apps/api/src/appview/spaces-consumer-dispatch.ts
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import {
  SpacesConsumer,
  KyselyCursorStore,
  InMemoryNotificationSubscriber,  // sketch — Stage 2+ provides real
  DenyAllArbiterMemberList,         // fail-closed default — Stage 2 provides real
  InMemoryRepoPuller,               // sketch — real impl wraps @atproto/sync
  FailClosedEcmhVerifier,           // fail-closed default — gated on ECMH spec finalization
  AlwaysOkEcmhVerifier,             // test/dev-only; opt-in via UNSAFE_SKIP_ECMH
  type EcmhVerifier,
  type SpaceRef,
  type PulledRecord,
} from '@coopsource/spaces-consumer';
import type { HookRegistry } from './hooks/registry.js';
import { logger } from '../middleware/logger.js';

export interface SpacesConsumerDispatchConfig {
  readonly enabled: boolean;
  readonly unsafeSkipEcmh: boolean;
  readonly hookRegistry: HookRegistry;
  readonly db: Kysely<Database>;
  readonly spaces: ReadonlyArray<SpaceRef>;
}

export async function startSpacesConsumer(cfg: SpacesConsumerDispatchConfig): Promise<SpacesConsumer | null> {
  if (!cfg.enabled) {
    logger.info('Spaces consumer disabled by config');
    return null;
  }

  let verifier: EcmhVerifier = new FailClosedEcmhVerifier();
  if (cfg.unsafeSkipEcmh) {
    logger.warn('UNSAFE_SKIP_ECMH=true — ECMH digest verification DISABLED. Never run with this flag in production.');
    verifier = new AlwaysOkEcmhVerifier();
  }

  const consumer = new SpacesConsumer({
    subscriber: new InMemoryNotificationSubscriber({ clock: () => new Date() }),
    memberList: new DenyAllArbiterMemberList(), // fail-closed default; Stage 2 wires real
    puller: new InMemoryRepoPuller([]),         // sketch only; never fires against real data in Stage 1
    verifier,
    cursors: new KyselyCursorStore(cfg.db),
    onAccepted: async (r: PulledRecord) => {
      // Stage 1 logs only. Adaptation to the hook pipeline's FirehoseEvent shape
      // (see loop.ts -> processFirehoseEvent) is deferred to whenever a real
      // RepoPuller produces real records. At that point, fill this in by reading
      // loop.ts's event construction.
      logger.info({ uri: r.uri, author: r.authorDid }, 'spaces-consumer: accepted record (stage 1: log-only)');
    },
    onError: async (err, ctx) => {
      logger.warn({ err, ctx }, 'spaces-consumer: handler error');
    },
    clock: () => new Date(),
  });

  await consumer.start(cfg.spaces);
  logger.info({ spaces: cfg.spaces.length, verifier: cfg.unsafeSkipEcmh ? 'AlwaysOk' : 'FailClosed' }, 'Spaces consumer started');
  return consumer;
}
```

- [ ] **Step 4: Wire into `container.ts`**

```typescript
// apps/api/src/container.ts (additions only — exact insertion point depends on existing structure)
import { startSpacesConsumer } from './appview/spaces-consumer-dispatch.js';
// ... after existing firehose loop is started ...
const spacesConsumer = await startSpacesConsumer({
  enabled: config.SPACES_CONSUMER_ENABLED,
  unsafeSkipEcmh: config.UNSAFE_SKIP_ECMH,
  hookRegistry,
  db,
  spaces: [], // Stage 1: empty by design; real subscriptions land with Stage 2 arbiter integration
});
```

- [ ] **Step 5: Add config entries to `config.ts`**

```typescript
// apps/api/src/config.ts
SPACES_CONSUMER_ENABLED: z.coerce.boolean().default(false),
UNSAFE_SKIP_ECMH: z.coerce.boolean().default(false),
```

- [ ] **Step 6: Surface health**

In the health route (locate exact file first), add a `spacesConsumer` field to the health response, delegating to `spacesConsumer.health()`.

- [ ] **Step 7: Run typecheck + build + tests across api and consumer packages**

```bash
pnpm --filter @coopsource/spaces-consumer build
pnpm --filter @coopsource/api build
pnpm --filter @coopsource/spaces-consumer test
pnpm --filter @coopsource/api test
pnpm -r typecheck 2>/dev/null || pnpm -r exec tsc --noEmit
```

Expected: clean across all three. The `tsc --noEmit` fallback catches strict-mode regressions that a build alone might miss.

- [ ] **Step 8: Commit**

```bash
git add apps/api packages/spaces-consumer
git commit -m "feat(api): wire spaces consumer into container alongside Tap loop"
```

### Task 12: Documentation update

**Files:**
- Modify: `CLAUDE-CODE-PROMPT-V11.md` — under Stage 1, note progress
- Create: `packages/spaces-consumer/README.md` — package overview, sketch-vs-real status table

- [ ] **Step 1: Add a Stage 1 progress note to CLAUDE-CODE-PROMPT-V11.md**

Mark Stage 1 tasks 1-6 (package skeleton + interfaces) as completed; note that sketch implementations are placeholders for ECMH verifier, notification subscriber, repo puller, and arbiter member list — each tracked to upstream resolution.

- [ ] **Step 2: Create package README**

```markdown
# @coopsource/spaces-consumer

Pull-based consumer over ATProto permissioned spaces. Layer 1 substrate for the V11 architecture (see ARCHITECTURE-V11.md §16 Stage 1).

## Interfaces and sketch impls

| Interface | Default sketch | Test-only sketch | Real impl gated by |
|---|---|---|---|
| `SpaceCredentialStore` | `InMemorySpaceCredentialStore` | — | Persistence becomes meaningful in Stage 2 |
| `ArbiterMemberList` | `DenyAllArbiterMemberList` (fail-closed) | `StaticArbiterMemberList` | V11 Stage 2 (arbiter integration) |
| `NotificationSubscriber` | `InMemoryNotificationSubscriber` | — | Upstream notification protocol resolution |
| `RepoPuller` | `InMemoryRepoPuller([])` (empty) | `InMemoryRepoPuller(records)` | `@atproto/sync` integration against `permissioned-data` branch |
| `EcmhVerifier` | `FailClosedEcmhVerifier` | `AlwaysOkEcmhVerifier` (opt-in via UNSAFE_SKIP_ECMH) | ECMH spec finalization + JS library decision |

## Security boundaries

- Records authored by DIDs not on the arbiter's authoritative member list are discarded. Cross-check happens twice: at notification handling (member iteration) and per-record (defense in depth).
- Sketches default to fail-closed (`DenyAllArbiterMemberList`, `FailClosedEcmhVerifier`) so accidental production wiring cannot silently bypass verification.
- `AlwaysOkEcmhVerifier` is reachable only via the explicit `UNSAFE_SKIP_ECMH=true` config flag, which logs a loud startup warning.
- Credentials are bearer tokens. Use the credential store; never log tokens.
- Per CLAUDE-CODE-PROMPT-V11.md "Distinguishing Authorization Failures": this consumer touches Axis 2 (space membership) — never collapse it with Axis 1 (OAuth scope) or Axis 3 (application logic).
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE-CODE-PROMPT-V11.md packages/spaces-consumer/README.md
git commit -m "docs: note Stage 1 progress and add spaces-consumer README"
```

### Task 13: Migrate plan to docs/superpowers/plans/

**Files:**
- Create: `docs/superpowers/plans/2026-05-11-v11-stage-1-spaces-consumer.md`

- [ ] **Step 1: Copy the approved plan into the repo**

```bash
mkdir -p docs/superpowers/plans
cp /Users/alan/.claude/plans/we-have-a-new-virtual-pumpkin.md \
   docs/superpowers/plans/2026-05-11-v11-stage-1-spaces-consumer.md
```

- [ ] **Step 2: Strip the plan-mode-specific preamble**

Remove the "Final plan output" note at the top (which referenced the planned migration to this path) — once the plan is at its canonical path, that line is no longer informative.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans
git commit -m "docs: capture V11 Stage 1 plan under docs/superpowers/plans/"
```

---

## Exit Criteria for Stage 1

Stage 1 is **done** when all of the following hold. Anything beyond this list is Stage 2+ work.

1. `@coopsource/spaces-consumer` package exists and builds clean under strict mode.
2. The five interfaces (`SpaceCredentialStore`, `ArbiterMemberList`, `NotificationSubscriber`, `RepoPuller`, `EcmhVerifier`) plus the `SpacesConsumer` orchestrator and `KyselyCursorStore` are implemented.
3. Every sketch impl fails closed (`DenyAllArbiterMemberList`, `FailClosedEcmhVerifier`) or is empty by default (`InMemoryRepoPuller([])`, `InMemoryNotificationSubscriber` with no subscriptions).
4. Unit tests cover: cursor store roundtrip, member-list cross-check (accept member, reject non-member), digest-mismatch path, error-callback path. All pass under `pnpm --filter @coopsource/spaces-consumer test`.
5. `apps/api/src/appview/spaces-consumer-dispatch.ts` wires the consumer into the container. `SPACES_CONSUMER_ENABLED=false` is the default; flipping to `true` does not error.
6. Health endpoint exposes `spacesConsumer` health alongside `firehose` health.
7. Schema additions (`did_rotation_history`, `spaces_consumer_cursor`) are in `schema.ts` and applied via `pnpm --filter @coopsource/db migrate`.
8. V9 service tests continue to pass — Stage 1 is purely additive.

Stage 1 is **explicitly NOT done by** consuming from a real arbiter, against real records, or with the real ECMH verifier. Those depend on Stage 2 (arbiter integration) and on upstream protocol resolution.

---

## Verification

End-to-end verification of the exit criteria:

1. **Build:** `pnpm install && pnpm build` → clean compile across all packages.
2. **Tests:** `pnpm test` → all package-level tests pass, including the new `@coopsource/spaces-consumer` suite.
3. **Schema:** `make db-reset` → fresh DB has `did_rotation_history` and `spaces_consumer_cursor` tables.
4. **Boot disabled:** `make dev` → `apps/api` starts with `SPACES_CONSUMER_ENABLED=false`; health endpoint reports `spacesConsumer: null` (or equivalent disabled signal).
5. **Boot enabled, defaults:** `SPACES_CONSUMER_ENABLED=true make dev` → consumer starts with `DenyAllArbiterMemberList` + `FailClosedEcmhVerifier`; health reports `subscribedSpaces: 0`; startup log shows verifier `FailClosed`. No crashes.
6. **Boot enabled, unsafe skip:** `SPACES_CONSUMER_ENABLED=true UNSAFE_SKIP_ECMH=true make dev` → startup log includes the loud `warn` about disabled ECMH; verifier shows `AlwaysOk` in startup log. Confirms the opt-in path is loud.
7. **No regressions:** V9 smoke tests (`make test:all` or `pnpm test`) continue to pass — Stage 1 is purely additive and gated off by default.

---

## Out of scope for Stage 1

The following are intentionally deferred per the design-review decisions and ARCHITECTURE-V11.md §16:

- Real `EcmhVerifier` — requires upstream ECMH spec finalization + JS library selection.
- Real `RepoPuller` over `@atproto/sync` — requires permissioned-data branch stabilization.
- Real `NotificationSubscriber` — requires arbiter notification protocol resolution.
- Real `ArbiterMemberList` — Stage 2 deliverable.
- HappyView vs. direct reference-target decision — deferred entirely; no reference target wired in Stage 1.
- `space_credential` table + Kysely-backed credential store — Stage 2 (only meaningful with a real arbiter issuing credentials).
- Hook-pipeline event-shape adaptation for `PulledRecord` — done when a real puller produces real records (Stage 2+); Stage 1's dispatch logs only.
- `MembershipService` rewiring to read from arbiter projection — Stage 3.
- Removal of bilateral membership state machine — Stage 3.
- Full-repo resync on digest mismatch — error path is counted in health; full handler in a follow-up task.
- Cross-arbiter trust verification (service-auth JWTs) — Stage 3+.

These deferrals are deliberate. The Stage 1 deliverable is the skeleton, interfaces, fail-closed security boundaries, and dispatch wiring — *not* a production-ready consumer. Per the V11 working posture: "build behind interfaces with sketch implementations" until upstream protocol details settle.

---

## Self-Review Notes

- **Spec coverage**: Six of seven Stage 1 tasks from CLAUDE-CODE-PROMPT-V11.md are covered (package, credential store, ECMH, notification, member cross-check, container wiring). Task 7 (HappyView vs. direct reference target) is **deliberately deferred** per design-review decision — captured in Out-of-Scope.
- **Pre-flight**: Three pre-flight tasks (P1-P3) cover the user's selected items (CLAUDE.md verify, memory refresh, ecosystem refresh cadence).
- **Placeholder scan**: No TBDs except where ARCHITECTURE-V11.md §18 explicitly lists items as upstream-dependent. Sketch implementations are explicit, named, fail-closed by default, and gated to upstream resolution.
- **Type consistency**: `SpaceRef`, `PulledRecord`, `ConsumerHealth`, `CursorStore`, `EcmhVerifier`, `SpacesConsumerOptions` (with `onError`) are defined once and used consistently across all tasks. Verifier names (`FailClosedEcmhVerifier`, `AlwaysOkEcmhVerifier`) match across Task 6 implementation, Task 8 tests, Task 11 dispatch, Task 12 README.
- **Security-default review**: All sketch impls fail closed (deny-all member list, fail-closed verifier, empty puller). The only way to reach an "accepts everything" verifier is the explicit `UNSAFE_SKIP_ECMH=true` flag, which logs a loud warning.
- **Skipped**: Custom-DID minting, OAuth scope wiring, write paths — all Stage 2+ concerns. Plan is read-only consumer focused.
- **Test hygiene**: `as any` casts removed from test fixtures; replaced with a single `__tests__/helpers/factories.ts` that contains the one `as unknown as T` cast for branded types.
- **Error visibility**: `onError` callback in `SpacesConsumerOptions` replaces silent `errorCount` increment; dispatch wires it to `logger.warn`.
