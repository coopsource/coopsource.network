# CLAUDE-CODE-PROMPT-V10.md — Privacy, Access Control & Deferred V9 Completion

> **For**: Claude Code / Claude agents working on the Co-op Source Network codebase
> **Architecture reference**: ARCHITECTURE-V10.md
> **Codebase reference**: CLAUDE.md (constraints, patterns, build commands)
> **Deployment reference**: DEPLOYMENT.md
> **Lexicon reference**: packages/lexicons/LEXICONS.md
> **Date**: April 16, 2026
> **Status**: Active

---

## Your Role

You are implementing the Co-op Source Network V10 — privacy, access control, and deferred V9 completion. The codebase is a working monorepo with 47 lexicons under `network.coopsource.*`, ~60 services, 16 XRPC handler files, a mature hook pipeline, and a SvelteKit frontend. V6 (ATProto federation), V7 (hook pipeline, scripting), V8.1–V8.11 (Home, Profiles, Search, Matchmaking), and V9.1–V9.3 (cooperative write path, governance AppView API, Inlay components) are complete and merged.

**V10 focuses on privacy-by-default and graduated access control.** Read ARCHITECTURE-V10.md thoroughly before making any decisions.

**For full codebase context, patterns, and constraints, read CLAUDE.md.** It is the authoritative reference for technology choices, git workflow, and design principles.

---

## PoC Mode — No Migrations, No Production Data Preservation

CSN is currently a **proof-of-concept project**. This changes how schema work is done:

- The previous 63 migration files have been archived (moved to `packages/db/src/migrations/.archive/`). The active `migrations/` directory contains zero migration files.
- **Do NOT create new migration files.** When schema changes are needed, update `packages/db/src/schema.ts` directly (both the TypeScript table interfaces and the init SQL path that creates columns/indexes/constraints fresh).
- **The migration infrastructure is preserved intact**: `packages/db/src/migrate.ts`, Kysely's `FileMigrationProvider`, and the `migrations/` directory are all still in place for the day this PoC converts to a production project. At that point, the accumulated schema becomes migration `001_initial.ts`.
- **No data migration, no PDS record migration, no rollout ceremony.** Privacy-by-default just means the defaults are private. Existing dev databases and PDSes are rebuilt fresh from schema on demand.
- **Running `pnpm --filter @coopsource/db migrate` currently does nothing** (no migration files to run). This is expected. Dev setup relies on the rebuild-fresh flow.

If the user asks for a migration file, stop and confirm — migrations are not being written until the PoC converts to production.

---

## Critical Constraints (from CLAUDE.md — Non-Negotiable)

- **TypeScript strict mode** — no `any`, no unsafe casts
- **Express 5** — standard routes; `@atproto/xrpc-server` is NOT used
- **Kysely 0.28+** — NOT Prisma, Drizzle, or TypeORM
- **SvelteKit 2** with **Svelte 5** runes
- **Vite 7** — Tailwind CSS 4 plugin MUST come BEFORE `sveltekit()`
- **pnpm 10+** workspace, **Turborepo 2+**, **Vitest 4**, **Zod 4**, **Node.js 24 LTS**
- **Bilateral membership is non-negotiable** — active ONLY when BOTH records exist (but in V10 the cooperative-side record is routed through VisibilityRouter, not written directly to PDS)
- **Role authority is ONLY in memberApproval** — never self-declared
- **DIDs are authoritative** — never handles for security
- **Records of authority live in PDS repos** — **EXCEPT** records at Tier 2 and above, which live in `private_record`. The `membership` PostgreSQL table remains the materialized access-check source.
- **Tier 2 private data NEVER touches the firehose**
- **All work on feature branches** — never commit directly to `main`
- **Clean up merged branches** — delete after merge

---

## V10 Design Decisions (Binding)

Three decisions that drive every V10 implementation choice:

1. **Privacy-by-default for membership**: `cooperative_profile.membership_public` defaults to `false` for all cooperatives. Opt-in to public membership is explicit.

2. **Private votes by default**: `cooperative_profile.vote_visibility` defaults to `'private'`. Votes are stored in `private_record` with `owner_did = voterDid` and `visibility_tier = 'all_member'`. Fellow members can see individual votes (accountability); external parties see only aggregate tallies via an anchor on the proposal record.

3. **Six-tier visibility with split individual tier**:
   - `public` (0) — anyone
   - `all_member` (1) — active members
   - `officer` (2) — members with officer roles (`secretary`, `treasurer`, `auditor`, `financial-admin`, `staff`, or custom roles with `grants:officer_access`)
   - `board` (3) — members with board roles (`board-member`, `president`, `vice-president`, `admin`, or custom roles with `grants:board_access`)
   - `individual` (4) — the `owner_did` PLUS members with financial-officer roles (`treasurer`, `auditor`, `financial-admin`) — for patronage, capital accounts, tax records
   - `individual_strict` (5) — the `owner_did` only — for contact info, future ZK-ballot identity commitments

---

## V10 Phases Overview

| Phase | Branch | Priority | Depends On |
|-------|--------|----------|------------|
| V10.1 | `feature/v10.1-graduated-visibility` | **Immediate** | None |
| V10.2 | `feature/v10.2-membership-privacy` | **Immediate** | V10.1 |
| V10.3 | `feature/v10.3-vote-privacy` | **High** | V10.1 |
| V10.4 | `feature/v10.4-content-wrappers` | Medium | None |
| V10.5 | `feature/v10.5-transparency-logs` | Medium-High | V10.1 |
| V10.6 | `feature/v10.6-opensocial-bridge` | Deferred | V10.2 |
| V10.7 | N/A | Ongoing | V10.2 |
| V10.8 | `feature/v10.8-space-adapter` | Deferred | Spaces spec |

Start with V10.1. It unblocks V10.2, V10.3, and V10.5.

---

## Phase V10.1: Graduated Visibility Infrastructure

### Context

The `private_record` table treats all Tier 2 data uniformly — no distinction between board-only and all-member data. `VisibilityRouter` is binary (tier 1 or tier 2). `assertGovernanceAccess` at `apps/api/src/xrpc/handlers/open-governance-gate.ts` only gates closed-coop 404. There's no single utility that resolves "viewer's maximum visibility tier in this cooperative."

V10.1 adds graduated visibility on top of the existing infrastructure without replacing anything that works. The `membership_role` table and `role_definition` table are the existing role primitives and are preserved.

### Tasks

**Task 1: Schema changes in `packages/db/src/schema.ts`**

No migration file. Update the Kysely table interfaces **and** the DB initialization path (rebuild-fresh flow) to include the new columns, constraints, and indexes.

Columns to add to `PrivateRecordTable`:
- `visibility_tier TEXT NOT NULL DEFAULT 'all_member'` with CHECK constraint on `('all_member', 'officer', 'board', 'individual', 'individual_strict')`
- `owner_did TEXT` (nullable)

Indexes to add:
- Composite: `(did, collection, visibility_tier)` for primary tier-filter queries
- Partial: `owner_did WHERE owner_did IS NOT NULL` for individual-tier lookups

Columns to add to `CooperativeProfileTable`:
- `membership_public BOOLEAN NOT NULL DEFAULT false`
- `vote_visibility TEXT NOT NULL DEFAULT 'private'` with CHECK on `('public', 'private')`
- `deliberation_visibility TEXT NOT NULL DEFAULT 'all_member'` with CHECK on `('all_member', 'officer', 'board')`
- `public_officers BOOLEAN NOT NULL DEFAULT false`

Update the TypeScript interface literals in `schema.ts` to match exactly. Run `pnpm build` to confirm types flow through.

Since the migrations directory is empty, the DB is built fresh from the schema file. Document in the schema file's header comment that the "fresh build" path is authoritative during PoC mode, and that when the PoC converts to production, the entire schema file becomes migration `001_initial.ts`.

**Task 2: Build `checkVisibilityAccess` utility**

File: `apps/api/src/xrpc/handlers/visibility-access.ts` (new)

Must export:
- `VisibilityTier` type union
- `TIER_ORDER` constant
- `BOARD_ROLES`, `OFFICER_ROLES`, `FINANCIAL_OFFICER_ROLES` sets
- `checkVisibilityAccess(db, cooperativeDid, viewer, membershipService)` — calls `assertGovernanceAccess` internally for the closed-coop 404 gate, then resolves viewer's `maxTier` from `viewerMembership.roles`, and resolves `isFinancialOfficer` boolean
- `resolveCustomRoleTier(db, cooperativeDid, roles)` — queries `role_definition` for non-standard roles and returns `'board' | 'officer' | null` based on `permissions` array containing `grants:board_access` or `grants:officer_access`
- `canAccessTier(viewerMaxTier, recordTier, viewerIsFinancialOfficer, recordOwnerDid, viewerDid)` — the gating function, with individual/individual_strict treated specially

`assertGovernanceAccess` at `open-governance-gate.ts` is **retained and reused** — `checkVisibilityAccess` delegates to it for the cooperative lookup and closed-coop gate.

**Task 3: Extend `VisibilityRouter.routeWrite`**

File: `apps/api/src/services/visibility-router.ts` (modify)

Add to `RouteWriteParams`:
```typescript
visibilityTier?: VisibilityTier;
ownerDid?: string;
```

Logic:
- If `visibilityTier === 'public'` → tier 1 (PDS)
- If `visibilityTier === 'all_member' | 'officer' | 'board'` → tier 2, store with that tier
- If `visibilityTier === 'individual' | 'individual_strict'` → tier 2, store with that tier; **require** `ownerDid` (throw `ValidationError` if missing)
- Existing behavior preserved when `visibilityTier` absent

`PrivateRecordService.create` must accept `visibilityTier` and `ownerDid` params and persist them.

**Task 4: Extend `PrivateRecordService.list` and `.get`**

File: `apps/api/src/services/private-record-service.ts` (modify)

New params on `list`:
```typescript
async list(
  cooperativeDid: string,
  params: PageParams & {
    collection?: string;
    maxVisibilityTier?: VisibilityTier;
    viewerDid?: string;
    viewerIsFinancialOfficer?: boolean;
  },
): Promise<Page<PrivateRecord>>
```

Query filter:
```sql
WHERE did = :cooperativeDid
  AND CASE
    WHEN visibility_tier IN ('all_member', 'officer', 'board')
      THEN /* tier order <= maxVisibilityTier order */
    WHEN visibility_tier = 'individual'
      THEN (owner_did = :viewerDid OR :viewerIsFinancialOfficer = true)
    WHEN visibility_tier = 'individual_strict'
      THEN owner_did = :viewerDid
  END
```

Tier ordering in the query uses a `CASE` expression mapping each tier string to its numeric rank. Do not use string comparison — it's fragile against future tier additions.

**Task 5: Migrate XRPC handlers**

All handlers that currently call `assertGovernanceAccess` must migrate to `checkVisibilityAccess`. The migration is mechanical: wherever you have `{ coop, viewerMembership } = await assertGovernanceAccess(...)`, replace with `{ coop, viewerMembership, maxTier, isFinancialOfficer } = await checkVisibilityAccess(...)` and use `maxTier` to gate output projections.

Files to modify:
- `apps/api/src/xrpc/handlers/list-members.ts` — current three-tier logic becomes tier-driven: unauth sees only `directory_visible` members; `maxTier >= 'all_member'` sees full detail; between (auth non-member) sees redacted
- `apps/api/src/xrpc/handlers/get-proposal.ts` — body/options returned for `maxTier >= 'all_member'`; tally detail by-voter for `maxTier >= 'all_member'`, aggregate-only otherwise
- `apps/api/src/xrpc/handlers/get-vote-eligibility.ts` — minimal change; already requires `'viewer'` auth
- `apps/api/src/xrpc/handlers/inlay-membership-status.ts` — replace inline closed-coop check
- `apps/api/src/xrpc/handlers/inlay-vote-widget.ts` — pass `maxTier` into vote-display logic
- `apps/api/src/xrpc/handlers/get-officers.ts` — gate by `public_officers` flag: if false, requires `maxTier >= 'all_member'`

**Task 6: Test strategy**

Unit tests for `visibility-access.ts` must cover:
- Each role combination → correct `maxTier`
- Custom roles via `role_definition.permissions` — `grants:officer_access` escalates `all_member` → `officer`
- Board role member with non-financial-officer status cannot access individual tier
- Owner of an individual-strict record accesses it; non-owner (even board) cannot
- Owner of an individual record accesses it; financial officer (non-owner) accesses it; board member (non-owner, non-financial) cannot

Integration tests must verify:
- `PrivateRecordService.list` with each tier filter combination returns correct rows
- XRPC handlers return correctly-gated projections

Regression: full E2E suite must pass against a freshly-rebuilt DB with V10.1 schema changes. The backfill default of `'all_member'` preserves current behavior for all existing Tier 2 private records.

### Key Files Summary

- `packages/db/src/schema.ts` (modify — add columns, constraints, indexes to table interfaces + init SQL)
- `apps/api/src/xrpc/handlers/visibility-access.ts` (new)
- `apps/api/src/xrpc/handlers/open-governance-gate.ts` (preserved — called by checkVisibilityAccess)
- `apps/api/src/services/visibility-router.ts` (modify)
- `apps/api/src/services/private-record-service.ts` (modify)
- `apps/api/src/xrpc/handlers/list-members.ts` (modify)
- `apps/api/src/xrpc/handlers/get-proposal.ts` (modify)
- `apps/api/src/xrpc/handlers/get-vote-eligibility.ts` (modify)
- `apps/api/src/xrpc/handlers/inlay-membership-status.ts` (modify)
- `apps/api/src/xrpc/handlers/inlay-vote-widget.ts` (modify)
- `apps/api/src/xrpc/handlers/get-officers.ts` (modify)

---

## Phase V10.2: Membership Privacy (Anchor + Sidecar)

### Context

`MembershipService.approveInvitation` at `apps/api/src/services/membership-service.ts` directly calls `this.pdsService.createRecord` to write `memberApproval` records to the cooperative's public PDS. This leaks member DIDs to the firehose. V10.2 replaces this with an anchor + sidecar: a public `membershipSummary` record with only aggregate counts, and private `memberApproval` records in `private_record` with `visibility_tier = 'all_member'`.

### Tasks

**Task 1: Define `membershipSummary` lexicon**

File: `packages/lexicons/network/coopsource/org/membershipSummary.json` (new)

```json
{
  "lexicon": 1,
  "id": "network.coopsource.org.membershipSummary",
  "defs": {
    "main": {
      "type": "record",
      "description": "Public aggregate membership summary. Contains only counts and policy — never identifying data, not even hashed DIDs. Updated by a post-storage hook on membership state changes.",
      "key": "literal:self",
      "record": {
        "type": "object",
        "required": ["activeMemberCount", "membershipPolicy", "updatedAt"],
        "properties": {
          "activeMemberCount": { "type": "integer", "minimum": 0 },
          "pendingCount": { "type": "integer", "minimum": 0 },
          "membershipPolicy": {
            "type": "string",
            "knownValues": ["open", "approval_required", "invitation_only"]
          },
          "membershipPublic": { "type": "boolean" },
          "updatedAt": { "type": "string", "format": "datetime" }
        }
      }
    }
  }
}
```

Run `pnpm --filter @coopsource/lexicons lex:generate` to regenerate types.

**Task 2: Extend `OperatorWriteProxy` with `deleteRecord`**

File: `apps/api/src/services/operator-write-proxy.ts` (modify)

Add `deleteRecord(params: { operatorDid, cooperativeDid, collection, rkey })` method that verifies authorization (same as `writeCoopRecord`), calls `pdsService.deleteRecord`, and writes an `operator_audit_log` entry with `operation: 'delete'`.

**Task 3: Route `memberApproval` through `VisibilityRouter`**

File: `apps/api/src/services/membership-service.ts` (modify)

Replace the direct PDS write in `approveInvitation` (around line 210):

Current:
```typescript
const approvalRef = await this.pdsService.createRecord({
  did: cooperativeDid as DID,
  collection: 'network.coopsource.org.memberApproval',
  record: { member: memberDid, roles, createdAt: now.toISOString() },
});
```

New:
```typescript
const coopProfile = await this.db
  .selectFrom('cooperative_profile')
  .where('entity_did', '=', cooperativeDid)
  .select('membership_public')
  .executeTakeFirst();
const isPublic = coopProfile?.membership_public === true;

const approvalRef = await this.visibilityRouter.routeWrite({
  cooperativeDid,
  collection: 'network.coopsource.org.memberApproval',
  record: { member: memberDid, roles, createdAt: now.toISOString() },
  createdBy: approverDid ?? cooperativeDid,
  visibilityTier: isPublic ? 'public' : 'all_member',
});
// For tier 2 routes, approvalRef comes back with a synthetic URI; for tier 1, it's a real PDS URI
const approvalResult = {
  approvalRecordUri: approvalRef.uri ?? `at://${cooperativeDid}/network.coopsource.org.memberApproval/${approvalRef.rkey}`,
  approvalRecordCid: approvalRef.cid ?? 'private',
};
```

Note: `MembershipService` now needs `visibilityRouter` injected. Add it to the constructor signature and wire it in `apps/api/src/container.ts`.

Do the same for `updateMemberRoles` — it currently only updates the PostgreSQL role rows; in V10.2 it must also re-route the approval record if the cooperative's privacy setting has changed.

**Task 4: Build `MembershipSummaryHook`**

File: `apps/api/src/appview/hooks/builtin/membership-summary-hook.ts` (new)

- `phase: 'post-storage'`
- `source: 'builtin'`
- `collections: ['network.coopsource.org.memberApproval', 'network.coopsource.org.membership']`
- `priority: 50`
- Handler:
  - Aggregate counts from `membership` table for the cooperative
  - Look up cooperative's `membership_policy` and `membership_public`
  - Write updated `membershipSummary` record via `OperatorWriteProxy.writeCoopRecord` (or `putRecord` — use whichever matches the `literal:self` key pattern)
  - Implement 5-second debounce to coalesce rapid updates (use a Map of `cooperativeDid` → pending timer)

Register in `apps/api/src/appview/hooks/builtin/index.ts`.

**Task 5: Update `GovernanceLabeler`**

File: `apps/api/src/services/governance-labeler.ts` (modify)

Labels that reference member DIDs publicly (`member-suspended`) must be skipped when the cooperative has `membership_public: false`. Labels that reference proposals (`proposal-approved`, etc.) are unaffected.

Add a lookup in `emitLabel`: if `labelValue === 'member-suspended'`, check `cooperative_profile.membership_public` for the target cooperative and skip the emit if false. Add a log line when skipped so operators can see the policy is enforced.

**Task 6: Admin UI**

File: `apps/web/src/routes/(authed)/coop/[handle]/settings/+page.svelte` (modify)

Add a "Privacy" section with:
- `membership_public` toggle (default off, explain the consequences)
- `vote_visibility` toggle (default private)
- `deliberation_visibility` select (all_member / officer / board)
- `public_officers` toggle (default off)

Saving the page calls a new API endpoint that updates `cooperative_profile`.

**Task 7: Opensocial bridge guard**

File: `apps/api/src/services/opensocial-bridge-service.ts` (new — stub for V10.6, but the guard must exist in V10.2)

Hard-fail on enable attempt if cooperative has `membership_public: false`. UI hides the opensocial option for private-membership cooperatives.

### Impact on bilateral state machine

**Zero changes to the `membership` table or state transitions.** The `MembershipService` continues to read and write the `membership` PostgreSQL table, which drives all access checks. V10.2 only changes where the **ATProto `memberApproval` record** is stored. The `membership.approval_record_uri` column is set to the synthetic AT-URI for private records; existing bilateral tests continue to pass.

### Tests

- Unit: `MembershipSummaryHook` produces aggregate counts, never includes DIDs
- Unit: VisibilityRouter routes memberApproval by `membership_public`
- Unit: GovernanceLabeler skips `member-suspended` for private coops
- Integration: `listMembers` XRPC still works (reads PostgreSQL)
- Integration: opensocial bridge guard rejects enable
- Regression: all E2E tests pass with new defaults applied to freshly-seeded test coops

### Key Files Summary

- `packages/lexicons/network/coopsource/org/membershipSummary.json` (new)
- `apps/api/src/services/operator-write-proxy.ts` (modify — add deleteRecord)
- `apps/api/src/services/membership-service.ts` (modify — route via VisibilityRouter)
- `apps/api/src/services/governance-labeler.ts` (modify — privacy-aware emit)
- `apps/api/src/appview/hooks/builtin/membership-summary-hook.ts` (new)
- `apps/api/src/appview/hooks/builtin/index.ts` (register hook)
- `apps/api/src/container.ts` (inject visibilityRouter into membershipService)
- `apps/api/src/services/opensocial-bridge-service.ts` (new stub with guard)
- `apps/web/src/routes/(authed)/coop/[handle]/settings/+page.svelte` (modify)

---

## Phase V10.3: Vote & Deliberation Privacy

### Context

`ProposalService.castVote` at `apps/api/src/services/proposal-service.ts` writes the vote record to the voter's PDS via `memberWriteProxy.writeRecord`. The vote lexicon includes `voterDid`, `choice`, `rationale`, `delegatedFrom` — all public on the voter's repo. V10.3 routes private-cooperative votes to `private_record` instead.

### Tasks

**Task 1: Modify `ProposalService.castVote`**

File: `apps/api/src/services/proposal-service.ts` (modify)

Replace the single-path vote write with visibility-aware routing:

```typescript
const coopProfile = await this.db
  .selectFrom('cooperative_profile')
  .where('entity_did', '=', proposal.cooperative_did)
  .select('vote_visibility')
  .executeTakeFirst();
const isPrivate = coopProfile?.vote_visibility === 'private';

let ref: { uri: string; cid: string };
if (isPrivate && this.visibilityRouter) {
  const routed = await this.visibilityRouter.routeWrite({
    cooperativeDid: proposal.cooperative_did,
    collection: 'network.coopsource.governance.vote',
    record: voteRecord,
    createdBy: params.voterDid,
    visibilityTier: 'all_member',
    ownerDid: params.voterDid,
  });
  ref = {
    uri: `at://${proposal.cooperative_did}/network.coopsource.governance.vote/${routed.rkey}`,
    cid: 'private',
  };
} else if (this.memberWriteProxy) {
  ref = await this.memberWriteProxy.writeRecord({
    memberDid: params.voterDid as DID,
    collection: 'network.coopsource.governance.vote',
    record: voteRecord,
  });
} else {
  ref = await this.pdsService.createRecord({
    did: params.voterDid as DID,
    collection: 'network.coopsource.governance.vote',
    record: voteRecord,
  });
}
```

The existing `vote` PostgreSQL table insert (with `ref.uri` and `ref.cid`) is unchanged. Tally, eligibility, retraction, weight — all preserved.

**Task 2: Vote tally hook**

File: `apps/api/src/appview/hooks/builtin/vote-tally-hook.ts` (new)

- `phase: 'post-storage'`
- `collections: ['network.coopsource.governance.vote']`
- Handler: for cooperatives with `vote_visibility = 'private'`, recompute aggregate tally from the `vote` table and update the proposal record in the PDS with a new aggregate tally field.

The proposal lexicon doesn't need an immediate schema change — add the tally as an optional `publicTally` property if the existing lexicon allows additive optional fields (it does, per ATProto lexicon rules). For backward compatibility, no existing field is changed; consumers that don't know about `publicTally` ignore it.

Alternatively (cleaner): a separate `network.coopsource.governance.proposalTally` lexicon with `key: "literal:<proposalId>"` anchored to the cooperative's PDS. Choose based on how tightly you want to couple tally to proposal — I recommend the separate lexicon for cleaner separation of concerns, but either is acceptable.

**Task 3: Extend `get-proposal` handler**

File: `apps/api/src/xrpc/handlers/get-proposal.ts` (modify)

Use `checkVisibilityAccess` (from V10.1). For callers with `maxTier >= 'all_member'`, include per-voter tally breakdown in the `tally` array. For external callers (`maxTier === 'public'`), include only aggregate counts, no `voterDid` field.

**Task 4: Update VoteWidget Inlay**

File: `apps/api/src/xrpc/handlers/inlay-vote-widget.ts` (modify)

Use `checkVisibilityAccess`. The deep-link approach (existing) works for both public and private voting since the actual vote goes through CSN's authenticated API. No fundamental flow change — just tier-gate what's displayed in the element tree.

**Task 5: Deliberation routing**

File: `apps/api/src/services/post-service.ts` (modify)

For proposal-associated posts (the existing `proposal_id` field), check the cooperative's `deliberation_visibility` and route through `VisibilityRouter` with the corresponding tier when not `'all_member'` (the default implicit behavior for existing private_record storage).

### Tests

- Unit: private-vote flow routes to `private_record` with correct `owner_did` + `visibility_tier`
- Unit: public-vote flow preserves existing PDS write behavior
- Unit: vote-tally hook updates proposal tally record for private coops
- Integration: fellow member sees per-voter breakdown; external caller sees aggregate only
- Integration: Inlay VoteWidget works for both modes
- Integration: vote retraction works in both modes
- Regression: existing vote weight, quorum, outcome logic unchanged

### Key Files Summary

- `apps/api/src/services/proposal-service.ts` (modify — privacy-aware castVote)
- `apps/api/src/appview/hooks/builtin/vote-tally-hook.ts` (new)
- `apps/api/src/appview/hooks/builtin/index.ts` (register hook)
- `apps/api/src/xrpc/handlers/get-proposal.ts` (modify — tier-gate tally)
- `apps/api/src/xrpc/handlers/inlay-vote-widget.ts` (modify — tier-aware display)
- `apps/api/src/services/post-service.ts` (modify — deliberation routing)

---

## Phase V10.4: Content Wrapper Pattern

### Tasks

1. Lexicon `network.coopsource.org.curatedContent` at `packages/lexicons/network/coopsource/org/curatedContent.json` (see ARCHITECTURE-V10.md §6)
2. Run `pnpm --filter @coopsource/lexicons lex:generate`
3. Schema: add `CuratedContentTable` interface to `packages/db/src/schema.ts` + init SQL for the `curated_content` table. No migration file.
4. Service at `apps/api/src/services/curated-content-service.ts` — CRUD, officer authorization via `checkVisibilityAccess` tier `'officer'`
5. Verify strongRef target is public (not in `private_record`) before allowing wrap — throw `ContentNotPublic` if the referenced record is private
6. Declarative hook config in `apps/api/src/appview/hooks/declarative/configs.ts`
7. Wire service into `apps/api/src/container.ts`
8. API routes at `apps/api/src/routes/curated-content-routes.ts`
9. Frontend at `apps/web/src/routes/(authed)/coop/[handle]/curated/`

---

## Phase V10.5: Governance Transparency Logs

### Tasks

1. Install `merkletreejs`: `pnpm --filter @coopsource/api add merkletreejs`
2. Schema: add `TransparencyLogEntryTable` + `TransparencyLogSthTable` interfaces to `packages/db/src/schema.ts` + init SQL. No migration file.
3. `TransparencyLogService` at `apps/api/src/services/transparency-log-service.ts`
4. Lexicon `network.coopsource.governance.logHead` at `packages/lexicons/network/coopsource/governance/logHead.json` with `key: "literal:self"`
5. Post-storage hooks on proposal, officer, agreement, legal document collections — append events to Merkle tree
6. Privacy-aware logging:
   - For `membership_public: false` coops, member references use internal `membership.id` UUID, not member DID
   - For `vote_visibility: 'private'` coops, `proposal.resolved` events log aggregate tally only
7. 60-second STH timer: batch pending events, compute new root, sign via `LabelSigner`, write STH via `OperatorWriteProxy`
8. XRPC endpoints at `apps/api/src/xrpc/handlers/`:
   - `getLogInclusion` — given event ID + tree size, return inclusion proof
   - `getLogConsistency` — given two tree sizes, return consistency proof
   - `getLatestLogHead` — return current STH
9. Register in `apps/api/src/xrpc/index.ts` with `auth: 'none'` for proofs, `auth: 'optional'` for event enumeration (gated via `checkVisibilityAccess`)
10. Admin UI for log verification at `apps/web/src/routes/(authed)/coop/[handle]/admin/transparency-log/`

---

## Phase V10.6: opensocial.community Bridge (Deferred)

Defer until opensocial achieves cross-app adoption AND V10.2 ships. The privacy guard in V10.2 (`membership_public: false` blocks bridge) must be in place before bridge activation.

When activated: build full `OpenSocialBridgeService` with post-storage hook syncing, per-cooperative opt-in, inbound request routing, and an enable-time guard that hard-fails for `membership_public: false` cooperatives.

---

## Phase V10.7: Lexicon Community Engagement (Ongoing)

Community work, not code. Contribute to Polite Goshawk. Build Lexicon Lens transforms (CSN ↔ opensocial) once cross-app adoption begins. Propose `community.lexicon.governance.*` and `community.lexicon.privacy.*` when ecosystem converges. Register CSN lexicons on Lexicon Garden.

---

## Phase V10.8: Permission Spaces Migration (Deferred)

Activate when Diary 5+ publishes with finalized design, SDK lands in `bluesky-social/atproto`, at least one team (Blacksky/Northsky/Habitat) ships a working implementation, AND `ats://` URI scheme is documented.

When activated: build `ISpaceAdapter` interface, `PostgresSpaceAdapter` wrapping `private_record`, `AtprotoSpaceAdapter` using SDK. Individual-tier records likely remain in PostgreSQL permanently.

---

## Common Patterns

### V10 XRPC handler pattern

```typescript
import type { XrpcContext } from '../dispatcher.js';
import { checkVisibilityAccess, canAccessTier } from './visibility-access.js';

export async function handleMyQuery(ctx: XrpcContext): Promise<unknown> {
  const cooperativeDid = ctx.params.cooperative as string;

  const { coop, viewerMembership, maxTier, isFinancialOfficer } =
    await checkVisibilityAccess(
      ctx.container.db,
      cooperativeDid,
      ctx.viewer,
      ctx.container.membershipService,
    );

  // Gate by tier
  if (!canAccessTier(maxTier, 'officer', isFinancialOfficer, null, ctx.viewer?.did ?? null)) {
    return { summary: projectPublicFields(coop) };
  }

  // Query with tier filter
  const records = await ctx.container.privateRecordService.list(
    cooperativeDid,
    {
      collection: 'my.collection',
      maxVisibilityTier: maxTier,
      viewerDid: ctx.viewer?.did,
      viewerIsFinancialOfficer: isFinancialOfficer,
    },
  );

  return { records: records.items };
}
```

Register in `apps/api/src/xrpc/index.ts` with appropriate `auth` mode (`'none'`, `'optional'`, `'viewer'`, or `'inlay-viewer'`) and `rateLimit` config matching the sensitivity of the data returned.

### V10 write pattern

```typescript
// Determine the record's visibility tier from context
const tier: VisibilityTier = determineVisibilityTier(cooperativeProfile, recordType);

if (tier === 'public') {
  // Public: write to cooperative's PDS with audit log
  await this.operatorWriteProxy.writeCoopRecord({
    operatorDid,
    cooperativeDid,
    collection,
    record,
    rkey,
  });
} else {
  // Private: route via VisibilityRouter
  await this.visibilityRouter.routeWrite({
    cooperativeDid,
    collection,
    record,
    createdBy: operatorDid,
    visibilityTier: tier,
    ownerDid: tier === 'individual' || tier === 'individual_strict' ? ownerDid : undefined,
  });
}
```

Individual and individual_strict tiers always require `ownerDid`. Enforce this in `VisibilityRouter.routeWrite` with a `ValidationError`.

### Adding a new lexicon with privacy

1. Define JSON schema in `packages/lexicons/network/coopsource/<namespace>/`
2. Run `pnpm --filter @coopsource/lexicons lex:generate`
3. If the lexicon has anchor+sidecar pattern, define both a summary/public lexicon and a private sidecar schema (the sidecar uses the same schema but lives in `private_record`)
4. Add a declarative hook config in `apps/api/src/appview/hooks/declarative/configs.ts` to index the record
5. Add service layer with `VisibilityRouter` integration
6. Add XRPC handler with `checkVisibilityAccess` gating
7. Update lexicon inventory in `packages/lexicons/LEXICONS.md`

### Adding a new table or column (PoC mode)

1. Update the Kysely table interface in `packages/db/src/schema.ts`
2. Update the DB init SQL (fresh-build path) to create the column/table with constraints and indexes
3. Rebuild the dev database: drop + recreate (use the existing dev-reset flow)
4. Do NOT create a file in `packages/db/src/migrations/` — the migration runner is preserved for future production use only

---

## Security Requirements (V10 Additions)

### Graduated visibility

- `checkVisibilityAccess` MUST be called on every XRPC handler that returns cooperative data (V10.1 migrates all existing handlers)
- `canAccessTier` gates every record access by the caller's resolved tier
- Individual-tier records filter by `owner_did` in the SQL query — never only in application code
- `visibility_tier` on `private_record` is set at write time and NEVER silently downgraded

### Membership privacy

- `membershipSummary` anchor contains ONLY aggregate counts — no DIDs, no hashes, no deltas
- `memberApproval` records for `membership_public: false` coops MUST NOT touch the PDS or firehose
- Opensocial bridge is structurally blocked for `membership_public: false` (hard error on enable)

### Vote privacy

- For `vote_visibility: 'private'`, votes MUST NOT be written to the voter's PDS
- Vote records use `visibility_tier: 'all_member'` (fellow members see them for accountability) and `owner_did: voterDid` (member can always see their own vote)
- Aggregate tallies MUST NOT expose individual votes

### Existing security requirements (from V9, unchanged)

- Service-auth JWTs < 60 seconds, `lxm` method binding
- Per-DID rate limiting
- Never expose pending/unmatched memberships
- DIDs are authoritative — never handles for security
- Commit signatures verified on membership-relevant records

---

## Pitfalls to Avoid

1. **Don't create migration files.** CSN is in PoC mode. Schema changes go directly into `packages/db/src/schema.ts`. The migration runner exists for future production use only. If you're about to write `packages/db/src/migrations/NNN_*.ts`, stop.

2. **Don't change the `membership` PostgreSQL table schema.** V10.2 changes where the `memberApproval` ATProto record is stored, not the materialized state. The `membership` table drives every access check and must remain stable.

3. **Don't break open-governance cooperatives.** All V10 defaults are privacy-by-default, but the routing through `VisibilityRouter` with `visibilityTier: 'public'` when a cooperative opts in must produce exactly the same PDS records as V9's direct `pdsService.createRecord` path.

4. **Don't add `visibility_tier` to public ATProto records.** Visibility is an application concept enforced by CSN's API and `private_record` tier column, not a protocol-level field in public lexicons. The public lexicons stay unchanged.

5. **Don't build permission spaces.** V10.1–V10.3 are the interim implementation. V10.8 is deferred — do not add any `ISpaceAdapter` code until the protocol team ships a spec + SDK.

6. **Individual-tier records require `owner_did`.** A board member checking another member's patronage allocation without the financial-officer role is a privilege escalation. Enforce at both write-time (VisibilityRouter throws if missing) and read-time (SQL filter).

7. **The opensocial bridge is incompatible with private membership.** Hard guard at enable time. The UI must hide the option. Don't let cooperatives silently re-leak identities.

8. **`assertGovernanceAccess` stays at `open-governance-gate.ts`.** `checkVisibilityAccess` at `visibility-access.ts` calls it; don't duplicate the cooperative-lookup logic.

9. **XRPC handlers already exist at `apps/api/src/xrpc/handlers/`.** Don't create a new `routes/xrpc-governance.ts` — the V9 plan's original route-based approach was replaced by the dispatcher + handler-registry pattern in V9.2. Use that.

10. **Transparency log entries must be privacy-aware.** For `membership_public: false` coops, use `membership.id` UUIDs instead of DIDs. For `vote_visibility: 'private'` coops, log aggregate tallies only.

11. **Lexicons are additive-only.** V10 adds `membershipSummary`, `curatedContent`, `logHead` — all new. Existing lexicons (`membership`, `memberApproval`, `vote`, `proposal`) are not modified. If a tally field is added to proposal, it's an optional property (backward compatible).

12. **Debounce the membershipSummary hook.** A bulk role update or multi-member import can trigger hundreds of hook invocations. Coalesce to one PDS write per 5 seconds per cooperative.

13. **Don't write service-auth JWTs to `@atproto/pds` repo write endpoints.** The V9.1 lesson still applies: app-password sessions are the correct path. The retained-but-unused service-auth infrastructure exists for future CSN-owned PLC signing keys, not for V10 features.

---

## Build & Test Commands

```bash
pnpm install                                          # Install dependencies
pnpm dev                                              # Start dev servers
pnpm test                                             # Run all tests
pnpm --filter @coopsource/lexicons lex:generate       # Regenerate types from lexicon JSON
pnpm build                                            # Build all packages
make dev                                              # Local dev with Homebrew services
make test:all                                         # Full suite with real PDS
make test:pds                                         # Federation PDS integration tests only

# PoC mode: no migrations — use the DB rebuild-fresh flow for schema changes.
# pnpm --filter @coopsource/db migrate is a no-op today (0 migration files).
```

---

## Key File Locations

```
Existing (modify in V10):
packages/db/src/schema.ts                             # V10.1, V10.4, V10.5 — schema changes happen here, not in migrations
apps/api/src/services/private-record-service.ts       # V10.1 — add tier/owner filtering
apps/api/src/services/visibility-router.ts            # V10.1 — add visibilityTier + ownerDid
apps/api/src/services/membership-service.ts           # V10.2 — route memberApproval via VisibilityRouter
apps/api/src/services/proposal-service.ts             # V10.3 — private vote routing
apps/api/src/services/post-service.ts                 # V10.3 — deliberation visibility
apps/api/src/services/governance-labeler.ts           # V10.2 — privacy-aware label emit
apps/api/src/services/operator-write-proxy.ts         # V10.2 — add deleteRecord
apps/api/src/xrpc/handlers/open-governance-gate.ts    # V10.1 — preserved, called by checkVisibilityAccess
apps/api/src/xrpc/handlers/list-members.ts            # V10.1 — use checkVisibilityAccess
apps/api/src/xrpc/handlers/get-proposal.ts            # V10.1, V10.3 — tier-gate tally
apps/api/src/xrpc/handlers/get-vote-eligibility.ts    # V10.1
apps/api/src/xrpc/handlers/get-officers.ts            # V10.1 — public_officers flag
apps/api/src/xrpc/handlers/inlay-membership-status.ts # V10.1 — use checkVisibilityAccess
apps/api/src/xrpc/handlers/inlay-vote-widget.ts       # V10.1, V10.3 — tier-aware display
apps/api/src/appview/hooks/builtin/index.ts           # V10.2, V10.3, V10.5 — register new hooks
apps/api/src/appview/hooks/declarative/configs.ts     # V10.4 — curated content config
apps/api/src/container.ts                             # V10.1–V10.5 — wire new services
apps/web/src/routes/(authed)/coop/[handle]/settings/  # V10.2 — privacy controls UI

New in V10:
apps/api/src/xrpc/handlers/visibility-access.ts                        # V10.1
packages/lexicons/network/coopsource/org/membershipSummary.json        # V10.2
packages/lexicons/network/coopsource/org/curatedContent.json           # V10.4
packages/lexicons/network/coopsource/governance/logHead.json           # V10.5
apps/api/src/appview/hooks/builtin/membership-summary-hook.ts          # V10.2
apps/api/src/appview/hooks/builtin/vote-tally-hook.ts                  # V10.3
apps/api/src/appview/hooks/builtin/transparency-log-hook.ts            # V10.5
apps/api/src/services/curated-content-service.ts                       # V10.4
apps/api/src/services/transparency-log-service.ts                      # V10.5
apps/api/src/services/opensocial-bridge-service.ts                     # V10.2 (stub w/ guard), V10.6 (full)
apps/web/src/routes/(authed)/coop/[handle]/admin/transparency-log/     # V10.5

Archived (not in active build, preserved for future production conversion):
packages/db/src/migrations/.archive/                  # Previous 63 migrations (V1–V9 era)

Retained from V9.1 (unused, monitoring for upstream unblock):
packages/federation/src/atproto/service-auth-client.ts + unit tests
packages/federation/src/http/signing-key-resolver.ts resolveRawBytes + unit tests
packages/federation/src/atproto/pds-did-resolver.ts
```

---

*This prompt provides the implementation context for V10. Always reference ARCHITECTURE-V10.md for design rationale and privacy requirements. Read CLAUDE.md for codebase constraints and patterns. Ask the user before making architectural decisions not covered by these documents.*
