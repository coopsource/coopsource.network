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
| V9.1 | Cooperative write path (PLC-owned keys + app-password sessions) | Immediate | Active — verified against atproto main 0.4.218 |
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
2. [Cooperative Write Path: PLC-Owned Signing Keys + App-Password Sessions](#2-cooperative-write-path-plc-owned-signing-keys--app-password-sessions)
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

## 2. Cooperative Write Path: PLC-Owned Signing Keys + App-Password Sessions

### Problem

In production (`PDS_URL` set), every write to a cooperative's PDS repo routes through `AtprotoPdsService.getAgentForDid()`, which attaches `Authorization: Basic admin:${PDS_ADMIN_PASSWORD}` on every XRPC call. That single shared admin credential has full control over every repo on the PDS — not auditable to a specific cooperative, not portable across PDSes, and not a valid auth type for repo writes on real `@atproto/pds` (verified: PDS rejects admin Basic for `com.atproto.repo.*` with "Unexpected authorization type"; V6 tests only passed because of the post-`createDid` session cache masking the issue).

V9.1 replaces this with an ecosystem-native two-part design: **CSN-owned signing keys registered in PLC from day one** (so other ATProto apps can verify records authored by the cooperative against the cooperative's own key), paired with **app-password sessions** (the atproto-native primitive for "a third-party service holds scoped, revocable credentials to act on behalf of an account") for all ongoing repo writes.

### Findings that shaped the design

Three discoveries during step 5–7 implementation reshaped the original sketch of this phase:

1. **Service-auth JWTs are not accepted by `@atproto/pds` for repo writes.** The `authorization()` verifier used by `com.atproto.repo.createRecord`, `putRecord`, and `deleteRecord` routes Bearer tokens to the legacy `access()` verifier (which expects PDS-issued session tokens signed by the PDS's own key) and DPoP tokens to OAuth. It has no service-auth branch. Verified against `packages/pds/src/auth-verifier.ts` on atproto main (0.4.218). Service-auth is handled by a separate `userServiceAuth()` verifier that none of the three repo write handlers use. This is the current ecosystem design, not a version gap — upgrading the PDS will not change it. The Roomy/OpenMeet service-auth PoC that inspired the original sketch uses JWTs for *cross-service RPC calls to a custom endpoint*, not for writes into another repo, so the analogy was aspirational rather than applicable.

2. **`com.atproto.server.createAccount` DOES accept service-auth JWTs for DID imports.** Passing `did: <pre-registered PLC DID>` with `Authorization: Bearer <service-auth JWT signed by the DID's PLC-registered signing key>` lets a caller import a pre-existing DID into a PDS as a new account. This is what enables CSN to provision cooperatives with CSN-owned PLC signing keys — generate keys locally, POST the signed genesis op to the PLC directory, mint a service-auth JWT with `lxm='com.atproto.server.createAccount'`, and call `createAccount({did, ...})`. The PDS verifies the JWT against the same key we just registered in PLC. Verified working end-to-end against the test PDS.

3. **App passwords are the ecosystem-native path for server-to-server writes.** `com.atproto.server.createAppPassword` returns a scoped, revocable credential intended for "trusted clients" acting on behalf of an account. Right after provisioning, CSN uses the session tokens returned by `createAccount` to immediately create an app password and discard the random account password. All subsequent repo writes use `AtpAgent.login({identifier: did, password: appPassword})` — standard session auth, standard access/refresh token flow handled by `@atproto/api`, standard `Authorization: Bearer <accessJwt>` header that the PDS's `authorization()` verifier accepts.

### Design: two paths, one goal

**Path A — Cooperative provisioning (one-time per cooperative):**

1. Generate a P-256 signing keypair and a secp256k1 rotation keypair locally.
2. Build an unsigned PLC genesis op carrying CSN-owned `verificationMethods.atproto`, rotation keys, `alsoKnownAs: [<handle>]`, and service entries for both `atproto_pds` (pointing at the PDS) and `#coopsource` (pointing at the CSN instance URL). Sign it with the rotation private key via `signPlcOperationK256`.
3. Compute the `did:plc:*` from the signed op via `PlcClient.computeDid`.
4. POST the signed op directly to the PLC directory to register the DID.
5. Create a PDS invite code via admin HTTP Basic auth on `com.atproto.server.createInviteCode`.
6. Mint a short-lived ES256 service-auth JWT (`iss=<new did>`, `aud=<pds service DID from describeServer>`, `lxm='com.atproto.server.createAccount'`, `exp=now+60`) signed by the cooperative's atproto signing key. `ServiceAuthClient` (still needed, still used) handles this.
7. Call `agent.com.atproto.server.createAccount({handle, email, password, inviteCode, did})` with the JWT attached as the Authorization header. The PDS verifies the JWT against `verificationMethods.atproto` (which is the exact key we just registered in PLC) and opens a local account for the pre-registered DID. Returns `accessJwt` + `refreshJwt`.
8. Using the returned session, call `com.atproto.server.createAppPassword({name: 'coopsource-api', privileged: true})`. Store the returned app password encrypted in `auth_credential` with `credential_type='atproto-app-password'` and `entity_did=<new did>`.
9. Write the signing private scalar (encrypted) to `entity_key` with `key_purpose='atproto-signing'` (useful for future cross-service calls — the PDS accepts service-auth for some XRPC methods, just not repo writes).
10. Write the `entity` row that the `entity_key` + `auth_credential` foreign keys reference.
11. Discard the random account password — CSN never needs it again; the app password is the ongoing credential.

**Path B — Ongoing cooperative writes (every subsequent repo operation):**

1. Every call to `pdsService.createRecord`/`putRecord`/`deleteRecord` with a cooperative DID routes through `AtprotoPdsService.authFor(did, lxm)`.
2. `authFor` first tries the `AuthCredentialResolver`, which looks up the DID's `atproto-app-password` row in `auth_credential` and decrypts it using `KEY_ENC_KEY`.
3. On first write after a process start, `authFor` calls `agent.login({identifier: did, password: appPassword})` to open a session. The logged-in `AtpAgent` is cached per DID in a `Map<DID, AtpAgent>`.
4. Subsequent calls reuse the cached agent. `@atproto/api` handles access-token refresh automatically via the stored `refreshJwt` — no refresh logic in our code.
5. On auth failure from a cached agent (expired refresh token, revoked app password), the cache entry is dropped and `authFor` re-logs-in once before propagating the error.
6. Falls back to the V6-style post-`createDid` session cache (narrow scope, in-process only) for DIDs with no app-password row, then to admin Basic as the terminal "clear failure signal" branch.

**Why this is ecosystem-aligned:** app passwords exist precisely for the "third-party service holds credentials to write as this account" use case. They are scoped (the `privileged` flag controls whether they can change account settings), revocable independently of the account password, labeled (the `name` field identifies which service), and auditable (the PDS logs which app password was used for each write). Session tokens from app-password login are exactly what `authVerifier.authorization()` accepts on repo write methods. There is no shorter path between CSN and a PDS-accepted repo write.

### Key files

- `packages/federation/src/local/cooperative-provisioning.ts` — `provisionCooperative(options)` library function (Path A)
- `packages/federation/src/atproto/service-auth-client.ts` — used by Path A step 6 for the `createAccount` import JWT
- `packages/federation/src/http/auth-credential-resolver.ts` — used by Path B step 2 for app-password lookup
- `packages/federation/src/atproto/atproto-pds-service.ts` — `authFor(did, lxm)` decision tree (Path B)
- `apps/api/scripts/provision-cooperative.ts` — thin CLI wrapper around `provisionCooperative`
- `apps/api/src/container.ts` — wires `AuthCredentialResolver` into `AtprotoPdsService`

### Deferred to V9.2 — OAuth scope rewrite

V9.1 was originally sketched to replace `'atproto transition:generic'` (in `apps/api/src/auth/oauth-client.ts`) with `'atproto rpc:network.coopsource.governance?aud=* rpc:network.coopsource.org?aud=*'`. This is deferred because it's a permission **narrowing**, not a neutral rewrite — CSN writes to at least ten lexicon namespaces via member OAuth sessions (`funding`, `alignment`, `agreement`, `commerce`, `ops`, `legal`, `connection`, `actor`, `governance`, `org`), and the narrow two-namespace set would silently break eight feature areas the moment a user's OAuth session refreshes. V9.2 (governance AppView API) does the full per-namespace scope audit and is the right place to ship the rewrite.

### V9.10 — Future alignment check (no work scheduled)

Not a numbered phase. Purely a monitoring item for future revisits.

If the atproto ecosystem eventually ships a narrower server-to-server write primitive — e.g., granular Auth Scopes (`rpc:com.atproto.repo.*`) that unlock service-auth for repo writes, or a new non-interactive DPoP-bound credential type — revisit `AtprotoPdsService.authFor` to replace the app-password login path with whatever the ecosystem standardizes. Signals to watch: changes to `auth-verifier.ts` in `bluesky-social/atproto` that add service-auth to `authorization()`, new call sites of `authorizationOrUserServiceAuth()` inside `packages/pds/src/api/com/atproto/repo/`, or an ATProto spec update formalizing third-party server credentials for account writes. See [bluesky-social/atproto discussion #4118](https://github.com/bluesky-social/atproto/discussions/4118) and [#4437](https://github.com/bluesky-social/atproto/discussions/4437) for the current state of granular permissions work.

Until that happens, V9.1's app-password approach IS the current ecosystem standard.

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

### Phase V9.1: Cooperative Write Path (PLC-Owned Keys + App-Password Sessions)

**Branch**: `feature/v9.1-service-auth`
**Dependencies**: None — start immediately

**Tasks (see §2 above for the full design rationale):**

1. Build `ServiceAuthClient` + `SigningKeyResolver.resolveRawBytes` + `resolvePdsServiceDid` in `packages/federation/` — used by Path A (cooperative provisioning import JWT).
2. Build `AuthCredentialResolver` at `packages/federation/src/http/auth-credential-resolver.ts` — used by Path B (cooperative write auth).
3. Implement `provisionCooperative` library function at `packages/federation/src/local/cooperative-provisioning.ts`: generates P-256 signing + secp256k1 rotation keypairs, POSTs a signed PLC genesis op to the PLC directory, mints a `com.atproto.server.createAccount` service-auth JWT, imports the DID into the PDS, creates a privileged app password via `com.atproto.server.createAppPassword`, and persists `entity` + `entity_key` + `auth_credential` rows.
4. Thin CLI wrapper at `apps/api/scripts/provision-cooperative.ts` that parses args and calls `provisionCooperative`.
5. Modify `AtprotoPdsService` to accept optional `authCredentialResolver` and add `authFor(did, lxm)` with the app-password session path (Path B), fallback to post-`createDid` session cache, fallback to admin Basic. Retain existing session cache as the narrow V6-era optimization.
6. Wire `AuthCredentialResolver` into the DI container.
7. Integration test (`packages/federation/tests/coop-write-auth-mode.test.ts`): provisions a test cooperative via `provisionCooperative`, then asserts cooperative writes succeed via the app-password session path. Includes negative tests against the PDS's actual signature verification.

**Key files:**

- `packages/federation/src/atproto/service-auth-client.ts` (new — used by provisioning import JWT only)
- `packages/federation/src/atproto/pds-did-resolver.ts` (new)
- `packages/federation/src/http/signing-key-resolver.ts` (extend with `resolveRawBytes`)
- `packages/federation/src/http/auth-credential-resolver.ts` (new — app-password lookup)
- `packages/federation/src/local/cooperative-provisioning.ts` (new — Path A library function)
- `packages/federation/src/atproto/atproto-pds-service.ts` (modify — add `authFor`)
- `apps/api/src/container.ts` (wire `AuthCredentialResolver`)
- `apps/api/scripts/provision-cooperative.ts` (thin CLI wrapper)

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
