# ARCHITECTURE-V10.md — Privacy, Access Control & Deferred V9 Completion

> **Prerequisite**: V9.1–V9.3 shipped (cooperative write path, governance AppView API, Inlay components)
> **Design references**: ARCHITECTURE-V9.md (ecosystem composability), docs/archive/ARCHITECTURE-V7.md (hook pipeline), docs/archive/ARCHITECTURE-V5.md (three-tier data model)
> **Research sources**: Holmgren Permissioned Data Diary 1–4 + Interlude (Feb–March 2026), ATProto Spring 2026 Roadmap, ATProto Private Data Working Group, Gerakines Community Manager Pattern (Dec 2025), Ellich "Representing groups in ATProto," Blacksky community-only posts, Roomy/Keyhive capabilities, Valsorda AT Transparency Logs, cooperative privacy law (CO § 7-56-307, IRS Subchapter T, GDPR Article 17)
> **Date**: April 16, 2026
> **Status**: Design — implementation planned in phases V10.1–V10.8

---

## Executive Summary

V9 made CSN a composable governance service. V10 makes CSN a **privacy-preserving** governance service — making it possible for cooperatives to be transparent to their members while remaining private from external parties, with financial data appropriately partitioned between members, officers, and the individuals it concerns.

**The privacy gap is structural, not cosmetic.** Three lexicons leak member-identifying data to the public firehose today:

- `network.coopsource.org.memberApproval` writes `{ member: DID, roles: [...] }` to the cooperative's public PDS repo on every approval (verified in `MembershipService.approveInvitation` at `apps/api/src/services/membership-service.ts` — direct `pdsService.createRecord` with no visibility routing).
- `network.coopsource.governance.vote` writes `{ voterDid, choice, rationale, delegatedFrom }` to the voter's public PDS via `MemberWriteProxy.writeRecord`. Anyone crawling a member's repo sees every vote they've cast.
- `network.coopsource.governance.proposal` routes through `VisibilityRouter` for closed-governance coops, but the router is binary (tier 1 or tier 2) with no graduated access within tier 2. All private data sits in one undifferentiated bucket.

V10's thesis: **privacy is a structural requirement enforced at the data layer, not a policy enforced at the API layer.** Records written to public PDS repos cannot be "made private later" — they are cached by relays and potentially archived forever. The anchor+sidecar pattern decouples what's published (aggregate, non-identifying) from what's stored (identifying, access-controlled), and V10 builds a 6-tier access model on top of the existing `private_record` table so graduated visibility lives in the same place today that it will eventually migrate to permission spaces.

V10 also completes the five V9 phases that were designed but not shipped: content wrappers (V9.4), transparency logs (V9.5), opensocial bridge (V9.6), Lexicon Community engagement (V9.7), and the permission spaces adapter (V9.8). Each is carried forward with privacy-by-default constraints applied.

**Three design decisions that drive the V10 model:**

1. **Privacy-by-default for membership** — `membership_public` defaults to `false` for every cooperative. Public discoverability (member DIDs visible on the firehose) requires explicit opt-in.
2. **Private votes by default** — `vote_visibility` defaults to `'private'`. Votes are stored in `private_record` with `owner_did: voterDid` and `visibility_tier: 'all_member'` — fellow members can see how each member voted (governance accountability), but the vote never appears on the public firehose. Portability is deferred to a future ZK-ballot tier.
3. **Six-tier access model with `individual` split** — the individual tier is split into `individual` (owner + designated financial officers: treasurer, auditor, financial-admin) and `individual_strict` (owner only). This reflects that patronage allocations and capital accounts require officer visibility for fiduciary duty while personal contact info and future ZK ballots do not.

**Proof-of-concept status — no migrations, no production data preservation.** CSN is currently a PoC. The existing 63 migration files were moved out of `packages/db/src/migrations/` (archived under `.archive/`) and are no longer part of the build. Going forward, schema lives in `packages/db/src/schema.ts` and is applied by rebuilding the database fresh. V10 makes schema changes directly to that file. Migration infrastructure (`migrate.ts`, `FileMigrationProvider`, the `migrations/` directory) is preserved for the day this PoC becomes a production project — at that point, the accumulated schema becomes migration `001_initial.ts`.

**What V10 adds (8 phases):**

| Phase | Name | Priority | Dependencies |
|-------|------|----------|--------------|
| V10.1 | Graduated visibility infrastructure | **Immediate** | None |
| V10.2 | Membership privacy (anchor + sidecar) | **Immediate** | V10.1 |
| V10.3 | Vote & deliberation privacy | **High** | V10.1 |
| V10.4 | Content wrapper pattern | Medium | None (carried from V9.4) |
| V10.5 | Governance transparency logs | Medium-High | V10.1 |
| V10.6 | opensocial.community bridge | Deferred | V10.2 (carried from V9.6) |
| V10.7 | Lexicon Community engagement | Ongoing | V10.2 (carried from V9.7) |
| V10.8 | Permission spaces migration | Late 2026+ | Spaces spec (carried from V9.8) |

---

## Table of Contents

1. [Current State Audit](#1-current-state-audit)
2. [Six-Tier Visibility Model](#2-six-tier-visibility-model)
3. [Graduated Visibility Infrastructure (V10.1)](#3-graduated-visibility-infrastructure-v101)
4. [Membership Privacy: Anchor + Sidecar (V10.2)](#4-membership-privacy-anchor--sidecar-v102)
5. [Vote & Deliberation Privacy (V10.3)](#5-vote--deliberation-privacy-v103)
6. [Content Wrapper Pattern (V10.4)](#6-content-wrapper-pattern-v104)
7. [Governance Transparency Logs (V10.5)](#7-governance-transparency-logs-v105)
8. [Permission Spaces Migration Path (V10.8)](#8-permission-spaces-migration-path-v108)
9. [opensocial.community Bridge (V10.6)](#9-opensocialcommunity-bridge-v106)
10. [Lexicon Community Engagement (V10.7)](#10-lexicon-community-engagement-v107)
11. [Implementation Phases](#11-implementation-phases)
12. [Risk Assessment](#12-risk-assessment)

---

## 1. Current State Audit

V10 builds on the actual V9 code, not the V9 architecture document's plans. Facts verified in the current working tree:

### Inventory

- **47 lexicons** in `packages/lexicons/network/coopsource/` across 12 namespaces (admin, agreement, alignment, commerce, connection, finance, funding, governance, legal, ops, org). The V9 doc says 41; the current count is 47.
- **Zero active migrations.** The 63 previous migrations were archived (to `.archive/`) as part of the V10 cleanup for PoC mode. `packages/db/src/schema.ts` is the single source of truth for database shape. Running `pnpm --filter @coopsource/db migrate` currently does nothing.
- **Migration infrastructure preserved**: `packages/db/src/migrate.ts` + Kysely's `FileMigrationProvider` still point at `./migrations/`, ready for the first new migration if this PoC converts to production.
- **16 XRPC files** in `apps/api/src/xrpc/handlers/` — 7 query handlers (getCooperative, getMembership, getProposal, getVoteEligibility, listProposals, listMembers, getOfficers), 4 Inlay procedures (MembershipStatus, OfficerList, GovernanceFeed, VoteWidget), 1 migrated label query, plus 2 shared utilities (`open-governance-gate.ts` hosting `assertGovernanceAccess`, `check-vote-eligibility.ts` hosting `checkVoteEligibility`).
- **~60 services** wired in `apps/api/src/container.ts`.
- **Hook pipeline** lives at `apps/api/src/appview/hooks/` with registry + pipeline + builtin + declarative subfolders. Pre-storage and post-storage phases, wildcard collection matching, priority ordering. This is the integration point for V10.2's membership summary updates and V10.5's transparency log.

### Existing privacy primitives that V10 preserves

These all work and V10 builds on them without replacement:

- **`membership.directory_visible`** — per-member opt-in boolean controlling whether an authenticated non-member sees full member detail or redacted detail. `list-members.ts` already implements three-tier privacy: unauthenticated viewers see only `directory_visible: true` members, authenticated non-members see the full roster but non-directory-visible members are redacted, and fellow members see full detail.
- **`assertGovernanceAccess`** at `apps/api/src/xrpc/handlers/open-governance-gate.ts` — returns 404 to non-members of `governance_visibility: 'closed'` cooperatives. Returns the joined cooperative+profile row plus optional `viewerMembership` for handlers to reuse.
- **`membership_role`** table with `admin`, `board-member`, `staff` role vocabulary used by `OperatorWriteProxy.verifyOperatorAuthorized`. `role_definition` table provides per-cooperative custom role definitions with granular permissions and inheritance.
- **`cooperative_profile` visibility flags**: `public_description`, `public_members`, `public_activity`, `public_agreements`, `public_campaigns`, `governance_visibility` ('open'/'mixed'/'closed'), `anon_discoverable`, `cross_coop_visible`.
- **`VisibilityRouter`** at `apps/api/src/services/visibility-router.ts` — routes writes to tier 1 (PDS) or tier 2 (`private_record`) based on `governance_visibility`. Supports per-call `visibilityOverride: 'public' | 'private'`. `ProposalService.createProposal` already uses it for closed-coop proposal routing.
- **`private_record` table** with `(did, collection, rkey, record, created_by, created_at, updated_at)`. No `visibility_tier` or `owner_did` columns yet — V10.1 adds them.
- **`operator_audit_log`** tracks operator-authorized cooperative writes. Works with `OperatorWriteProxy.writeCoopRecord`.
- **Inlay personalization infrastructure** — `InlayAuthVerifier` in `@coopsource/federation/atproto`, `auth: 'inlay-viewer'` mode in `xrpc/dispatcher.ts`, per-component cache semantics with tag-based invalidation.

### Confirmed privacy leaks

1. **Member DIDs leak via `memberApproval`.** `MembershipService.approveInvitation` (line ~210-220) calls `this.pdsService.createRecord({ did: cooperativeDid, collection: 'network.coopsource.org.memberApproval', record: { member: memberDid, roles, createdAt } })`. The record goes to the cooperative's public PDS, is signed, and streams on the firehose. Anyone subscribing to the relay can enumerate every member of every CSN cooperative. The lexicon at `packages/lexicons/network/coopsource/org/memberApproval.json` requires `member` (DID) and optional `roles[]` in the public record.

2. **Votes leak via voter's own repo.** `ProposalService.castVote` (line ~440-460) writes through `memberWriteProxy.writeRecord` to `network.coopsource.governance.vote` on the voter's own PDS. The lexicon at `packages/lexicons/network/coopsource/governance/vote.json` includes `voterDid`, `choice`, `rationale`, and `delegatedFrom` in the public record. Anyone crawling any member's repo sees every vote they've cast across all cooperatives.

3. **`VisibilityRouter` has no graduated access within tier 2.** Once a record is routed to `private_record`, there's no distinction between board-only data, officer-only data, all-member data, and individual data. All private records are equally accessible to any code that can query the `private_record` table.

4. **XRPC handlers use ad-hoc access checks.** `assertGovernanceAccess` handles the closed-coop 404 gate. `list-members.ts` manually joins membership status and role checks. `get-proposal.ts` just calls `assertGovernanceAccess` with no further tier gating. `inlay-membership-status.ts` inlines its own closed-governance check rather than using `assertGovernanceAccess`. There's no single place that answers "what is this viewer's maximum visibility tier in this cooperative?"

5. **Missing config columns.** `cooperative_profile` has no `membership_public`, `vote_visibility`, or `deliberation_visibility` columns. These must be added in V10.1.

### What V9.1 left behind

The V9.1 phase retained service-auth infrastructure that's unused on the current runtime path: `ServiceAuthClient`, `SigningKeyResolver.resolveRawBytes`, `pds-did-resolver.ts`, and 17 unit tests. These were blocked by upstream `@atproto/pds` 0.4 account-import gates. V10 does not use them, does not remove them, and monitors for upstream unblock.

---

## 2. Six-Tier Visibility Model

### The model

| Tier | Value | Who can see | Example records |
|------|-------|-------------|-----------------|
| 0 | `public` | Anyone (including unauthenticated callers, firehose subscribers, external apps) | Cooperative profile, officer list (if coop opts in), ratified bylaws, aggregate vote tallies, cooperative-curated public content, membership summary (counts only) |
| 1 | `all_member` | Active members of the cooperative | Full member roster, proposal details, individual vote records (for accountability), meeting minutes, annual financial summaries |
| 2 | `officer` | Members with any officer role (`secretary`, `treasurer`, `staff`, or any role flagged `is_officer`) | Detailed financial ledger, conflict-of-interest disclosures, compliance tracking, member admission workflows |
| 3 | `board` | Members with any board role (`board-member`, `president`, `vice-president`, `admin`) | Personnel matters, executive session deliberations, legal strategy, contract negotiations |
| 4 | `individual` | The individual (`owner_did`) + members with financial-officer roles (`treasurer`, `auditor`, `financial-admin`) | Patronage allocations, capital account balances, 1099-PATR forms, tax records |
| 5 | `individual_strict` | The individual (`owner_did`) only — no officer access, period | Personal contact info, private messaging, future ZK-ballot identity commitments |

### Why `individual` and `individual_strict` are split

IRS Subchapter T requires cooperatives to generate 1099-PATR forms for members receiving ≥$10 in patronage dividends. Cooperative treasurers and auditors have a fiduciary duty to access individual capital accounts during audit. Colorado C.R.S. § 7-56-307 limits *member-to-member* equity inspection but does not restrict officer-to-member access. Grouping patronage data under the same tier as personal contact info would force either an audit failure (treasurer blocked from auditing) or a privacy failure (all members can see each other's addresses).

The split makes this explicit: tier 4 answers "who needs to see this to do their financial-officer job?" and tier 5 answers "should anyone but the member themselves ever see this?"

### Tier ordering

Tiers are totally ordered. A caller with tier-N access can read all records at tier N or lower (except individual-tier records, which always additionally filter by `owner_did`). Tier 4 is ordered between tier 3 and tier 5, meaning board members do **not** see tier-4 patronage records unless they also hold a financial-officer role.

### The access-checking utility

`checkVisibilityAccess(db, cooperativeDid, viewer, membershipService)` returns `{ coop, viewerMembership, maxTier }`. It extends `assertGovernanceAccess` (which it calls internally for the closed-coop 404 gate) with tier resolution based on the viewer's roles:

- No viewer → `maxTier = 'public'`
- Viewer with active membership, no officer/board/financial roles → `maxTier = 'all_member'`
- Viewer with any financial-officer role (`treasurer`, `auditor`, `financial-admin`) → `maxTier = 'individual'` (and for their own `owner_did`, effectively `individual_strict`)
- Viewer with any officer role → `maxTier = 'officer'`
- Viewer with any board role → `maxTier = 'board'`

Every XRPC handler that returns cooperative data calls `checkVisibilityAccess` exactly once and uses `canAccessTier(maxTier, recordTier)` to filter the output. Handlers that need to show a caller their own individual-tier records additionally check `record.owner_did === viewer.did`.

### Role vocabulary

V10 standardizes on these role strings in `membership_role.role` (building on existing `admin`, `board-member`, `staff` vocabulary):

- **Board roles**: `board-member`, `president`, `vice-president`, `admin`
- **Officer roles**: `secretary`, `treasurer`, `auditor`, `financial-admin`, `staff`
- **Financial-officer subset** (for tier 4 access): `treasurer`, `auditor`, `financial-admin`

These are recognized role strings, not rigid types. Cooperatives can define additional custom roles via the `role_definition` table with permission inheritance. Custom roles that should grant officer or board access declare this via `role_definition.permissions` array — the `checkVisibilityAccess` utility consults `role_definition` for any role not in the standard vocabulary.

---

## 3. Graduated Visibility Infrastructure (V10.1)

### Schema changes

All V10 schema changes are made directly to `packages/db/src/schema.ts` (the Kysely table interfaces) and matched in the rebuild-database-fresh flow used in PoC mode. There are no migration files.

**`PrivateRecordTable`** gains two columns:

```typescript
export interface PrivateRecordTable {
  did: string;
  collection: string;
  rkey: string;
  record: unknown;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  visibility_tier: 'all_member' | 'officer' | 'board' | 'individual' | 'individual_strict';
  owner_did: string | null;
}
```

`visibility_tier` has CHECK constraint enforced at the DB level. `owner_did` is nullable (only required for `individual` and `individual_strict` tiers).

Two indexes are added for query performance:
- Composite index on `(did, collection, visibility_tier)` for the primary tier-filter query
- Partial index on `owner_did WHERE owner_did IS NOT NULL` for individual-tier filtering

**`CooperativeProfileTable`** gains four columns:

```typescript
membership_public: boolean;           // default false
vote_visibility: 'public' | 'private'; // default 'private'
deliberation_visibility: 'all_member' | 'officer' | 'board'; // default 'all_member'
public_officers: boolean;             // default false
```

Defaults encode the privacy-by-default policy. CHECK constraints on the enum columns. `public_officers` gates the `get-officers` XRPC handler — when false, only members can query the officer list.

### The access-check utility

`apps/api/src/xrpc/handlers/visibility-access.ts`:

```typescript
export type VisibilityTier =
  | 'public'
  | 'all_member'
  | 'officer'
  | 'board'
  | 'individual'
  | 'individual_strict';

const TIER_ORDER: Record<VisibilityTier, number> = {
  public: 0,
  all_member: 1,
  officer: 2,
  board: 3,
  individual: 4,
  individual_strict: 5,
};

const BOARD_ROLES = new Set(['board-member', 'president', 'vice-president', 'admin']);
const OFFICER_ROLES = new Set(['secretary', 'treasurer', 'auditor', 'financial-admin', 'staff']);
const FINANCIAL_OFFICER_ROLES = new Set(['treasurer', 'auditor', 'financial-admin']);

export interface VisibilityAccessResult {
  coop: CooperativeRow;
  viewerMembership?: MemberWithRoles;
  maxTier: VisibilityTier;
  isFinancialOfficer: boolean;  // For tier-4 access checks
}

export async function checkVisibilityAccess(
  db: Kysely<Database>,
  cooperativeDid: string,
  viewer?: { did: string; displayName: string },
  membershipService?: MembershipService,
): Promise<VisibilityAccessResult> {
  // Delegate closed-coop 404 gate + cooperative/profile lookup to existing utility
  const { coop, viewerMembership } = await assertGovernanceAccess(
    db, cooperativeDid, viewer, membershipService,
  );

  if (!viewerMembership || viewerMembership.status !== 'active') {
    return { coop, maxTier: 'public', isFinancialOfficer: false };
  }

  const roles = viewerMembership.roles ?? [];
  const hasBoard = roles.some((r) => BOARD_ROLES.has(r));
  const hasOfficer = roles.some((r) => OFFICER_ROLES.has(r));
  const isFinancialOfficer = roles.some((r) => FINANCIAL_OFFICER_ROLES.has(r));

  // Resolve custom roles via role_definition for any role not in standard vocabulary
  const customRoleEscalation = await resolveCustomRoleTier(db, cooperativeDid, roles);

  let maxTier: VisibilityTier = 'all_member';
  if (hasBoard || customRoleEscalation === 'board') maxTier = 'board';
  else if (hasOfficer || customRoleEscalation === 'officer') maxTier = 'officer';

  return { coop, viewerMembership, maxTier, isFinancialOfficer };
}

export function canAccessTier(
  viewerMaxTier: VisibilityTier,
  recordTier: VisibilityTier,
  viewerIsFinancialOfficer: boolean,
  recordOwnerDid: string | null,
  viewerDid: string | null,
): boolean {
  // Individual-strict: only the owner, regardless of tier
  if (recordTier === 'individual_strict') {
    return !!viewerDid && recordOwnerDid === viewerDid;
  }
  // Individual: owner OR financial officer
  if (recordTier === 'individual') {
    if (viewerDid && recordOwnerDid === viewerDid) return true;
    return viewerIsFinancialOfficer;
  }
  // Other tiers: simple ordering
  return TIER_ORDER[viewerMaxTier] >= TIER_ORDER[recordTier];
}
```

`resolveCustomRoleTier` queries `role_definition` for roles not in the standard vocabulary and returns `'board' | 'officer' | null` based on the role's `permissions` array (new permission strings `grants:board_access` and `grants:officer_access` are added to the existing permissions vocabulary). This lets cooperatives define custom roles like `finance-committee-chair` that grant officer access without modifying CSN's hard-coded role sets.

### VisibilityRouter extension

Extend `routeWrite` signature:

```typescript
export interface RouteWriteParams {
  cooperativeDid: string;
  collection: string;
  record: Record<string, unknown>;
  createdBy: string;
  rkey?: string;
  visibilityOverride?: 'public' | 'private';
  visibilityTier?: VisibilityTier;  // NEW
  ownerDid?: string;                 // NEW - required when visibilityTier === 'individual' | 'individual_strict'
}
```

When `visibilityTier` is provided:
- `'public'` → route to Tier 1 (PDS) regardless of cooperative's `governance_visibility`
- `'all_member' | 'officer' | 'board'` → route to `private_record` with that tier
- `'individual' | 'individual_strict'` → route to `private_record` with that tier; `ownerDid` is required, stored in `owner_did` column

When `visibilityTier` is not provided, existing behavior is preserved: cooperative's `governance_visibility` drives the tier-1/tier-2 decision, and private records get `visibility_tier: 'all_member'`.

### PrivateRecordService extension

`list()` and `get()` gain filtering:

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

Query filter logic (conceptual):

```sql
WHERE did = :cooperativeDid
  AND (
    visibility_tier IN ('all_member', 'officer', 'board')
      AND :tier_order[visibility_tier] <= :tier_order[maxVisibilityTier]
    OR
    visibility_tier = 'individual'
      AND (owner_did = :viewerDid OR :viewerIsFinancialOfficer)
    OR
    visibility_tier = 'individual_strict'
      AND owner_did = :viewerDid
  )
```

Individual-tier access is enforced at the database query level, not just in application code. A board member querying without the financial-officer flag cannot retrieve another member's patronage allocation even if they bypass the API.

### XRPC handler updates

Every handler that returns cooperative data is migrated from `assertGovernanceAccess` to `checkVisibilityAccess`:

- `list-members.ts` — the three-tier inline filter is replaced with `maxTier`-based projection. Directory-visible opt-in is preserved as an additional flag — a directory-visible member is always shown to non-members (the member opted in), but non-directory members remain redacted unless the viewer has `all_member` or higher tier.
- `get-proposal.ts` — gates body and options by `maxTier`; for private-vote coops, the per-voter tally breakdown is only returned when `maxTier >= 'all_member'`.
- `get-vote-eligibility.ts` — still requires `'viewer'` auth. `checkVisibilityAccess` replaces `assertGovernanceAccess`.
- `inlay-membership-status.ts` — inline closed-coop check is replaced with `checkVisibilityAccess`. Component output is gated by tier (non-members see coop name + "Not a member"; members see their own roles; officers see additional officer-status context).
- `inlay-vote-widget.ts` — uses `checkVisibilityAccess` + `checkVoteEligibility`. For private-vote cooperatives, the deep-link URL changes (see §5).
- `get-officers.ts` — gated by coop's `public_officers` flag (when unset/false, officer list is tier `'all_member'`).

---

## 4. Membership Privacy: Anchor + Sidecar (V10.2)

### The anchor record

New public lexicon `network.coopsource.org.membershipSummary` at `packages/lexicons/network/coopsource/org/membershipSummary.json`:

```json
{
  "lexicon": 1,
  "id": "network.coopsource.org.membershipSummary",
  "defs": {
    "main": {
      "type": "record",
      "description": "Public aggregate membership summary. Contains counts and policy only — never member identities, not even hashed DIDs. Updated by a post-storage hook on membership state changes.",
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
          "membershipPublic": {
            "type": "boolean",
            "description": "Whether this cooperative publishes individual member identities (memberApproval records) to its public repo. Default false."
          },
          "updatedAt": { "type": "string", "format": "datetime" }
        }
      }
    }
  }
}
```

Key properties:

- `key: "literal:self"` — one record per cooperative, updated in place.
- **Zero member-identifying data** — not member DIDs, not hashed DIDs, not member count deltas that could be correlated against firehose events. Only aggregate counts and policy metadata.
- `membershipPublic: false` (the default) signals to ecosystem consumers that this cooperative uses private membership. Consumers like opensocial bridges MUST respect this flag.

The anchor is written to the cooperative's public PDS repo via `OperatorWriteProxy` (which has audit logging). Updates trigger on membership state changes (create, approve, suspend, depart). A debounce window (5 seconds) batches rapid updates.

### The sidecar

`memberApproval` records are written to `private_record` with:
- `did = cooperativeDid`
- `collection = 'network.coopsource.org.memberApproval'`
- `rkey` = existing TID scheme
- `visibility_tier = 'all_member'`
- `owner_did = null` (member DIDs are known to other members, not private to the individual member; the `membership` PostgreSQL table already stores the DID for access checks)
- Record body unchanged: `{ member: DID, roles: [...], createdAt }`

### Flow changes in `MembershipService.approveInvitation`

Current code at `apps/api/src/services/membership-service.ts` ~line 210:

```typescript
const approvalRef = await this.pdsService.createRecord({
  did: cooperativeDid as DID,
  collection: 'network.coopsource.org.memberApproval',
  record: { member: memberDid, roles, createdAt: now.toISOString() },
});
```

Changes to:

```typescript
const approvalRef = await this.visibilityRouter.routeWrite({
  cooperativeDid,
  collection: 'network.coopsource.org.memberApproval',
  record: { member: memberDid, roles, createdAt: now.toISOString() },
  createdBy: approverDid,
  visibilityTier: coop.membership_public ? 'public' : 'all_member',
});
// approvalRef.uri is at://{coopDid}/network.coopsource.org.memberApproval/{rkey}
// Cid is 'private' for tier 2 (matches existing proposal-service pattern)
```

`membership.approval_record_uri` is set to the synthetic `at://` URI in both cases, so the existing bilateral state machine continues to work without schema changes — the `membership` table already drives all access checks.

### The post-storage hook

New hook `apps/api/src/appview/hooks/builtin/membership-summary-hook.ts` registered as post-storage on `network.coopsource.org.memberApproval` and `network.coopsource.org.membership`:

```typescript
export const membershipSummaryHook: HookRegistration = {
  id: 'membership-summary-updater',
  name: 'Membership Summary Updater',
  phase: 'post-storage',
  source: 'builtin',
  collections: [
    'network.coopsource.org.memberApproval',
    'network.coopsource.org.membership',
  ],
  priority: 50,
  handler: async (ctx) => {
    // Aggregate from membership table
    const counts = await ctx.db
      .selectFrom('membership')
      .where('cooperative_did', '=', ctx.did)
      .where('invalidated_at', 'is', null)
      .select([
        ctx.db.fn.count<number>('id').filterWhere('status', '=', 'active').as('active'),
        ctx.db.fn.count<number>('id').filterWhere('status', '=', 'pending').as('pending'),
      ])
      .executeTakeFirst();

    // Upsert anchor via OperatorWriteProxy (handled by container)
    // Policy and membershipPublic pulled from cooperative_profile
    // Anchor uses rkey 'self' (literal)
  },
};
```

The hook runs on both member-side (`membership`) and coop-side (`memberApproval`) records because either can trigger a state change. Debouncing happens at the anchor-write layer (hook invocations within 5 seconds are coalesced).

### Impact on existing features

- **Bilateral state machine**: Unchanged. Reads from `membership` table.
- **Governance labeler**: For `membership_public: false` coops, the labeler stops emitting `member-suspended` labels that reference member DIDs publicly. Aggregate labels like `proposal-approved` remain unchanged (they reference proposal URIs, not member DIDs).
- **listMembers, getMembership**: Unchanged logic; they already read PostgreSQL.
- **Inlay MembershipStatus**: Unchanged. Reads from `MembershipService.getMember`, not from PDS records.

### What the anchor does NOT contain

The anchor deliberately excludes:

- Member DIDs (obvious)
- Hashed DIDs (rainbow-table attackable against the firehose's full DID space)
- Member count deltas (timing correlation against membership events on the firehose could identify who joined when)
- Role counts by type (small cooperatives could be de-anonymized by role distribution)

Only total active and pending counts, policy, and the public flag.

---

## 5. Vote & Deliberation Privacy (V10.3)

### Private vote storage

For cooperatives with `vote_visibility = 'private'` (the default), votes are stored in `private_record`:

- `did = cooperativeDid`
- `collection = 'network.coopsource.governance.vote'`
- `rkey` = existing TID scheme
- `record` = vote body (`{ proposalUri, proposalCid, choice, rationale, delegatedFrom, createdAt }` — `voterDid` is redundant with `owner_did` but kept for record integrity)
- `visibility_tier = 'all_member'` (fellow members see individual votes — cooperative accountability)
- `owner_did = voterDid`

The record never appears on the public firehose and never lands in the voter's own PDS repo.

### Flow changes in `ProposalService.castVote`

Current code at `apps/api/src/services/proposal-service.ts` ~line 450:

```typescript
const ref = this.memberWriteProxy
  ? await this.memberWriteProxy.writeRecord({
      memberDid: params.voterDid as DID,
      collection: 'network.coopsource.governance.vote',
      record: voteRecord,
    })
  : await this.pdsService.createRecord({ ... });
```

Changes to:

```typescript
const coopProfile = await this.db
  .selectFrom('cooperative_profile')
  .where('entity_did', '=', proposal.cooperative_did)
  .select('vote_visibility')
  .executeTakeFirst();

const isPrivate = coopProfile?.vote_visibility === 'private';

let ref;
if (isPrivate) {
  const routed = await this.visibilityRouter.routeWrite({
    cooperativeDid: proposal.cooperative_did,
    collection: 'network.coopsource.governance.vote',
    record: voteRecord,
    createdBy: params.voterDid,
    visibilityTier: 'all_member',
    ownerDid: params.voterDid,
  });
  ref = { uri: `at://${proposal.cooperative_did}/network.coopsource.governance.vote/${routed.rkey}`, cid: 'private' };
} else if (this.memberWriteProxy) {
  ref = await this.memberWriteProxy.writeRecord({
    memberDid: params.voterDid as DID,
    collection: 'network.coopsource.governance.vote',
    record: voteRecord,
  });
} else {
  ref = await this.pdsService.createRecord({ ... });
}
```

The `vote` PostgreSQL table continues to get inserted with the vote URI/CID, so tallying, eligibility, and duplicate-prevention logic all work unchanged.

### Aggregate tally anchor

For `vote_visibility = 'private'` coops, a post-storage hook updates an aggregate tally on the proposal record in the cooperative's public PDS:

- Hook fires after each vote is inserted into `private_record` + `vote` table
- Computes `{ yes, no, abstain, ... }` aggregates from the `vote` table
- Updates the proposal record in the PDS with a new `publicTally` field (optional field on the existing `governance.proposal` lexicon — backward compatible since it's additive)
- External ATProto consumers see proposal outcomes and aggregate counts but cannot enumerate who voted which way

For `vote_visibility = 'public'` coops, the existing flow is preserved — votes are written to voter PDSes, no aggregate anchor is maintained (the firehose is the source of truth).

### Inlay VoteWidget compatibility

The current `inlay-vote-widget.ts` returns an Inlay element tree that deep-links to `/coop/{handle}/governance/{proposalId}` in CSN's SvelteKit UI. This works for both public and private votes, because the actual voting action goes through CSN's authenticated API, not through Inlay's writer model.

Two changes needed:

1. The widget's displayed tally is computed from aggregate counts — no visibility leak for private-vote coops.
2. The "Vote now" link is always a deep link. Inlay's stage-1 model is display-only per RFC 008, so no write path changes.

When Inlay stage-2 (writes) ships, the deep link becomes the preferred path for private-vote coops. Public-vote coops may additionally accept an Inlay write path that goes to the voter's PDS.

### Deliberation privacy

Proposal deliberation threads (comments, amendments) follow the same pattern controlled by `cooperative_profile.deliberation_visibility`:

- `'all_member'` (default) → threads in `private_record` with `visibility_tier = 'all_member'`
- `'officer'` → threads in `private_record` with `visibility_tier = 'officer'`
- `'board'` → threads in `private_record` with `visibility_tier = 'board'`

Existing post-discussion infrastructure (`PostService`) gains a `deliberationVisibility` parameter on proposal-related posts, routed through `VisibilityRouter` with the appropriate tier.

---

## 6. Content Wrapper Pattern (V10.4)

*Carried from V9.4. Implementation unchanged from ARCHITECTURE-V9.md §5 with one addition: wrappers respect member privacy — a cooperative cannot curate a member's private record.*

### Lexicon: `network.coopsource.org.curatedContent`

```json
{
  "lexicon": 1,
  "id": "network.coopsource.org.curatedContent",
  "defs": {
    "main": {
      "type": "record",
      "description": "A cooperative-curated reference to member content. Based on Gerakines' Community Manager Pattern.",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["content", "category", "curatedBy", "createdAt"],
        "properties": {
          "content": {
            "type": "ref",
            "ref": "com.atproto.repo.strongRef"
          },
          "category": {
            "type": "string",
            "knownValues": ["endorsed", "featured", "relevant", "discussion", "analysis"]
          },
          "context": { "type": "string", "maxLength": 1000 },
          "relatedProposal": { "type": "string", "format": "at-uri" },
          "curatedBy": { "type": "string", "format": "did" },
          "createdAt": { "type": "string", "format": "datetime" }
        }
      }
    }
  }
}
```

### Privacy constraint

Because content wrappers are public records pointing to member content, they can only wrap content the member has already made public. The `CuratedContentService.create` method verifies the strongRef resolves to a record visible on the firehose (or fails with `ContentNotPublic` error). Cooperatives cannot curate content stored in `private_record` (there's no public AT-URI for those).

### Schema

`curated_content` table added to `packages/db/src/schema.ts`:

```typescript
export interface CuratedContentTable {
  id: string;
  cooperative_did: string;
  uri: string;
  cid: string;
  content_uri: string;
  content_cid: string;
  category: string;
  context: string | null;
  related_proposal_uri: string | null;
  curated_by_did: string;
  created_at: Date;
  indexed_at: Date;
}
```

### Implementation

1. Lexicon at `packages/lexicons/network/coopsource/org/curatedContent.json`
2. Schema interface in `packages/db/src/schema.ts`
3. Service at `apps/api/src/services/curated-content-service.ts` — CRUD with officer authorization (uses `checkVisibilityAccess` with required tier `'officer'`)
4. Declarative hook config in `apps/api/src/appview/hooks/declarative/configs.ts` for indexing
5. Frontend at `apps/web/src/routes/(authed)/coop/[handle]/curated/`

---

## 7. Governance Transparency Logs (V10.5)

*Carried from V9.5. Privacy-aware: log entries record outcomes only, never individual votes for private-vote coops.*

### Design

Merkle-tree-backed append-only log of governance events. Signed Tree Heads (STHs) published to the cooperative's public PDS repo as `network.coopsource.governance.logHead` records. Inclusion and consistency proofs available via XRPC.

Uses `merkletreejs` + PostgreSQL storage. STH signed with the cooperative's secp256k1 key (reuses `LabelSigner` infrastructure).

### Event types logged

- `proposal.created` — proposal ID, title, hash of body, createdAt
- `proposal.opened` — proposal ID, opened_at
- `proposal.resolved` — proposal ID, outcome, aggregate tally, resolvedAt
- `officer.appointed` — officer record CID (never member DID directly for private-membership coops)
- `officer.ended` — officer record CID
- `agreement.signed` — agreement CID, aggregate signature count
- `bylaw.changed` — legal document CID, version

For `membership_public: false` coops, events that would reference member DIDs instead reference the PostgreSQL `membership.id` UUID — internal to CSN, not cross-referenceable to a public identity. For `vote_visibility: 'private'` coops, `proposal.resolved` logs aggregate tallies only, never individual votes.

### Lexicon: `network.coopsource.governance.logHead`

```json
{
  "lexicon": 1,
  "id": "network.coopsource.governance.logHead",
  "defs": {
    "main": {
      "type": "record",
      "key": "literal:self",
      "record": {
        "type": "object",
        "required": ["treeSize", "rootHash", "timestamp", "signature"],
        "properties": {
          "treeSize": { "type": "integer", "minimum": 0 },
          "rootHash": { "type": "string" },
          "timestamp": { "type": "string", "format": "datetime" },
          "signature": { "type": "bytes" }
        }
      }
    }
  }
}
```

One record per cooperative, updated in place every 60 seconds (batched).

### Schema

`transparency_log_entry` and `transparency_log_sth` tables added to `packages/db/src/schema.ts`:

```typescript
export interface TransparencyLogEntryTable {
  cooperative_did: string;
  leaf_index: bigint;
  event_type: string;
  event_data: unknown; // JSONB
  leaf_hash: string;
  created_at: Date;
}

export interface TransparencyLogSthTable {
  cooperative_did: string;
  tree_size: bigint;
  root_hash: string;
  signature: Uint8Array;
  published_uri: string | null;
  created_at: Date;
}
```

### XRPC endpoints

- `network.coopsource.governance.getLogInclusion` — given an event ID + tree size, returns Merkle inclusion proof
- `network.coopsource.governance.getLogConsistency` — given two tree sizes, returns consistency proof
- `network.coopsource.governance.getLatestLogHead` — returns current STH

Access: `none` (public proofs) for inclusion/consistency; anyone can verify without membership. Event enumeration is gated by `checkVisibilityAccess` — non-members see only events whose referents are tier-0 public.

### Integration

Post-storage hook on governance collections appends events to the Merkle tree via `TransparencyLogService.appendEvent`. STH update runs on a 60-second timer, computing the new root and writing the signed head via `OperatorWriteProxy`.

---

## 8. Permission Spaces Migration Path (V10.8)

*Carried from V9.8. Still deferred — no code in V10.*

### Current ecosystem state (April 16, 2026)

Holmgren's Permissioned Data Diary reached #4 ("The Big Picture," March 20, 2026). No Diary #5 published. No permission spaces SDK in `bluesky-social/atproto`. No `ats://` URI scheme documented. Blacksky's community-only posts ship a different mechanism (server-filtered visibility rather than protocol-level access control). The ATProto Private Data Working Group is active.

One post-April-14 item worth tracking: a capability-trees Leaflet post framing an alternative to Diary #4's member-list ACL model, referencing feedback from Brooklyn Zelenka and Holmgren. Not a protocol change, but an ecosystem indicator that the design may still evolve.

### How V10.1–V10.3 prepare for spaces

The infrastructure V10.1–V10.3 builds is the interim implementation of what will become a `PermissionSpaceAdapter`:

| V10 infrastructure | Permission spaces equivalent (projected) |
|---|---|
| `private_record` rows with `visibility_tier` | Records in a permission space scoped to the cooperative's DID |
| `membership_role` + `role_definition` tables | Space membership list with `(DID, read\|write\|admin)` capabilities |
| `checkVisibilityAccess` | Space capability check via signed tokens (Diary 4 proposes 2–4 hour credentials) |
| `membershipSummary` anchor | Public anchor record pointing to space (pattern preserves in spaces design) |
| `owner_did` individual-tier filter | Likely stays in PostgreSQL — spaces are not designed for individual isolation |

The anchor+sidecar pattern is the portable abstraction. Whether the sidecar lives in `private_record` today or in a permission space tomorrow, the anchor's shape stays the same.

### Activation trigger

V10.8 activates when ALL of:
- Holmgren publishes Diary #5+ with finalized design
- An SDK PR appears in `bluesky-social/atproto`
- At least one team (Blacksky, Northsky, or Habitat) ships a working spaces implementation
- The `ats://` URI scheme is documented

When activated: design `ISpaceAdapter` interface, build `PostgresSpaceAdapter` wrapping `private_record`, build `AtprotoSpaceAdapter` using the spaces SDK. Individual-tier records likely stay in PostgreSQL permanently because spaces are designed for group access, not individual isolation.

---

## 9. opensocial.community Bridge (V10.6)

*Carried from V9.6. Defer until cross-app adoption. Privacy guard added.*

### Design

Optional compatibility layer projecting CSN bilateral membership to Ellich's opensocial patterns. Opt-in per cooperative.

### Privacy guard (new in V10)

The bridge is **structurally incompatible with `membership_public: false`** because opensocial proofs are public records that re-expose member identities. The `OpenSocialBridgeService.enable(cooperativeDid)` method hard-fails if the cooperative has `membership_public: false`. The UI hides the bridge option for private-membership cooperatives. This is a guard against the privacy-by-default policy being silently bypassed.

### Flow

When a `membership_public: true` cooperative opts in:
1. On membership activation → write `community.opensocial.membershipProof` to cooperative's PDS via `OperatorWriteProxy`
2. On membership revocation → delete the proof
3. Inbound opensocial membership requests → routed to CSN approval flow
4. CSN's bilateral membership remains authoritative — opensocial proofs are a projection

### Timing

Defer until opensocial achieves cross-app adoption. Track Ellich's work in 2026; activate when at least one app besides Collective uses opensocial membership.

---

## 10. Lexicon Community Engagement (V10.7)

*Carried from V9.7. Ongoing, not code.*

- **Track 1**: Contribute to Polite Goshawk working group (Lexicon Lenses)
- **Track 2**: Propose `community.lexicon.governance.*` when ecosystem converges — anchor+sidecar becomes the canonical pattern in this proposal
- **Track 3**: Build Lexicon Lens transforms: CSN membership ↔ opensocial membership (only applicable to `membership_public: true` cooperatives per V10.6 guard)
- **Track 4 (new)**: Propose `community.lexicon.privacy.*` for the membershipSummary anchor pattern — cooperatives are not the only domain that benefits from anchor+sidecar privacy

Register CSN lexicons on Lexicon Garden for discoverability.

---

## 11. Implementation Phases

### Phase V10.1: Graduated Visibility Infrastructure

**Branch**: `feature/v10.1-graduated-visibility`
**Effort**: 2–3 weeks
**Dependencies**: None

**Tasks**:

1. Update `packages/db/src/schema.ts`: add `visibility_tier` + `owner_did` to `PrivateRecordTable`, add `membership_public` + `vote_visibility` + `deliberation_visibility` + `public_officers` to `CooperativeProfileTable`. Update the DB initialization/rebuild path so these columns (with CHECK constraints + indexes) are created when the DB is built fresh.
2. Add `VisibilityTier` type + `TIER_ORDER` + role-set constants in `apps/api/src/xrpc/handlers/visibility-access.ts`
3. Build `checkVisibilityAccess` (extends existing `assertGovernanceAccess`) + `canAccessTier` utilities
4. Build `resolveCustomRoleTier` consulting `role_definition.permissions` for `grants:officer_access` / `grants:board_access`
5. Extend `VisibilityRouter.routeWrite` with `visibilityTier` + `ownerDid` parameters
6. Extend `PrivateRecordService.list` + `.get` with tier filtering and `owner_did` scoping
7. Migrate XRPC handlers: `list-members`, `get-proposal`, `get-vote-eligibility`, `inlay-membership-status`, `inlay-vote-widget`, `get-officers` — replace `assertGovernanceAccess` with `checkVisibilityAccess`

**Key files**:

- `packages/db/src/schema.ts` (modify — add columns to table interfaces + DB init SQL)
- `apps/api/src/xrpc/handlers/visibility-access.ts` (new)
- `apps/api/src/services/visibility-router.ts` (modify)
- `apps/api/src/services/private-record-service.ts` (modify)
- `apps/api/src/xrpc/handlers/open-governance-gate.ts` (keep — `checkVisibilityAccess` calls it)
- `apps/api/src/xrpc/handlers/list-members.ts` (modify)
- `apps/api/src/xrpc/handlers/get-proposal.ts` (modify)
- `apps/api/src/xrpc/handlers/get-vote-eligibility.ts` (modify)
- `apps/api/src/xrpc/handlers/inlay-membership-status.ts` (modify)
- `apps/api/src/xrpc/handlers/inlay-vote-widget.ts` (modify)
- `apps/api/src/xrpc/handlers/get-officers.ts` (modify)

**Tests**:

- Unit: tier resolution for each role combination, custom role escalation via `role_definition`
- Unit: `canAccessTier` for all tier pairs including individual-strict owner-only enforcement
- Unit: `VisibilityRouter.routeWrite` with each tier value
- Unit: `PrivateRecordService.list` with `maxVisibilityTier`, `viewerDid`, `viewerIsFinancialOfficer` filter combinations
- Integration: XRPC handlers return correct projections for unauth/all_member/officer/board/individual/individual_strict callers
- Integration: board member cannot see another member's individual-tier record without financial-officer role
- Regression: full E2E suite passes against rebuilt DB with new default `visibility_tier = 'all_member'` (which preserves current Tier 2 behavior)

### Phase V10.2: Membership Privacy

**Branch**: `feature/v10.2-membership-privacy`
**Effort**: 2–3 weeks
**Dependencies**: V10.1

**Tasks**:

1. Lexicon `network.coopsource.org.membershipSummary` (new)
2. Run `pnpm --filter @coopsource/lexicons lex:generate`
3. Extend `OperatorWriteProxy` with `deleteRecord` method + audit log entry
4. Modify `MembershipService.approveInvitation` to route through `VisibilityRouter` with tier based on `membership_public`
5. Modify `MembershipService.updateMemberRoles` to route role updates the same way
6. Build `MembershipSummaryHook` at `apps/api/src/appview/hooks/builtin/membership-summary-hook.ts` with 5-second debounce
7. Register hook in `apps/api/src/appview/hooks/builtin/index.ts`
8. Modify `GovernanceLabeler` to skip member-specific labels when `membership_public: false`
9. Admin UI: expose `membership_public` setting in cooperative settings page

**Key files**:

- `packages/lexicons/network/coopsource/org/membershipSummary.json` (new)
- `apps/api/src/services/operator-write-proxy.ts` (modify — add deleteRecord)
- `apps/api/src/services/membership-service.ts` (modify — route memberApproval)
- `apps/api/src/services/governance-labeler.ts` (modify — skip member-specific for private coops)
- `apps/api/src/appview/hooks/builtin/membership-summary-hook.ts` (new)
- `apps/api/src/appview/hooks/builtin/index.ts` (modify — register hook)
- `apps/web/src/routes/(authed)/coop/[handle]/settings/+page.svelte` (modify — expose setting)

**Tests**:

- Unit: `MembershipSummaryHook` produces correct counts, never includes member DIDs
- Unit: routing of memberApproval by `membership_public` flag
- Unit: governance labeler skips correct labels for private coops
- Integration: `listMembers` works against private-membership coop (reads PostgreSQL, unaffected)
- Integration: opensocial bridge guard rejects enable for `membership_public: false`
- Regression: full E2E suite passes with new default applied to test-setup coops

### Phase V10.3: Vote & Deliberation Privacy

**Branch**: `feature/v10.3-vote-privacy`
**Effort**: 2 weeks
**Dependencies**: V10.1

**Tasks**:

1. Modify `ProposalService.castVote` to check `vote_visibility` and route votes via `VisibilityRouter` with `visibilityTier: 'all_member'` and `ownerDid: voterDid` for private coops
2. Build aggregate-tally post-storage hook: `apps/api/src/appview/hooks/builtin/vote-tally-hook.ts` — on vote insert, recompute aggregate, update proposal record in PDS if `vote_visibility === 'private'`
3. Extend `getProposal` XRPC handler: per-voter breakdown only returned for callers with `maxTier >= 'all_member'`
4. Extend deliberation/post write paths to honor `deliberation_visibility`
5. Modify `inlay-vote-widget.ts` to always deep-link (stage-1 safe for both public and private)

**Key files**:

- `apps/api/src/services/proposal-service.ts` (modify — private vote routing in castVote)
- `apps/api/src/appview/hooks/builtin/vote-tally-hook.ts` (new)
- `apps/api/src/appview/hooks/builtin/index.ts` (register hook)
- `apps/api/src/xrpc/handlers/get-proposal.ts` (modify — tier-gate tally detail)
- `apps/api/src/xrpc/handlers/inlay-vote-widget.ts` (modify — tier-aware display)
- `apps/api/src/services/post-service.ts` (modify — route deliberation posts by `deliberation_visibility`)

**Tests**:

- Unit: vote routes to private_record with correct `owner_did` and `visibility_tier` when `vote_visibility = 'private'`
- Unit: vote routes to voter PDS when `vote_visibility = 'public'`
- Unit: tally aggregation matches whether votes are public or private
- Integration: fellow member sees individual vote breakdown; external caller sees only aggregate
- Integration: VoteWidget deep-link path works for both visibility modes
- Regression: existing public-vote cooperatives (if any explicitly opt out) behave unchanged

### Phase V10.4: Content Wrapper Pattern

**Branch**: `feature/v10.4-content-wrappers`
**Effort**: 1–2 weeks
**Dependencies**: None

**Tasks**:

1. Lexicon `network.coopsource.org.curatedContent` (new)
2. Service `CuratedContentService` at `apps/api/src/services/curated-content-service.ts`
3. Declarative hook config in `apps/api/src/appview/hooks/declarative/configs.ts`
4. Schema: add `CuratedContentTable` interface to `packages/db/src/schema.ts`
5. Officer-only authorization via `checkVisibilityAccess` with required tier `'officer'`
6. Content-public verification (cannot curate private records)
7. Frontend at `apps/web/src/routes/(authed)/coop/[handle]/curated/`

### Phase V10.5: Governance Transparency Logs

**Branch**: `feature/v10.5-transparency-logs`
**Effort**: 2–3 weeks
**Dependencies**: V10.1

**Tasks**:

1. Install `merkletreejs` dependency
2. Build `TransparencyLogService` with Merkle tree + PostgreSQL backing
3. Lexicon `network.coopsource.governance.logHead` (new, `key: "literal:self"`)
4. Schema: add `TransparencyLogEntryTable` + `TransparencyLogSthTable` interfaces to `packages/db/src/schema.ts`
5. Post-storage hooks on governance collections appending events
6. Privacy-aware event logging: for private-vote coops, `proposal.resolved` logs aggregate tallies; for private-membership coops, member DIDs are replaced with internal UUIDs
7. XRPC endpoints: `getLogInclusion`, `getLogConsistency`, `getLatestLogHead`
8. 60-second STH batching timer
9. Admin UI for log verification

### Phase V10.6: opensocial.community Bridge (Deferred)

**Branch**: `feature/v10.6-opensocial-bridge`
**Effort**: 1–2 weeks
**Dependencies**: V10.2 (privacy guard), cross-app adoption signal

**Tasks**:

1. `OpenSocialBridgeService` with hard-fail guard: cannot enable for `membership_public: false`
2. Per-cooperative opt-in setting
3. Post-storage hook syncing membership state changes
4. Inbound request routing

### Phase V10.7: Lexicon Community Engagement (Ongoing)

**No branch**. Community work. Dependencies: V10.2 schemas demonstrate patterns.

### Phase V10.8: Permission Spaces Migration (Deferred)

**Branch**: `feature/v10.8-space-adapter`
**Effort**: TBD
**Dependencies**: Spaces spec + SDK

**Tasks** (when activated):

1. `ISpaceAdapter` interface
2. `PostgresSpaceAdapter` wrapping `private_record`
3. `AtprotoSpaceAdapter` using spaces SDK
4. Tier-to-space mapping (each tier potentially a separate space type)
5. Individual-tier records remain in PostgreSQL

### Phase dependencies

```
V10.1 (Graduated Visibility)  ← start immediately
  ├→ V10.2 (Membership Privacy)
  │    └→ V10.6 (opensocial Bridge)  — deferred
  │    └→ V10.7 (Lexicon Community)  — ongoing
  ├→ V10.3 (Vote Privacy)
  ├→ V10.5 (Transparency Logs)
  └→ V10.8 (Spaces Migration)  — deferred

V10.4 (Content Wrappers)  ← independent, start anytime
```

### Deferred from V9.1 (still monitoring)

CSN-owned PLC signing keys remain blocked on upstream `@atproto/pds` 0.4 account-import gates. `ServiceAuthClient`, `SigningKeyResolver.resolveRawBytes`, `resolvePdsServiceDid` retained in codebase unused (17 unit tests pass). Monitor `bluesky-social/atproto` for `packages/pds/src/auth-verifier.ts` changes adding service-auth to `authorization()`, or new `authorizationOrUserServiceAuth()` call sites in repo write handlers.

---

## 12. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Graduated visibility slows `private_record` queries | Performance degradation on large cooperatives | Composite `(did, collection, visibility_tier)` index; tier is a cheap enum comparison; benchmark under load before production conversion |
| Privacy-by-default breaks existing opensocial bridge assumptions | Bridge unusable for default-configured coops | Explicit guard with error message; opt-in to `membership_public: true` is a single setting |
| Vote privacy conflicts with existing open-vote expectations | Members used to seeing their own vote in their PDS | Default explicitly documented; cooperatives that prefer open voting can set `vote_visibility: 'public'` |
| Custom roles don't escalate correctly | Officer access denied for cooperatives with custom role names | `role_definition.permissions` array with `grants:officer_access` / `grants:board_access` flags; default seed roles declare these |
| Spaces design changes substantially | V10.8 adapter needs redesign | V10.1–V10.3 don't depend on spaces; V10.8 deferred indefinitely |
| `membership_public: false` breaks cross-cooperative federation discovery | Federations of cooperatives can't enumerate child coop members | Parent federation member = child coop DID, not individual humans (tree-not-closure rule); federation member lists remain at the cooperative-DID level |
| Transparency log grows unboundedly | Storage cost over time | Log entries are small (event ID + hash); pruning of resolved-and-consistent entries possible; size is O(n) in governance decisions |
| Inlay write model (stage 2) conflicts with private vote routing | External voters bypass CSN's VisibilityRouter | When Inlay stage 2 ships, private-vote coops only accept deep-link voting; public-vote coops accept both paths |
| PoC-to-production conversion requires migration authoring | First production migration has to capture the whole accumulated schema | Documented explicitly: when converting, `packages/db/src/schema.ts` becomes migration `001_initial.ts`; infrastructure is already in place |

---

## References

- **Holmgren Permissioned Data Diary 1–4** — https://dholms.leaflet.pub/
- **ATProto Spring 2026 Roadmap** — https://atproto.com/blog/2026-spring-roadmap
- **ATProto Private Data Working Group** — https://discourse.atprotocol.community/t/introductions-and-kick-off/37
- **Gerakines Community Manager Pattern** — https://ngerakines.leaflet.pub/3majmrpjrd22b
- **Ellich "Representing groups in ATProto"** — https://brittanyellich.com/atproto-groups/
- **Valsorda AT Transparency Logs** — ATmosphereConf VOD
- **Blacksky Community Architecture** — https://github.com/blacksky-algorithms/atproto
- **Colorado C.R.S. § 7-56-307** — limits on member-to-member equity inspection
- **IRS Subchapter T** — cooperative taxation, 1099-PATR requirements
- **Capability Trees for Permissioned Spaces** — Leaflet, April 2026 (post-Diary-4 community proposal)
- **ARCHITECTURE-V9.md** — predecessor, ecosystem composability
- **ARCHITECTURE-V5.md** — three-tier data model foundation
