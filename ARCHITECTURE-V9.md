# ARCHITECTURE-V9.md — Ecosystem Composability & Governance as a Service

> **Prerequisite**: V8 (Home, Profiles, Public Web, Discovery) — V8.1-V8.11 shipped, V8.12-V8.13 in progress
> **Design references**: docs/archive/ARCHITECTURE-V8.md (Home/Profiles/Discovery), docs/archive/ARCHITECTURE-V7.md (hook pipeline, scripting, production deployment), docs/archive/ARCHITECTURE-V6.md (ATProto federation)
> **Research sources**: ATmosphereConf 2026 (March 26-29), Holmgren Permissioned Data Diary 1-4 + Interlude (Feb-March 2026), ATProto Spring 2026 Roadmap, Roomy/OpenMeet cross-app auth PoC (March 2026), Blacksky Acorn community infrastructure (March 2026), Dan Abramov Inlay social components (March 2026), Valsorda AT Transparency Logs (March 2026), opensocial.community (Ellich), Gerakines Community Manager Pattern + Spaces as Layers, IETF ATP Working Group formation (March 2026), Lexicon Community governance process
> **Date**: April 11, 2026
> **Status**: Design — implementation planned in phases V9.1–V9.8

---

## Executive Summary

V8 reframes Co-op Source as a personal space connected to cooperatives. V9 reframes Co-op Source as a **composable governance service within the ATProto ecosystem** — not just an app, but a governance layer that other ATProto applications can query, embed, and build on.

The ATProto ecosystem is converging on shared patterns for communities, groups, and cross-app interoperability. Four post-ATmosphereConf developments drive V9's design:

1. **Cross-app authentication works today** — the Roomy/OpenMeet service-auth JWT proof-of-concept demonstrates seamless cross-app identity without redirects. Auth Scopes have shipped. CSN can adopt this pattern immediately.

2. **Blacksky's Acorn** shows community governance at scale — 350K+ MAU, democratic Polis-based decision-making, full independent infrastructure stack. The production model for cooperative governance on ATProto.

3. **Dan Abramov's Inlay** introduces composable social components — remixable cross-product UI where lexicons define component contracts. Governance widgets (voting, membership status, proposal tracking) can embed in any ATProto client.

4. **AT Transparency Logs** (Valsorda) enable cryptographically accountable governance records — append-only, verifiable collections using ATProto's existing properties.

Meanwhile, **permission spaces remain in design phase** with no implementation timeline. The Spring 2026 Roadmap says "significant implementation and experimentation work" remains. CSN should build on what exists today and plan spaces as a future migration path.

**V9's thesis**: CSN should decompose its governance stack into composable services that interoperate with converging ecosystem patterns. A cooperative governed through CSN should be discoverable via opensocial.community, deliberate through existing privacy mechanisms, vote through CSN's governance AppView, embed governance widgets via Inlay, manage code through Tangled, and schedule meetings through Smoke Signal — all under a single cooperative DID.

**What V9 adds (8 phases):**

| Phase | Name | Priority | Status |
|-------|------|----------|--------|
| V9.1 | Service-auth JWT migration | Immediate | Ready — Roomy/OpenMeet pattern + shipped Auth Scopes |
| V9.2 | Governance AppView API | Immediate | Ready — model after Blacksky's Acorn |
| V9.3 | Inlay governance components | Summer 2026 | Inlay is live at inlay.at |
| V9.4 | Content wrapper pattern | Summer 2026 | Sound design, no ecosystem blockers |
| V9.5 | Governance transparency logs | Summer 2026 | Valsorda PoC from ATmosphereConf |
| V9.6 | opensocial.community bridge | Fall 2026 | Track Ellich's multi-app integration |
| V9.7 | Lexicon Community engagement | Fall 2026 | Contribute to existing working groups |
| V9.8 | Permission spaces adapter | Late 2026+ | Deferred — spaces still in design phase |

---

## Table of Contents

1. [Ecosystem Context](#1-ecosystem-context)
2. [Service-Auth JWT Migration](#2-service-auth-jwt-migration)
3. [Governance AppView API](#3-governance-appview-api)
4. [Inlay Governance Components](#4-inlay-governance-components)
5. [Content Wrapper Pattern](#5-content-wrapper-pattern)
6. [Governance Transparency Logs](#6-governance-transparency-logs)
7. [opensocial.community Bridge](#7-opensocialcommunity-bridge)
8. [Lexicon Community Engagement](#8-lexicon-community-engagement)
9. [Permission Spaces Adapter](#9-permission-spaces-adapter)
10. [Anchor+Sidecar Pattern](#10-anchorsidecar-pattern)
11. [Implementation Phases](#11-implementation-phases)
12. [Risk Assessment](#12-risk-assessment)

---

## 1. Ecosystem Context

### Current Codebase State (April 11, 2026)

The application layer is mature: 60+ services, 88 pages, 68 route files, 339 E2E tests (981 total tests), 41 lexicon schemas under `network.coopsource.*`. V6 (real ATProto federation) and V7 (hook pipeline, declarative indexers, scripting engine, native label service) are complete. V8.1-V8.11 shipped (Home personal space, profiles with persona support, sidebar redesign, search service, matchmaking, entity editing, public web foundation, notifications). V8.12-V8.13 are in progress.

### ATProto Spring 2026 State

Protocol components for public data are broadly complete. The IETF ATP Working Group was formally approved March 19, 2026 (chairs: Shuping Peng, Mallory Knodel). IETF 125 (Vienna, July 2026) is the next milestone. The PLC Organization is forming as a Swiss Association. Auth Scopes have shipped with formal permission sets.

Key ecosystem developments since V8:

| Development | Status | Impact on CSN |
|---|---|---|
| Auth Scopes (Proposal 0011) | **Shipped** | Enables granular OAuth scope declarations for CSN's AppView |
| Roomy/OpenMeet cross-app auth | Working PoC (March 4, 2026) | Reference implementation for V9.1 service-auth JWTs |
| Blacksky Acorn | Production (March 23, 2026) | Governance model: Polis + custom AppView + community feeds |
| Dan Abramov's Inlay | Live at inlay.at | Composable governance UI components across ATProto apps |
| AT Transparency Logs (Valsorda) | Proposal (ATmosphereConf talk) | Cryptographically accountable governance records |
| IETF ATP Working Group | Formally approved March 19, 2026 | Protocol specs stabilizing; specs splitting into MST + sync drafts |
| PLC Organization | Forming as Swiss Association | Cooperative DID governance implications |
| Permission spaces (Holmgren) | Design phase only — Diary 4 was last entry | No implementation, no SDK, no timeline — defer |
| opensocial.community | Deployed, 105 commits, no cross-app adoption yet | Track but don't depend on |
| Lexicon Community Polite Goshawk WG | Active, no spec yet | Lexicon Lenses for cross-app record transformation |
| Tangled | €3.8M seed, organizations on 2026 roadmap | Code hosting with federated identity |
| Roomy | ATmosphereConf chat platform, ATProto + Automerge CRDTs | Hybrid local-first + protocol model |
| Graze | Open-sourced personalization engine (Rust) | Content surfacing for governance feeds |
| @atproto/lex v0.0.24 | Published ~April 10 | CLI lexicon schema management tooling |
| Lexicon Garden | 1,567 lexicons from 205 identities tracked | Discovery platform for governance schemas |
| ROOST Coop/Osprey | ATmosphereConf launch | Content moderation T&S — not governance, but Zentropi labeler may be relevant |

### What Didn't Happen

No Permissioned Data Diary 5 was published post-conference. No permission spaces implementation exists in any GitHub repo. No `ats://` URI scheme documentation exists. The `community.opensocial.*` lexicons have not been formally published outside the open-social repo. No `community.lexicon.governance.*` namespace has been proposed. No cross-app adoption of opensocial.community has occurred.

---

## 2. Service-Auth JWT Migration

### Problem

CSN's `OperatorWriteProxy` uses app-passwords to write to the cooperative's PDS. This pattern:
- Uses long-lived credentials that don't identify which operator acted
- Prevents other ATProto apps from writing to the cooperative's repo
- Is not aligned with the ecosystem's direction toward service-auth JWTs

### Reference: Roomy/OpenMeet Pattern

Roomy declares an OAuth scope (`rpc:net.openmeet.auth?aud=*`). When a user navigates to an OpenMeet event, Roomy silently requests a service-auth JWT from the user's PDS via `getServiceAuthToken()`, addressed to OpenMeet's DID. OpenMeet verifies the JWT and issues session tokens. No redirect or login form.

The JWT payload uses `iss` (issuer DID), `aud` (target service DID), `exp`, `iat`, `jti`, and optional `lxm` (method binding). The proposed `client_id` claim has NOT been adopted.

### Implementation

1. Build `ServiceAuthClient` in `packages/federation/src/atproto/`:
   - Create short-lived JWTs (< 60s) signed by operator's key
   - `iss` = operator DID, `aud` = cooperative PDS DID, `lxm` = XRPC method

2. Modify `OperatorWriteProxy` to use service-auth JWTs:
   - New config: `COOP_AUTH_MODE` (`'app-password' | 'service-auth'`, default `service-auth`)
   - Audit log captures operator DID from JWT `iss` (improved attribution)
   - Retain app-password fallback for existing cooperatives

3. Update cooperative provisioning to add CSN AppView as service entry in DID document

4. Declare CSN-specific OAuth scopes using shipped Auth Scopes infrastructure:
   - `rpc:network.coopsource.governance?aud=*` — governance operations
   - `rpc:network.coopsource.org?aud=*` — membership operations

---

## 3. Governance AppView API

### Problem

CSN's API serves only its own SvelteKit frontend. Other ATProto apps cannot query governance state without building their own indexer.

### Reference: Blacksky Acorn

Blacksky runs a full AppView (`api.blacksky.community`) with custom lexicons, democratic governance via Polis, and an incremental adoption model ("pick what you need"). Their relationship graph — originally for moderation — became "a map of the community itself."

### Implementation

Expose XRPC query endpoints that any authenticated ATProto app can call:

```
network.coopsource.query.getMembership      — Is DID X an active member of cooperative Y?
network.coopsource.query.getMemberRoles     — Roles for DID X in cooperative Y
network.coopsource.query.listMembers        — Active members (cursor-paginated)
network.coopsource.query.getProposal        — Proposal state by AT-URI
network.coopsource.query.listProposals      — Proposals for cooperative Y (cursor-paginated)
network.coopsource.query.getVoteEligibility — Can DID X vote on proposal Z?
network.coopsource.query.getVoteTally       — Current tally for proposal Z
network.coopsource.query.getOfficers        — Current officers of cooperative Y
```

Authentication: ATProto OAuth with shipped Auth Scopes. Rate limiting: 100 queries/hour for non-members, 1000/hour for members. Never expose pending/unmatched memberships.

---

## 4. Inlay Governance Components

### What is Inlay?

Dan Abramov's Inlay (inlay.at, source at `tangled.org/danabra.mov/inlay`) is "React for atproto" — an experimental browser for remixable cross-product server-driven UI on the Atmosphere. Components are authored by different developers and compose across applications. Lexicons define component contracts, records point at endpoints, everyone uses the same data.

Brittany Ellich confirmed she plans to integrate Inlay with her groups work.

### CSN Governance Components

Design composable governance widgets as Inlay social components:

- **VoteWidget** — embedded proposal voting (yes/no/abstain) with live tally
- **MembershipStatus** — shows a user's membership state in a cooperative
- **ProposalCard** — compact proposal summary with status, deadline, current tally
- **OfficerList** — current officers for a cooperative
- **GovernanceFeed** — stream of recent governance activity

These widgets read from the Governance AppView API (V9.2). Any ATProto client that supports Inlay can embed CSN governance actions without building custom UI. A Bluesky user could vote on a cooperative proposal directly from their feed.

### Implementation

1. Define Inlay component schemas following the Inlay component contract model
2. Build server-side rendering endpoints that produce Inlay-compatible component output
3. Register components with the Inlay registry
4. Governance AppView API (V9.2) serves as the data backend

---

## 5. Content Wrapper Pattern

### Problem

CSN has no mechanism for cooperatives to curate or reference member-authored content. A cooperative can't say "we endorse this analysis" or "this blog post is relevant to our current proposal."

### Solution

Cooperatives create `strongRef` records in their repo pointing to member content, separating authorship from distribution. Based on Gerakines' Community Manager Pattern (December 2025).

### New Lexicon: `network.coopsource.org.curatedContent`

```json
{
  "lexicon": 1,
  "id": "network.coopsource.org.curatedContent",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["content", "category", "curatedBy", "createdAt"],
        "properties": {
          "content": {
            "type": "ref",
            "ref": "com.atproto.repo.strongRef",
            "description": "Reference to member's original content (any ATProto record)"
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

Officers with `curator` or `admin` roles can create/delete wrappers. If the member deletes their content, the wrapper's strongRef points to a missing record — handled gracefully.

---

## 6. Governance Transparency Logs

### What are AT Transparency Logs?

Filippo Valsorda proposed (ATmosphereConf, March 29, 10:09 talk) using ATProto's existing properties — canonically hashed records and global access mechanisms — to create append-only, cryptographically verifiable record collections. The same technology behind Certificate Transparency and the Go Checksum Database.

### Application to Cooperative Governance

Governance proposals, voting records, officer appointments, policy decisions, and bylaws can be made **cryptographically accountable** without new infrastructure:

- **Append-only governance log**: Each governance action (proposal creation, vote cast, outcome declared, officer appointed) is a leaf in a Merkle tree
- **Signed Tree Heads**: Root hash + tree size + timestamp + signature, published as ATProto records
- **Inclusion proofs**: Any member can verify a specific decision was logged (O(log n) hashes)
- **Consistency proofs**: Prove the log is append-only — no entries removed or modified

### Implementation

1. Build `GovernanceTransparencyLog` service using `merkletreejs` with PostgreSQL storage
2. Hook into the existing hook pipeline — post-storage hooks append governance events to the log
3. Publish Signed Tree Heads as ATProto records in the cooperative's PDS:
   - `network.coopsource.governance.logHead` — treeSize, rootHash, timestamp, signature
4. Expose XRPC endpoints:
   - `network.coopsource.query.getLogInclusion` — Merkle inclusion proof for a decision
   - `network.coopsource.query.getLogConsistency` — consistency proof between two tree heads
5. Admin UI for log verification and audit

---

## 7. opensocial.community Bridge

### Current State

opensocial.community is deployed with 105 commits, supports three community types (open, admin-approved, private), and has cross-AppView approval. However, no cross-app adoption has occurred yet. Ellich is gathering feedback and plans multi-app integration.

### Approach

Build an optional compatibility layer that projects CSN bilateral membership to opensocial patterns. This is NOT a replacement — it's a read-only projection.

When a CSN cooperative opts in:
1. CSN registers the cooperative as an opensocial community
2. On CSN membership activation → write `community.opensocial.membershipProof` to cooperative's PDS
3. On CSN membership revocation → delete the opensocial proof
4. Uses service-auth (V9.1) for proof record writes

CSN's bilateral membership model remains authoritative. Inbound opensocial membership requests are routed to CSN's standard approval flow.

**Timing**: Defer until opensocial achieves cross-app adoption (at least one app besides Collective).

---

## 8. Lexicon Community Engagement

### Strategy

CSN has 41 lexicon schemas — the most comprehensive governance schema set in the ATProto ecosystem. Contributing a subset as community standards establishes CSN as the reference implementation.

**Track 1**: Contribute to existing working groups (Polite Goshawk for Lexicon Lenses) rather than proposing a new governance namespace until the ecosystem converges.

**Track 2**: When the Lexicon Community matures, propose generalized governance schemas under `community.lexicon.governance.*` — extracting from CSN's existing `network.coopsource.governance.*` schemas.

**Track 3**: Build Lexicon Lenses transforming `network.coopsource.org.membership` ↔ `community.opensocial.membership` for cross-app record consumption.

---

## 9. Permission Spaces Adapter

### Why Deferred

As of April 11, 2026:
- No Diary 5 published since ATmosphereConf
- No implementation in any GitHub repo
- No SDK additions or prototype code
- No `ats://` URI documentation
- Holmgren's ATmosphereConf talk focused on IETF/PLC governance, not spaces implementation
- Spring 2026 Roadmap: "significant implementation and experimentation work before details are finalized"

### Preparation (No Code Now)

CSN's existing architecture is well-positioned for eventual spaces adoption:
- `private_record` table uses `(did, collection, rkey, record_json)` — maps to permissioned repo records
- `VisibilityRouter` already makes Tier 1/Tier 2 routing decisions
- `ISpaceAdapter` interface can be designed when spaces design stabilizes

### When to Activate

Monitor for: Holmgren Diary 5+, SDK PRs in `bluesky-social/atproto`, `ats://` spec publication, or Blacksky/Northsky/Habitat shipping spaces implementations. Design the adapter when any of these appear.

---

## 10. Anchor+Sidecar Pattern

### Design (Deferred to V9.8, But Architecturally Sound)

The anchor+sidecar pattern (public governance anchors paired with private deliberation sidecars) requires a private data mechanism. Currently CSN uses the `private_record` table. When permission spaces ship, sidecars move to permissioned repos.

**For now**: CSN's existing `VisibilityRouter` with Tier 1/Tier 2 routing serves the same purpose. A proposal in a mixed-visibility cooperative is either public (Tier 1 PDS) or private (Tier 2 `private_record`). The formal anchor+sidecar split (where both exist simultaneously — public summary + private details) becomes valuable when spaces provide protocol-native private data that other apps can sync.

**When spaces ship**: Split `VisibilityRouter` into three-way routing: public (PDS) / private (space) / mixed (anchor to PDS + sidecar to space).

---

## 11. Implementation Phases

### Phase V9.1: Service-Auth JWT Migration

**Branch**: `feature/v9.1-service-auth`
**Effort**: 1-2 weeks
**Dependencies**: None — start immediately

**Tasks:**
1. Build `ServiceAuthClient` in `packages/federation/src/atproto/service-auth-client.ts`
2. Modify `OperatorWriteProxy` — add `COOP_AUTH_MODE` config, JWT-per-operation, retain app-password fallback
3. Update cooperative provisioning to add CSN AppView as DID document service entry
4. Declare OAuth scopes using shipped Auth Scopes infrastructure
5. Wire into DI container

**Key files:**
- `packages/federation/src/atproto/service-auth-client.ts` (new)
- `apps/api/src/services/operator-write-proxy.ts` (modify)
- `apps/api/src/config.ts` (add COOP_AUTH_MODE)
- `apps/api/src/container.ts` (wire)
- `scripts/provision-cooperative.ts` (add service entry)

### Phase V9.2: Governance AppView API

**Branch**: `feature/v9.2-governance-api`
**Effort**: 2-3 weeks
**Dependencies**: V9.1 (service-auth for external caller authentication)

**Tasks:**
1. Define 8 XRPC query lexicons in `packages/lexicons/network/coopsource/query/`
2. Build XRPC route handlers in `apps/api/src/routes/xrpc-governance.ts`
3. Build XRPC auth middleware (verify ATProto OAuth, resolve DID, check membership/visibility)
4. Add per-DID rate limiting
5. Mount routes under `/xrpc/network.coopsource.query.*`
6. Document API for external developers

**Key files:**
- `packages/lexicons/network/coopsource/query/` (new directory, 8 lexicons)
- `apps/api/src/routes/xrpc-governance.ts` (new)
- `apps/api/src/middleware/xrpc-auth.ts` (new)
- `apps/api/src/index.ts` (mount routes)

### Phase V9.3: Inlay Governance Components

**Branch**: `feature/v9.3-inlay-components`
**Effort**: 3-4 weeks
**Dependencies**: V9.2 (Governance API as data backend)

**Tasks:**
1. Study Inlay component contract model (`tangled.org/danabra.mov/inlay`)
2. Design 5 governance components: VoteWidget, MembershipStatus, ProposalCard, OfficerList, GovernanceFeed
3. Build server-side rendering endpoints producing Inlay-compatible output
4. Register components with Inlay registry
5. Test embedding in Bluesky / other ATProto clients

### Phase V9.4: Content Wrapper Pattern

**Branch**: `feature/v9.4-content-wrappers`
**Effort**: 1-2 weeks
**Dependencies**: None

**Tasks:**
1. Define `network.coopsource.org.curatedContent` lexicon
2. Build `CuratedContentService` — CRUD with officer-only authorization
3. Add declarative hook config for indexing
4. Add Kysely migration for `curated_content` table
5. Build officer UI for curating content
6. Add curated content feed to cooperative workspace

### Phase V9.5: Governance Transparency Logs

**Branch**: `feature/v9.5-transparency-logs`
**Effort**: 2-3 weeks
**Dependencies**: None (hook pipeline already exists)

**Tasks:**
1. Build `GovernanceTransparencyLog` service using `merkletreejs`
2. Add post-storage hook that appends governance events to the Merkle tree
3. Define `network.coopsource.governance.logHead` lexicon
4. Publish Signed Tree Heads to cooperative's PDS
5. Add XRPC query endpoints for inclusion/consistency proofs
6. Build admin UI for log verification

### Phase V9.6: opensocial.community Bridge

**Branch**: `feature/v9.6-opensocial-bridge`
**Effort**: 1-2 weeks
**Dependencies**: V9.1 (service-auth for writing proof records)
**Timing**: Defer until opensocial achieves cross-app adoption

**Tasks:**
1. Build `OpenSocialBridgeService` — sync CSN membership state to opensocial proofs
2. Register post-storage hook for membership state changes
3. Add per-cooperative opt-in setting
4. Handle inbound opensocial membership requests → route to CSN approval flow

### Phase V9.7: Lexicon Community Engagement

**Branch**: `feature/v9.7-lexicon-community`
**Effort**: Ongoing community engagement
**Dependencies**: V9.2 (governance API demonstrates the schemas)

**Tasks:**
1. Contribute to Polite Goshawk working group (Lexicon Lenses)
2. Build Lexicon Lens transforms: CSN membership ↔ opensocial membership
3. When ecosystem converges, propose `community.lexicon.governance.*` schemas
4. Register CSN's lexicons on Lexicon Garden for discoverability

### Phase V9.8: Permission Spaces Adapter

**Branch**: `feature/v9.8-space-adapter`
**Effort**: TBD — depends on spaces design finalization
**Dependencies**: Spaces specification + SDK
**Timing**: Late 2026 at earliest

**Tasks:**
1. Design `ISpaceAdapter` interface when spaces design stabilizes
2. Build `PostgresSpaceAdapter` wrapping `private_record` table
3. Build `AtprotoSpaceAdapter` when spaces SDK ships
4. Implement anchor+sidecar split in `VisibilityRouter`
5. Data migration tool: `private_record` → permissioned repos

### Phase Dependencies

```
V9.1 (Service Auth) ← start immediately
  └→ V9.2 (Governance API)
       └→ V9.3 (Inlay Components)
       └→ V9.7 (Lexicon Community)
  └→ V9.6 (opensocial Bridge) — deferred

V9.4 (Content Wrappers) ← independent, start anytime
V9.5 (Transparency Logs) ← independent, start anytime

V9.8 (Spaces Adapter) ← deferred, when spaces ship
```

---

## 12. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Service-auth JWT pattern not officially documented | May need adjustment as spec evolves | Follow Roomy/OpenMeet pattern; Bluesky team is aware of the usage |
| Inlay is experimental and may change | Component contracts could break | Build thin wrappers; governance logic stays in CSN's AppView |
| Permission spaces design changes substantially | Adapter interface needs revision | Deferred — no code until design stabilizes |
| Governance AppView API increases attack surface | External callers probe membership data | Per-DID rate limiting, visibility-aware auth, no pending membership exposure |
| opensocial.community schema changes | Bridge needs updating | Bridge is optional; CSN's membership is authoritative |
| Transparency log adds storage overhead | Merkle tree grows with governance activity | Prune resolved entries; tree size is O(n) in governance decisions |
| IETF standardization changes ATProto wire protocol | Breaking changes to sync/repo format | Monitor drafts; Tap handles sync abstraction |
| Lexicon Garden tracks CSN schemas publicly | Schema design decisions become visible | Good — transparency is a cooperative principle |

---

## References

- **ATProto Spring 2026 Roadmap** — https://atproto.com/blog/2026-spring-roadmap
- **ATProto Permissions Spec** — https://atproto.com/specs/permission
- **Holmgren Permissioned Data Diary 1-4** — https://dholms.leaflet.pub/
- **Roomy/OpenMeet Cross-App Auth** — https://openmeet.net/cross-app-authentication-atproto
- **Blacksky Acorn** — https://blackskyweb.xyz/introducing-acorn-community-infrastructure-that-grows-with-you/
- **Dan Abramov Inlay** — https://inlay.at and https://tangled.org/danabra.mov/inlay
- **AT Transparency Logs (Valsorda)** — ATmosphereConf VOD: https://vods.ajbird.net/talks/3miacona6fc2e
- **opensocial.community** — https://opensocial.community/ and https://github.com/collectivesocial/open-social
- **Gerakines Community Manager Pattern** — https://ngerakines.leaflet.pub/3majmrpjrd22b
- **Ellich "Representing groups in ATProto"** — https://brittanyellich.com/atproto-groups/
- **Ellich post-ATmosphereConf** — https://brittanyellich.com/atproto/
- **Lexicon Community** — https://github.com/lexicon-community
- **Lexicon Garden** — https://lexicon.garden/
- **IETF ATP Working Group** — https://atproto.com/blog/kicking-off-the-atp-working-group
- **ATProto Service Auth** — https://docs.bsky.app/docs/advanced-guides/service-auth
- **Resonant Computing Manifesto** — https://www.techdirt.com/2026/01/27/atproto-the-enshittification-killswitch-that-enables-resonant-computing/
- **ATmosphereConf 2026 VODs** — https://vods.ajbird.net/
- **Graze Personalization** — https://graze.leaflet.pub/3mgascfb6uc2e
- **Northsky Phase 2** — https://northskysocial.com/posts/beginning-phase-2-of-northsky
