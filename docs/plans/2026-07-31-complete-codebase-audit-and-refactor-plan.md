# Complete Codebase Audit and Refactor Plan

- **Date:** 2026-07-31
- **Status:** Research complete; remediation plan awaiting approval
- **Code baseline:** `main` at `9c7a496`
- **Code review cutoff:** 2026-07-31
- **External ecosystem cutoff:** 2026-07-31 14:41:49
  America/Los_Angeles (`2026-07-31T21:41:49Z`)
- **Previous ecosystem baseline:** 2026-07-29 23:59
  America/Los_Angeles; independently refreshed from live primary sources for
  this report
- **Audit branch:** `docs/complete-codebase-audit-2026-07-31`
- **Scope:** API, web application, database, federation, ATProto OAuth and
  identity, Lexicons, public AppView ingestion, Proposal 0016 permissioned
  spaces, governance, finance, legal agreements, deployment, tests, and
  operations
- **Implementation:** None. This document does not authorize code changes.

## Executive Assessment

The codebase is an ambitious and unusually broad proof of concept with strong
domain coverage, substantial automated tests, clear architectural intent, and
a promising cryptographic implementation of the pinned Proposal 0016 draft.
It is **not safe to deploy or operate as documented**.

The primary problem is not one isolated defect. The system has multiple write
and authority paths that do not enforce the same invariants:

1. HTTP routes usually check membership and permissions, but public firehose
   projectors can bypass those checks and directly create authoritative
   governance rows.
2. A successful PDS write, optimistic PostgreSQL projection, firehose echo,
   background transition, and replay can each mutate the same logical object
   differently.
3. The AppView acknowledges or advances past failed records while projections
   are non-transactional and not uniformly idempotent.
4. PostgreSQL is described as a projection cache, but many lifecycle changes
   occur only in PostgreSQL and are never reflected in the canonical repo.
5. Cooperative, legal, financial, and tenant authorization is inconsistently
   enforced at the object level.
6. Production images, migrations, proxy routing, and feature configuration
   have source-proven blockers.

The highest-risk confirmed outcomes are:

- arbitrary public ATProto identities can inject proposals and non-member
  votes into a cooperative's projected governance state;
- any cooperative member can manage scripts, and the `node:vm` sandbox is
  escapable to Node.js process access when the worker runs;
- data designated Tier 2 can be written to public repositories;
- agreement federation endpoints permit signer impersonation;
- vote outcomes can be wrong because of delegation double counting,
  replay-clobbered weights, resurrected retractions, and incorrect
  supermajority semantics;
- financial balances, patronage distributions, and campaign totals can be
  duplicated or lost under retry/concurrency;
- coordinator role assignment permits self-promotion to `admin` or `owner`;
- invite-only registration is not enforced;
- authentication secrets are logged and bearer credentials are stored in
  plaintext;
- the documented production build and fresh migration path are broken.

**Recommendation:** Do not expose this system to untrusted users, federated
records, real cooperative decisions, confidential data, or financial data
until the P0 and P1 gates in the plan are complete. Keep the Proposal 0016
consumer disabled by default.

## Method And Limits

The audit combined:

1. static review of startup, dependency wiring, routes, services, projectors,
   package boundaries, schema, tests, and deployment assets;
2. end-to-end tracing of public and permissioned write/read paths;
3. an authorization review of sensitive and mutating API surfaces;
4. ATProto conformance review of Lexicons, repo operations, identity, OAuth,
   service auth, XRPC, Tap, and the pinned Proposal 0016 target;
5. domain review of governance, membership, agreements, patronage, capital
   accounts, payments, and lifecycle transitions;
6. review of web route guards, redirects, XSS sinks, cookies, CSRF posture,
   CSP, form behavior, and API error handling; and
7. review of test topology, Docker images, Compose, Caddy, health, shutdown,
   jobs, observability, backups, and documentation.

The code review was primarily static. The ecosystem review independently
fetched current GitHub metadata/commits, npm registry metadata, project
repositories, primary project documentation, Atmosphere forum threads,
Holmgren's diary index, and IETF Datatracker sources. It did not rely on an LLM
knowledge cutoff for claims of current status.

No full test suite, live federation test, dependency vulnerability scan,
container scan, API fuzzing, or production network assessment was run. One
isolated non-mutating proof confirmed the `Promise.constructor` sandbox escape.
Findings based on disabled or optional paths are identified as conditional.

## Live Ecosystem Refresh

### Evidence labels

| Label                            | Meaning in this report                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| Normative/released specification | Published stable protocol documentation; not a statement that every PDS supports it     |
| Published proposal               | Public design target explicitly subject to change                                       |
| Executable draft                 | Source that can be tested, but is unmerged, unreleased, or wire-unstable                |
| Released implementation          | Tagged software; experimental features may still be unstable                            |
| Deployed product                 | User-facing behavior exists, possibly through a product-specific or off-protocol design |
| Active prototype                 | Substantial working source without a stable interoperable release                       |
| Discussion/speculation           | Issue, forum proposal, roadmap, or design signal with no accepted contract              |
| Paused/stale                     | No current implementation activity or an explicitly paused line of work                 |

### Material delta since July 29

1. **Bluesky's published Proposal 0016 did not change.** Its latest path commit
   remains [`1caad93`](https://github.com/bluesky-social/proposals/commit/1caad93dbb1f445396f6abf3b97eb4040345e78e)
   from July 3. It remains a **published proposal**, not a final specification.
2. **The official executable draft changed substantially.** ATProto
   [PR #5187](https://github.com/bluesky-social/atproto/pull/5187) moved from the
   repository's pin of `3f6c96d5`/74 commits to
   `b76a4cf1af7be57982897ff311b43fd081a4e2bc`/83 commits. At the live cutoff it
   was still open, draft, dirty, and not mergeable, with 165 changed files.
3. The new draft commits add or change:
   - CAR-producing `getRepo` recovery (the response is a stream, but the current
     provider buffers all records before emission);
   - canonical space handling in `AtUri` plus a `SpaceRef`/`space-ref` model;
   - support for explicit keys on `type: "space"` declarations;
   - credential issuer/authority and `kid` validation;
   - space-aware OAuth consent presentation;
   - `read_self` behavior; and
   - client-attestation metadata/JWKS verification with SSRF controls.

   The live
   [comparison from CSN's pin to the observed head](https://github.com/bluesky-social/atproto/compare/3f6c96d5d2d25438bd40fa89d6ecc37865f8e354...b76a4cf1af7be57982897ff311b43fd081a4e2bc)
   contained these nine commits:

   | Commit                                                                                                 | Authored UTC     | Observed purpose                                                                                                            |
   | ------------------------------------------------------------------------------------------------------ | ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
   | [`4d1cbe2`](https://github.com/bluesky-social/atproto/commit/4d1cbe2ca413560c7c719a4df5def061ce0f0f13) | 2026-07-30 00:51 | Major spaces cleanup and CAR-producing `getRepo` path; authored before the previous cutoff but absent from its observed pin |
   | [`830088b`](https://github.com/bluesky-social/atproto/commit/830088bfe7d7e6c770966789a4d495f0b1644046) | 2026-07-30 16:53 | Sync package cleanup                                                                                                        |
   | [`64853ba`](https://github.com/bluesky-social/atproto/commit/64853bab2093c2a62b442094e7f6fcc3c31d0e43) | 2026-07-30 21:30 | AT URI integration/fixes                                                                                                    |
   | [`b03d7e5`](https://github.com/bluesky-social/atproto/commit/b03d7e5bb4c4fb8249117be70944211e44504575) | 2026-07-30 22:17 | Space Lexicon tooling/key corrections                                                                                       |
   | [`24a81bf`](https://github.com/bluesky-social/atproto/commit/24a81bf5ab8d39557da35a4c4c0978c9aa62c45a) | 2026-07-30 22:35 | `SpaceRef` and `space-ref` format                                                                                           |
   | [`d784974`](https://github.com/bluesky-social/atproto/commit/d784974146a2d811241c65949c9436db7012329a) | 2026-07-30 23:17 | Space credential security fixes                                                                                             |
   | [`47205c4`](https://github.com/bluesky-social/atproto/commit/47205c4cbaadf563896c103a00cf9ed29f97e302) | 2026-07-31 01:05 | Space-aware OAuth consent UI                                                                                                |
   | [`b9efd3d`](https://github.com/bluesky-social/atproto/commit/b9efd3d21cfe8b5b63bcc333209fe981c095490a) | 2026-07-31 16:36 | `read_self` and management-scope behavior                                                                                   |
   | [`b76a4cf`](https://github.com/bluesky-social/atproto/commit/b76a4cf1af7be57982897ff311b43fd081a4e2bc) | 2026-07-31 18:55 | Client-attestation verifier                                                                                                 |

4. **The implementation moved without a proposal revision.** Current branch
   `read_self` behavior is no longer collection-constrained even though the
   unchanged proposal says it is. PR #5187 also has a concrete internal CAR
   contradiction: its
   [serializer](https://github.com/bluesky-social/atproto/blob/b76a4cf1af7be57982897ff311b43fd081a4e2bc/packages/space/src/sync/provider.ts)
   orders record paths using canonical DAG-CBOR map-key order (length, then
   bytewise), while the
   [proposal](https://github.com/bluesky-social/proposals/blob/1caad93dbb1f445396f6abf3b97eb4040345e78e/0016-permissioned-data/README.md#repo-serialization)
   and branch
   [`getRepo` Lexicon](https://github.com/bluesky-social/atproto/blob/b76a4cf1af7be57982897ff311b43fd081a4e2bc/lexicons/com/atproto/space/getRepo.json)
   require lexicographic order. Single-use replay enforcement is also not yet
   evidenced end to end.
5. **No `@atproto/space` package is published.** The branch contains an
   unpublished `0.0.1` package manifest. npm returned `404` at the live cutoff.
6. Released package versions moved to
   [`@atproto/api 0.20.36`](https://www.npmjs.com/package/@atproto/api),
   [`@atproto/oauth-client-node 0.5.1`](https://www.npmjs.com/package/@atproto/oauth-client-node),
   [`@atproto/oauth-scopes 0.5.7`](https://www.npmjs.com/package/@atproto/oauth-scopes),
   [`@atproto/pds 0.5.23`](https://www.npmjs.com/package/@atproto/pds), and
   [`@atproto/sync 0.3.15`](https://www.npmjs.com/package/@atproto/sync). Those
   releases do not ship the permissioned-data branch. CSN remains on older
   API/OAuth versions.
7. **No Diary 8 was published.** Holmgren's
   [live index](https://dholms.leaflet.pub/) still ends with
   [Diary 7](https://dholms.leaflet.pub/3mqtqvjidqs2p), dated July 17.
8. **HappyView did not move after the prior cutoff.** Stable remains
   [`2.11.8`](https://github.com/gamesgamesgamesgamesgames/happyview/releases/tag/v2.11.8)
   and the latest experimental spaces target remains
   [`2.12.0-dev.2`](https://github.com/gamesgamesgamesgamesgames/happyview/releases/tag/v2.12.0-dev.2).
9. **Independent implementation is more active than the prior report stated.**
   The Rust [atproto-crates](https://tangled.org/ngerakines.me/atproto-crates)
   work resumed, including space CAR recovery, commit-hash notification,
   credential/wire hardening, and pagination compatibility. The space crate is
   not in a tagged release or on crates.io.
10. **New community pressure is concrete but speculative.** Proposal
    [issue #97](https://github.com/bluesky-social/proposals/issues/97) asks for
    optional attribute/receipt/verifiable-credential claims and potentially
    identity-minimizing access. Proposal
    [issue #98](https://github.com/bluesky-social/proposals/issues/98) identifies
    unresolved private-blob garbage collection when a repo host and space host
    differ.
11. The new
    [`community.lexicon.service.describe`](https://discourse.atmosphere.community/t/working-group-service-self-description/1031)
    discussion proposes service capability discovery. It has no merged
    Lexicon or reference implementation and is **discussion/speculation**.
12. IETF 126 discussed public repo/sync drafts, account identifiers, AT URI
    syntax, cryptography, block ordering, CBOR, and alternate transports. The
    [approved ATP charter](https://datatracker.ietf.org/doc/charter-ietf-atp/)
    still explicitly excludes non-public or limited-visibility data and
    application schemas. Nothing at IETF makes Proposal 0016 normative.

### Current spaces and community implementation landscape

| Work                                                                                                                                                                 | Maturity at cutoff                                               | Current evidence                                                                                                                                                                                                                                                                                                  | Relevance to CSN                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| [Bluesky Proposal 0016](https://github.com/bluesky-social/proposals/tree/main/0016-permissioned-data)                                                                | Published proposal                                               | Text unchanged since July 3; URI and several lifecycle questions remain open                                                                                                                                                                                                                                      | Current Layer 1 design target, never a stable dependency                                                             |
| [ATProto PR #5187](https://github.com/bluesky-social/atproto/pull/5187)                                                                                              | Executable draft                                                 | Active 83-commit implementation; `getRepo`, URI/tooling, credential, OAuth, and attestation work landed; still draft/dirty                                                                                                                                                                                        | Primary pinned differential target; CSN's existing pin is stale                                                      |
| [Permissioned Data Diary 7](https://dholms.leaflet.pub/3mqtqvjidqs2p)                                                                                                | Community direction                                              | Direct pull, LtHash, notification hints, no core membership abstraction, and rationale for the proposal's deniable signed-context-plus-HMAC scheme                                                                                                                                                                | Architectural rationale that points to Proposal 0016 for wire details, not a separate wire profile                   |
| [HappyView](https://github.com/gamesgamesgamesgamesgames/happyview/releases)                                                                                         | Released implementation plus active experiment                   | Stable AppView product; experimental spaces differ on commit signature, parameters, credentials, CAR trust, and notifications                                                                                                                                                                                     | Differential harness, not CSN's AppView or protocol oracle                                                           |
| [atproto-crates](https://tangled.org/ngerakines.me/atproto-crates)                                                                                                   | Active executable draft                                          | Independent Rust space/repo/credential/sync work; conformance fixes continue rapidly; no current space release                                                                                                                                                                                                    | Independent fixtures and failure discovery, not a dependency yet                                                     |
| [Blacksky `rsky`](https://github.com/blacksky-algorithms/rsky)                                                                                                       | Active prototype                                                 | Contains `rsky-space` and `rsky-space-host` Proposal-0016-shaped components; Blacksky's deployed community-only product still uses its own product architecture                                                                                                                                                   | Important independent implementation and privacy/moderation evidence                                                 |
| [Habitat](https://github.com/habitat-network/habitat)                                                                                                                | Active prototype                                                 | `pear`/organization-custody work; added permissioned blob storage/access on July 31                                                                                                                                                                                                                               | Strong custody, blob, and organization-managed identity comparison                                                   |
| [Northsky Stratos](https://github.com/NorthskySocial/stratos/pull/109)                                                                                               | Active prototype                                                 | Merged 77-commit spaces alignment with credentials, pull sync, recovery, replay store, revocation/cache events, client attestation, and boundaries; current admin/member controls remain active work                                                                                                              | Practical authorization, revocation, pagination, and operator lessons; not a conformance oracle                      |
| [plyr.fm private media](https://github.com/zzstoatzz/plyr.fm/blob/b47e4a82a073c819dae3d80a90b93c10a8356a4b/docs/internal/architecture/permissioned-private-media.md) | Deployed product with code-deployed, production-inert experiment | Owner-only personal-space code exists and staging exercises private blobs/records; production dogfooding and browser OAuth/client-attestation proof remain incomplete; no durable multi-writer replica                                                                                                            | Concrete personal-space and media/blob use case; limited interoperability evidence                                   |
| [Roomy](https://github.com/muni-town/roomy) and [Arbiter](https://github.com/zicklag/leaf-0.4/tree/a72a679ddfe1205c7a85d2f8de072a7396a947d1)                         | Deployed product plus active prototype                           | Roomy remains on custom AppView/private storage. Arbiter has executable Rust server/core, management/simulator UIs, Rego policy, draft XRPC Lexicons, persistence/auth handlers, and remote routing, but no stable release or Proposal 0016 conformance claim                                                     | Validates Layer 2 policy ports and product needs, not old Arbiter wire contracts                                     |
| [Blacksky community-only posts](https://opencollective.com/blacksky/updates/blacksky-only-posts-are-now-live)                                                        | Deployed off-protocol product                                    | Full private content through authenticated custom service/AppView with public-repo signaling                                                                                                                                                                                                                      | Demonstrates moderation, deletion, and custody requirements, not Proposal 0016 conformance                           |
| [OpenSocial](https://opensocial.community/)                                                                                                                          | Deployed off-0016 product                                        | Live community APIs/apps provide DIDs, membership policy, administration, and PDS-backed records; the [Proposal 0016 roadmap](https://github.com/collectivesocial/open-social/blob/93ce2e570df5c9fdad4b5256c8bd63fed5fabda9/docs/PERMISSIONED_DATA.md) says data remains publicly syncable until future migration | Identity/discovery and group-contract evidence plus a warning against API-only privacy                               |
| [Certified Group Service](https://docs.hypercerts.org/architecture/certified-group-service)                                                                          | Deployed off-0016 service                                        | Ordinary group PDS repos behind service-auth proxying, fixed RBAC, replay protection, encrypted operator-held credentials, authorship tracking, and audit logs                                                                                                                                                    | Strong shared-repo custody, operator-risk, role-ceiling, and service-auth prior art; not a spaces conformance target |
| [Colibri](https://github.com/colibri-social/colibri.social)                                                                                                          | Active prototype/public beta                                     | Community DID/repo and member-authored message direction; post-cutoff work was product/UI, not private substrate                                                                                                                                                                                                  | Potential chat/community Lexicon alignment, not a permissioned host target                                           |
| [Group and Community Standards WG](https://tangled.org/baldemo.to/community-standards-wg)                                                                            | Preliminary discussion/research                                  | Repository is documenting existing systems; no merged group, membership, governance, or community standard                                                                                                                                                                                                        | Watch and contribute evidence later; do not publish CSN assumptions as community contracts                           |
| Bluesky Communities                                                                                                                                                  | Product direction/discussion                                     | [Group chats shipped separately](https://bsky.app/profile/bsky.app/post/3mnzmprxpe22y); Bluesky staff describe community design/research and cross-app aspirations, but no public/invite/private protocol contract or Proposal 0016-backed product was announced                                                  | Important product signal, not an interoperable group standard                                                        |

### Unresolved contradictions and speculative directions

1. **HappyView authentication divergence:** Proposal 0016, PR #5187, and Diary
   7's referenced design use a signed context plus HMAC. HappyView
   `2.12.0-dev.2` omits `sig`. Because the HMAC key derives from published
   `ikm`, that HMAC-only shape does not independently authenticate the author.
   Retain it only as a negative differential fixture, never as an accepted CSN
   verifier profile.
2. **Scope contradiction:** The unchanged proposal describes collection-bound
   `read_self`; the latest branch makes it collection-independent and restricts
   it by repo ownership. This is draft churn, not a new stable rule.
3. **Recovery changed:** CSN's current pin and conformance note say PR #5187
   lacks `getRepo`; the latest branch now implements a two-root CAR response
   with incremental consumer verification. The provider still buffers all
   records before emission. This closes a reference-implementation functional
   gap, not CSN's stale pin, CAR-ordering risk, large-repo memory risk, or need
   to test recovery end to end.
4. **Private blobs remain unsettled:** Habitat and plyr.fm implement concrete
   product choices, while issue #98 shows no agreed cross-host retention/GC
   contract.
5. **Identity-minimizing access is speculative:** issue #97's claims/receipts
   model may be valuable for cooperatives and paid/member benefits, but has no
   maintainer acceptance or wire contract.
6. **Revocation remains application-heavy:** Stratos demonstrates immediate
   boundary-change/cache invalidation, while Proposal discussion still lacks a
   universal revocation fan-out/unregistration design.
7. **Custody has no winner:** per-user repos, organization data servers,
   community-owned accounts, custom AppViews, and service-held credentials all
   exist in prototypes or products.
8. **Service capability discovery is speculative:** `service.describe` could
   replace brittle method probing eventually, but CSN must not depend on it
   before a merged Lexicon and implementations exist.

### Effect on this audit

The refresh does **not** invalidate the codebase's critical security,
authorization, governance, financial, or deployment findings. It changes the
external context in four important ways:

1. The report must distinguish CSN's stale implementation pin from the current
   upstream draft head.
2. The latest `getRepo` work makes a new differential recovery test possible;
   it also adds ordering and provider-memory cases to that test. It does not
   make Proposal 0016 production-ready.
3. Independent implementations now provide more useful adversarial fixtures
   for credentials, replay, pagination, blobs, revocation, and custody.
4. The rate of draft change strengthens, rather than weakens, the recommendation
   to preserve ports, pin exact targets, and avoid publishing guessed community
   contracts.

## Current System Data Flow

### Public write and projection path

```text
Browser
  -> SvelteKit action/direct fetch
  -> Express route authorization
  -> domain service
  -> MemberWriteProxy or OperatorWriteProxy
  -> member/cooperative PDS
  -> relay/Tap
  -> processFirehoseEvent
  -> pre-storage hooks
  -> pds_record
  -> post-storage projectors
  -> domain projection tables
  -> in-process SSE/trigger events
```

Most domain services also insert an optimistic local projection immediately
after the PDS write. The firehose echo then upserts the same row again. The two
paths do not always use the same policy or derived values.

### Permissioned path

```text
Authority inventory/listRepos
  -> listRepoOps
  -> commit, HMAC, signature, LtHash, CID verification
  -> CAR/blob recovery when required
  -> group membership acceptance check
  -> typed governance projector
  -> replica checkpoint
```

This path has a materially stronger protocol-verification boundary, but record
schema validation, pagination, recovery, notifications, deletion, lifecycle,
and endpoint hardening are incomplete.

### Authority model in practice

The documented five-axis model is sound, but enforcement is fragmented:

- OAuth scope is largely delegated to the official ATProto OAuth client.
- HTTP routes use `requireAuth` and permission middleware.
- public projectors usually do not repeat group/application authorization.
- service/federation authentication verifies a signer but often does not bind
  that signer to DIDs asserted in the request body.
- database services frequently accept actor, cooperative, and object IDs as
  independent caller inputs instead of deriving and checking their relation.

## Critical Findings

### C-01: Public firehose governance bypasses application authority

**Areas:** Security, logical correctness, ATProto acceptance policy

The public proposal projector accepts the cooperative DID asserted by a
record. The vote projector accepts any repo author whose record references a
known proposal. Absent or inactive membership defaults to vote weight `1`.
There is no active-membership, eligibility, status, deadline, or cooperative
proposal-authority gate on this path.

**Impact:** An arbitrary public ATProto identity can create a proposal for
another cooperative or cast a counted vote. Sybil identities can satisfy
quorum or change outcomes.

**Evidence:**

- `apps/api/src/appview/indexers/proposal-indexer.ts:24-84`
- `apps/api/src/appview/indexers/proposal-indexer.ts:123-210`
- `apps/api/src/services/membership-read-model.ts:875-898`
- `apps/api/src/appview/hooks/builtin/lexicon-validator-hook.ts:6-42`

### C-02: Cooperative script sandbox permits process-level code execution

**Areas:** Security, authorization, deployment

Script routes check only that the caller's session cooperative matches the URL;
they do not require an administrative permission. The VM context injects
outer-realm `Promise`, allowing constructor-chain access to `process`. The
worker also exposes callbacks for DB reads, HTTP, email, event emission, and
cooperative PDS writes.

The production image currently fails to launch scripts because it references
`worker.ts` and requires the pruned `tsx` development dependency. That is a
packaging defect, not a security boundary. Fixing only the packaging activates
the RCE exposure.

**Impact:** Any active member can gain the API process's OS privileges and
secrets in source/development deployments or after the worker packaging bug is
fixed.

**Evidence:**

- `apps/api/src/routes/admin-scripts.ts:19-37`
- `apps/api/src/routes/admin-scripts.ts:117-238`
- `apps/api/src/scripting/worker.ts:80-198`
- `apps/api/src/scripting/script-service.ts:502-750`
- `apps/api/src/scripting/worker-pool.ts:133-150`

### C-03: Tier 2 data can be irreversibly published

**Areas:** Confidentiality, architecture, ATProto data placement

Placement is based primarily on cooperative governance visibility, not record
lifecycle or the collection's declared confidentiality. In `open` or `mixed`
cooperatives, a newly created proposal is written to a public repo while its
local state is still `draft`. Stakeholder terms and pledges also have public
write paths despite permissioned placement declarations.

**Impact:** Draft governance text and other private data can enter the public
firehose. Later deletion cannot retract relay, crawler, or archive copies.

**Evidence:**

- `ARCHITECTURE-V12.md:147-151`
- `apps/api/src/services/governance-record-placement-port.ts:33-68`
- `apps/api/src/services/proposal-service.ts:272-327`
- `apps/api/src/services/agreement-service.ts:689-719`
- `apps/api/src/services/funding-service.ts:287-317`
- `packages/lexicons/src/space-types.ts:64-78`

### C-04: Agreement federation permits signer impersonation

**Areas:** Security, legal integrity, federation

Federation middleware verifies an HTTP signer or accepts a local session, but
agreement endpoints do not consistently bind the verified identity to
`cooperativeDid` or `signerDid`. Signature URI and CID evidence are trusted
without resolving the signer's repository.

**Impact:** A resolvable federation signer or local authenticated user can
create, reject, cancel, retract, or submit evidence attributed to another
party. Legal signature state cannot be relied upon.

**Evidence:**

- `apps/api/src/middleware/federation-auth.ts:8-45`
- `apps/api/src/routes/federation.ts:338-584`

### C-05: AppView delivery is lossy and projections are not atomic

**Areas:** Distributed systems, data integrity

The Tap record callback catches errors and returns, allowing the Tap client to
acknowledge failed records. The pipeline swallows `pds_record` failures, runs
post-storage hooks anyway, dead-letters individual projector failures, and
returns success. Local mode continues after record errors; the next success can
advance its cursor past the failed event.

**Impact:** Raw records, materialized views, and cursors can permanently
diverge. Votes, signatures, and membership evidence can disappear without an
automatic recovery path.

**Evidence:**

- `apps/api/src/appview/loop.ts:120-155`
- `apps/api/src/appview/loop.ts:184-223`
- `apps/api/src/appview/hooks/pipeline.ts:103-163`
- `apps/api/src/appview/hooks/dead-letter.ts:6-11`

### C-06: Financial ledger and distribution operations are non-atomic

**Areas:** Financial correctness, concurrency

Capital contributions and redemptions insert ledger entries and then write
balances computed from stale reads without a transaction or row lock. Bulk
patronage distribution performs three statements per member without a CAS.
The patronage uniqueness constraint includes nullable `stakeholder_class`, so
common `NULL` allocations are not unique in PostgreSQL.

**Impact:** Concurrent contributions lose balances; concurrent redemptions can
overdraw; crashes or retries separate ledger from balance; patronage can be
calculated or distributed twice; tax forms can report duplicated amounts.

**Evidence:**

- `apps/api/src/services/capital-account-service.ts:64-183`
- `apps/api/src/services/capital-account-service.ts:214-258`
- `apps/api/src/services/patronage-service.ts:138-214`
- `packages/db/src/migrations/schema.sql:3168-3172`

## High-Severity Findings

### Security And Tenant Isolation

#### S-01: Coordinators can self-promote to `admin` or `owner`

`coordinator` has `member.roles.assign`; the endpoint accepts arbitrary roles
for any member, including the caller; `admin` and `owner` grant wildcard
permissions. Invitation role assignment has the same missing ceiling.

- `packages/common/src/permissions.ts:65-104`
- `packages/common/src/validation.ts:763-779`
- `apps/api/src/routes/org/memberships.ts:163-177`
- `packages/arbiter-client/src/group-mutation-port.ts:624-681`

#### S-02: Invite-only registration is not enforced

Setup stores `invite_only`, but unauthenticated registration without an invite
creates an active member with the `member` role.

- `apps/api/src/routes/setup.ts:92-103`
- `apps/api/src/routes/auth.ts:32-67`
- `apps/api/src/services/auth-service.ts:141-212`

#### S-03: Request logs contain session cookies and bearer credentials

`pino-http` uses default request serialization and no redaction. Cookie,
Authorization, MCP token, and federation signature headers can be logged.

- `apps/api/src/middleware/logger.ts:4-12`
- `apps/api/src/index.ts:193-198`
- `apps/api/src/auth/session.ts:19-24`

#### S-04: Broad object-level authorization failures

Confirmed examples include:

- agreement and template reads/mutations by globally addressed URI/ID;
- cross-cooperative post deletion by an admin of another cooperative;
- thread metadata and AI post-body access without thread membership;
- mention reads/state changes for another member;
- unscoped alignment outcome status changes;
- inter-coop agreement self-acceptance and unscoped updates;
- caller-selected cooperative attribution on project contributions; and
- a cooperative directly adding itself as an active member of a network.

Evidence:

- `apps/api/src/routes/agreement/agreements.ts:123-321`
- `apps/api/src/routes/agreement/templates.ts:105-165`
- `apps/api/src/services/post-service.ts:216-247`
- `apps/api/src/ai/tools/index.ts:265-289`
- `apps/api/src/routes/notifications/mentions.ts:40-87`
- `apps/api/src/services/alignment-service.ts:316-399`
- `apps/api/src/services/intercoop-agreement-service.ts:98-233`
- `apps/api/src/routes/commerce/projects.ts:117-142`
- `apps/api/src/services/network-service.ts:280-333`

#### S-05: Member-readable surfaces expose Tier 2 and personal data

Any active member can read broad sets of expenses and receipts, revenue,
capital balances and transactions, patronage allocations, tax forms, detailed
reports, onboarding notes, login emails, and all `private_record` content.

- `apps/api/src/routes/finance/expenses.ts:107-187`
- `apps/api/src/routes/finance/revenue.ts:48-114`
- `apps/api/src/routes/financial/capital-accounts.ts:93-140`
- `apps/api/src/routes/financial/patronage.ts:117-165`
- `apps/api/src/routes/financial/tax-forms.ts:52-75`
- `apps/api/src/routes/reports/index.ts:103-127`
- `apps/api/src/routes/onboarding/config.ts:139-172`
- `apps/api/src/routes/org/memberships.ts:48-83`
- `apps/api/src/routes/private/records.ts:49-83`

#### S-06: Payment webhook scope can be confused across cooperatives

Webhook verification uses the cooperative in the URL, then a global payment
session lookup updates whichever pledge matches. Session IDs are exposed by
pledge listing. A cooperative administrator controlling their own webhook
secret can forge completion of another cooperative's known session.

- `apps/api/src/routes/funding/payment-webhook.ts:17-64`
- `apps/api/src/services/funding-service.ts:382-435`
- `apps/api/src/routes/funding/campaigns.ts:182-240`
- `apps/api/src/routes/funding/payment-config.ts:67-97`

#### S-07: MCP scopes and current membership are ignored

Members can create arbitrary scope strings; token resolution checks hash and
expiry only; all tools are registered regardless of scope; generic record
queries are not uniformly tenant-scoped.

- `apps/api/src/routes/agents/tokens.ts:46-84`
- `apps/api/src/mcp/server.ts:24-62`
- `apps/api/src/mcp/server.ts:184-374`
- `apps/api/src/mcp/server.ts:450-490`

#### S-08: Multiple outbound fetch paths are SSRF-capable

Attacker-selected `did:web` is resolved before signature verification.
Hostname-string filtering for scripts/webhooks does not protect against DNS
rebinding, redirects, all private/link-local ranges, or IPv6. Permissioned
service endpoints have similar timeout, scheme, IP, and size gaps.

- `packages/federation/src/http/did-web-resolver.ts:29-59`
- `packages/federation/src/http/signing.ts:164-175`
- `apps/api/src/utils/url-validation.ts:7-29`
- `apps/api/src/scripting/script-service.ts:693-719`
- `packages/spaces-consumer/src/did-permissioned-sync-resolver.ts:96-118`
- `packages/spaces-consumer/src/xrpc-permissioned-repo-port.ts:1073-1103`

#### S-09: OAuth and space bearer credentials are plaintext at rest

OAuth state/token sets and space credentials are stored in JSON/text. Logout
destroys the web session only. OAuth exchange-token consumption is
select-then-delete rather than atomic.

- `apps/api/src/auth/oauth-stores.ts:15-99`
- `packages/spaces-consumer/src/credential-store.ts:86-122`
- `apps/api/src/routes/auth.ts:148-152`
- `apps/api/src/routes/auth.ts:391-418`

#### S-10: Blob access is not object-authorized

Any active member with a CID can fetch a blob; responses are publicly
cacheable. Avatar upload trusts client MIME type and does not re-encode images,
allowing same-origin active content risks.

- `apps/api/src/routes/blobs.ts:10-31`
- `apps/api/src/routes/org/cooperatives.ts:133-155`
- `apps/api/src/services/entity-service.ts:269-284`

### ATProto And Federation

#### A-01: Canonical Lexicons are invalid and generated artifacts disagree

Lexicon v1 does not define property type `number` or string format `cid-link`.
Runtime schemas, generated types, source JSON, and tests have different
inventories. The generator updates `lexicons.ts` but not generated types.

- `packages/lexicons/network/coopsource/governance/proposal.json:45-49`
- `packages/lexicons/network/coopsource/governance/vote.json:28-31`
- `packages/lexicons/network/coopsource/finance/expense.json:17-20`
- `packages/lexicons/tests/lexicons.test.ts:4-56`
- `packages/lexicons/src/generated/types.ts:380-421`
- `packages/lexicons/package.json:15-20`

#### A-02: Record producers do not satisfy their own Lexicons

Proposal, vote, agreement, signature, and stakeholder-term writers use
different field names, omit required fields, or provide values of the wrong
type. Examples include `cooperative` versus `cooperativeDid`, `proposal`
versus `proposalUri`, missing voter/signer fields, and a DID in an AT-URI field.

- `apps/api/src/services/proposal-service.ts:512-531`
- `apps/api/src/services/proposal-service.ts:1230-1269`
- `apps/api/src/services/agreement-service.ts:122-147`
- `apps/api/src/services/agreement-service.ts:553-588`
- `apps/api/src/services/agreement-service.ts:689-719`

#### A-03: Repo records are not maintained as canonical lifecycle state

Proposal open/close/resolve and many agreement updates/status changes/deletes
mutate PostgreSQL without updating or deleting the source repo record. Other
AppViews therefore observe stale state.

- `apps/api/src/services/proposal-service.ts:426-478`
- `apps/api/src/services/agreement-service.ts:312-470`
- `apps/api/src/services/agreement-service.ts:523-549`

#### A-04: DID document publication is not ATProto-compatible

The well-known route publishes `#signingKey` and `#coopsource` rather than the
canonical account signing key `#atproto` and PDS service `#atproto_pds`. It can
also serve the wrong DID kind/path from the root well-known URL. The dormant
commit verifier selects the first verification method and mishandles
path-based `did:web`.

- `apps/api/src/routes/well-known.ts:21-39`
- `apps/api/src/routes/well-known.ts:64-95`
- `apps/api/src/appview/commit-verifier.ts:63-103`

#### A-05: Service auth rejects valid key types and allows overlong tokens

The verifiers require `ES256`, excluding valid `ES256K` identities, and do not
require `iat` or cap token lifetime.

- `packages/federation/src/atproto/service-auth-verifier.ts:44-99`
- `packages/federation/src/atproto/inlay-auth-verifier.ts:41-91`

#### A-06: OAuth scopes do not express repo write permissions

The client requests broad `atproto` and namespace-like `rpc:` scopes. `rpc:`
authorizes XRPC methods, not records written through `com.atproto.repo`.

- `apps/api/src/auth/oauth-client.ts:15-83`

#### A-07: RFC 9421 verification does not require request coverage

The signer controls the covered components. Method, target URI, content type,
and body digest are not mandatory; body verification uses reserialized JSON
rather than exact raw bytes; replay protection is limited.

- `packages/federation/src/http/signing.ts:127-249`
- `apps/api/src/middleware/federation-auth.ts:23-45`

#### A-08: Direct `subscribeRepos` mode does not decode records

The synchronous decoder produces undefined records for create/update, while an
async CAR-aware decoder exists. Error frames, `tooBig`, continuity, and updated
reconnect cursors are incomplete.

- `packages/federation/src/atproto/atproto-pds-service.ts:295-320`
- `packages/federation/src/atproto/atproto-pds-service.ts:493-517`
- `packages/federation/src/atproto/firehose-decoder.ts:62-173`

#### A-09: Consent evidence is fetched from the configured PDS, not the

author's PDS

The resolver does not discover the AT URI authority DID's `#atproto_pds`.
Valid evidence hosted elsewhere fails.

- `apps/api/src/services/consent-evidence-verifier.ts:17-27`
- `packages/federation/src/atproto/atproto-pds-service.ts:256-269`

#### A-10: XRPC procedure validation is incomplete

Queries validate inputs but production output validation logs and returns
invalid data. Procedures do not uniformly validate input/output. Several
callable methods have no checked-in callable Lexicon.

- `apps/api/src/xrpc/dispatcher.ts:177-224`
- `apps/api/src/xrpc/dispatcher.ts:242-317`
- `apps/api/src/xrpc/index.ts:80-123`

#### A-11: PLC update construction cannot perform a valid rotation

The client treats a resolved DID document like the latest PLC operation,
defaults `prev` incorrectly, and can send unsigned updates. Real-PDS update
only handles a handle and silently ignores requested service bindings.

- `packages/federation/src/local/plc-client.ts:167-226`
- `packages/federation/src/local/local-pds-service.ts:111-130`
- `packages/federation/src/atproto/atproto-pds-service.ts:181-194`

#### A-12: The default permissioned writer is a compatibility cache, not a

permissioned repo

It stores records in `private_record`, omits full space identity from the
physical key, emits fake CID `private`, and does not use a TID-compatible key.
Two spaces can collide.

- `apps/api/src/container.ts:469-475`
- `apps/api/src/services/private-record-permissioned-write-port.ts:16-108`
- `packages/db/src/migrations/schema.sql:1473-1480`

#### A-13: Permissioned records lack canonical Lexicon validation

Protocol cryptography is strong, but the typed projector applies partial
hand-written checks and accepts legacy aliases instead of validating the
collection's canonical Lexicon.

- `apps/api/src/appview/permissioned-governance-projector.ts:15-129`
- `apps/api/src/appview/spaces-consumer-dispatch.ts:66-92`

#### A-14: CSN's stale Proposal 0016 pin can produce unrecoverable gaps

CSN is pinned to PR #5187 at `3f6c96d5`. At that target, advancing by max
revision can skip later operations when one revision is split across pages.
Hash divergence is detected, but that pinned target does not implement
`getRepo` recovery. The live upstream draft head `b76a4cf1` now implements
CAR-producing recovery and changed related sync/URI/security code, but CSN has
not repinned or conformance-tested it. The current provider also buffers all
records before emitting the response and conflicts with its own Lexicon on CAR
record ordering. The code defect therefore remains while the prior claim that
the latest upstream head has no recovery endpoint is obsolete.

- `packages/spaces-consumer/src/xrpc-permissioned-repo-port.ts:567-652`
- `packages/spaces-consumer/src/xrpc-permissioned-repo-port.ts:983-1004`
- `packages/spaces-consumer/src/permissioned-conformance.ts:150-157`

#### A-15: Permissioned notifications, deletion, and account lifecycle remain

incomplete

No production notification source or inbound deletion route is wired. Tap
lifecycle events omit source host information needed by durable permissioned
account state.

- `apps/api/src/index.ts:395-417`
- `apps/api/src/index.ts:438-463`
- `packages/spaces-consumer/src/xrpc-permissioned-repo-port.ts:99-113`
- `packages/spaces-consumer/src/xrpc-permissioned-repo-port.ts:720-750`

### Governance And Domain Logic

#### L-01: Delegated voting double counts represented members

A delegator can vote directly while their base weight remains included in a
delegate's previously or subsequently cast vote. Revocation does not recompute
existing weights, and departed delegators can still contribute fallback
weight.

- `packages/coop-view/src/delegated-vote-weight-reader.ts:20-57`
- `apps/api/src/services/proposal-service.ts:481-589`

#### L-02: Firehose replay clobbers vote weight and resurrects retractions

The HTTP cast path stores delegation-aware weight. The firehose indexer
recomputes base class weight and overwrites it. Every upsert also clears
`retracted_at`. Public retraction does not delete the PDS record, so replay can
make the ballot active again.

- `apps/api/src/appview/indexers/proposal-indexer.ts:157-210`
- `apps/api/src/services/proposal-service.ts:947-971`

#### L-03: Supermajority and quorum semantics are incorrect

`superMajority` changes turnout quorum, but binary passage remains `yes > no`.
The stored `quorum_basis` is not applied. Arbitrary nonempty choices and
weight-zero ballots can count toward quorum without entering the yes/no tally.

- `packages/governance-view/src/quorum.ts:8-55`
- `packages/governance-view/src/tally.ts:22-40`
- `packages/common/src/validation.ts:416-419`

#### L-04: Proposal transitions race and deadlines are not enforced at cast

Lifecycle methods read status and then update by ID without expected-status
CAS. Concurrent sweepers can duplicate or revert transitions. `castVote`
checks status but not `closes_at`; closing overwrites the configured deadline.

- `apps/api/src/services/proposal-service.ts:426-479`
- `apps/api/src/services/proposal-service.ts:481-502`
- `apps/api/src/services/proposal-service.ts:634-793`
- `apps/api/src/index.ts:478-483`

#### L-05: Out-of-order public records are dropped

A vote arriving before its proposal returns `false`, and a signature arriving
before its agreement returns without a durable retry. Public hooks ignore that
ordering result. Cross-repo ordering makes this a normal condition.

- `apps/api/src/appview/indexers/proposal-indexer.ts:87-91`
- `apps/api/src/appview/hooks/builtin/index.ts:37-45`
- `apps/api/src/appview/indexers/agreement-indexer.ts:38-61`

#### L-06: Agreement signatures do not bind a canonical content version

Signature records use an empty agreement CID, signer/stakeholder checks are
incomplete, federated ingestion fabricates processing-time `signed_at`, and
retraction does not delete the source record.

- `apps/api/src/services/agreement-service.ts:553-685`
- `apps/api/src/appview/indexers/agreement-indexer.ts:38-88`

#### L-07: Membership changes retroactively alter governance denominators

Quorum and class maps use active membership at resolution time rather than a
snapshot at proposal open/close. Joining or leaving after voting can change
the result; departed ballots remain while class membership disappears.

- `apps/api/src/services/proposal-service.ts:658-712`
- `apps/api/src/services/membership-read-model.ts:448-485`

#### L-08: Fiscal periods are not a reliable accounting boundary

Periods can overlap or have reversed dates. Revenue and expenses are not tied
to periods; closing a period does not freeze underlying books; patronage
surplus is caller-supplied rather than reconciled to P&L.

- `apps/api/src/services/fiscal-period-service.ts:16-41`
- `apps/api/src/services/fiscal-period-service.ts:122-149`
- `apps/api/src/services/revenue-service.ts:58-99`

#### L-09: Payment completion is not idempotent

Webhook redelivery performs read-check-update-increment without a transaction,
row lock, status CAS, or provider event-id deduplication.

- `apps/api/src/services/funding-service.ts:382-425`
- `apps/api/src/routes/funding/payment-webhook.ts:16-90`

#### L-10: Money allocation uses floating point and drops/recreates cents

Per-member rounding has no remainder allocation; common thirds lose a cent and
some ratios over-allocate. Downstream code converts numeric money values to
JavaScript `Number`.

- `packages/coop-view/src/patronage-allocator-plugin.ts:84-99`
- `packages/coop-view/src/patronage-allocator-plugin.ts:278-280`

#### L-11: Materialized counters and domain events are not replay-idempotent

Declarative RSVP counters use blind increments/decrements. Agreement events are
emitted from both service and echo projector. Trigger actions have no durable
deduplication and can recursively emit notification events.

- `apps/api/src/appview/hooks/declarative/handler.ts:239-252`
- `apps/api/src/services/agreement-service.ts:627-631`
- `apps/api/src/appview/indexers/agreement-indexer.ts:80-87`
- `apps/api/src/ai/triggers/action-executor.ts:151-208`

#### L-12: Permissioned projection can be permanently wedged

A malformed record or a vote whose proposal has not projected throws. The
consumer refuses the whole batch checkpoint and has no per-record quarantine,
so one permanent invalid record blocks the space.

- `packages/spaces-consumer/src/consumer.ts:130-174`
- `apps/api/src/appview/permissioned-governance-projector.ts:44-129`

### Architecture, Deployment, And Operations

#### O-01: Production workspace images are incomplete

The API Dockerfile omits `governance-view` and `coop-view` manifests, sources,
build output, and runtime copies despite API dependencies on them. The web
image similarly builds only web while depending on a workspace package whose
`dist` is not guaranteed.

- `apps/api/package.json:30-37`
- `apps/api/Dockerfile:6-57`
- `apps/web/Dockerfile:6-27`
- `.dockerignore:4-7`

#### O-02: Compiled fresh migration omits `schema.sql`

The migration reads an adjacent SQL asset, but TypeScript does not copy it and
the image copies only `packages/db/dist`.

- `packages/db/src/migrations/0001_v11_baseline.ts:21-26`
- `packages/db/tsconfig.json:3-7`
- `apps/api/Dockerfile:50-51`

#### O-03: The permanent baseline cannot upgrade persistent deployments

Editing an already-applied migration cannot update an existing database, while
deployment docs describe persistent update-and-migrate operation.

- `packages/db/src/migrations/0001_v11_baseline.ts:8-19`
- `ARCHITECTURE-V12.md:189-191`
- `README.md:197-202`

#### O-04: Caddy sends `/xrpc/*` to the web service

Only `/api`, `/health`, and `/.well-known` are proxied to the API. XRPC methods
and the label WebSocket are unreachable through the documented public domain.

- `infrastructure/Caddyfile:12-26`
- `apps/api/src/xrpc/dispatcher.ts:49-90`
- `apps/api/src/routes/xrpc-labels.ts:19-39`

#### O-05: Production Compose omits supported API configuration

Many documented identity, operator, role, connector, service-auth, and spaces
variables are parsed by the app but not passed to the API container.

- `infrastructure/docker-compose.prod.yml:59-79`
- `apps/api/src/config.ts:29-81`

#### O-06: `INSTANCE_ROLE` does not control runtime components

`standalone`, `hub`, and `coop` are parsed and documented, but startup runs the
same consumers and jobs in each process.

- `apps/api/src/config.ts:59-61`
- `README.md:74-80`
- `apps/api/src/index.ts:434-500`

#### O-07: Horizontal scaling duplicates work and loses state

SSE/event distribution is process-local; timers run in every replica; OAuth
connector state and rate limiting are process-local; consumers lack a leader
or sharding contract.

- `apps/api/src/appview/sse.ts:32-37`
- `apps/api/src/index.ts:478-500`
- `apps/api/src/services/connection-service.ts:33-91`

#### O-08: Health is not readiness

`/health` returns success when the DB responds even if Tap, PDS, spaces sync,
schema, or background jobs are unavailable. Compose uses it for health.

- `apps/api/src/routes/health.ts:15-40`
- `apps/api/src/index.ts:421-432`
- `infrastructure/docker-compose.prod.yml:81-86`

#### O-09: There is no CI/CD and verification commands drift

No CI configuration exists. Lint/typecheck omit major packages. Documented
test commands differ from actual Docker/PDS/Playwright behavior, and generated
Lexicon drift is intentionally accepted by tests.

- `package.json:10-25`
- `turbo.json:3-33`
- `Makefile:52-98`
- `apps/web/playwright.config.ts:19-40`
- `packages/federation/tests/global-setup.ts:34-87`

#### O-10: Local tests do not exercise the production protocol path

API and E2E tests predominantly use `LocalPdsService`, proxy fallback, direct
database seeding, and no relay/Tap/OAuth. Cross-instance tests manually copy
projection data.

- `apps/api/tests/helpers/test-app.ts:187-220`
- `apps/web/playwright.config.ts:27-40`
- `apps/api/tests/federation-e2e/cross-instance.test.ts:136-221`

#### O-11: Background jobs and realtime replay are unbounded

Matchmaking and proposal expiry load broad sets without leases or overlap
guards. Spaces lifecycle fanout uses unbounded `Promise.all`. Vote/label replay
and SSE do not uniformly bound rows, clients, or backpressure.

- `apps/api/src/services/matchmaking-service.ts:227-248`
- `apps/api/src/services/proposal-service.ts:760-792`
- `packages/spaces-consumer/src/consumer.ts:81-113`
- `apps/api/src/services/label-subscription.ts:54-81`
- `apps/api/src/routes/events.ts:9-35`

#### O-12: Dead letters and webhook outboxes are inert

Dead letters can be listed or dismissed but not retried. Outbound webhook code
creates delivery logs, has no producer call sites, and has no delivery worker.

- `apps/api/src/appview/hooks/dead-letter.ts:6-11`
- `apps/api/src/routes/admin.ts:333-360`
- `apps/api/src/services/event-bus-service.ts:146-185`

#### O-13: Inbound connector webhooks are not authenticated

The route forwards headers and body but does not call the implemented HMAC
verifier. Connector config and webhook secrets are plaintext and config can be
returned to ordinary members.

- `apps/api/src/routes/connectors/webhooks.ts:139-167`
- `apps/api/src/services/webhook-service.ts:78-122`
- `apps/api/src/routes/connectors/index.ts:19-99`

#### O-14: Observability and recovery are insufficient

There are no application metrics, tracing, queue lag metrics, DB-pool metrics,
or alert definitions. Backup docs reference a missing Make target and do not
provide a complete tested restore for DB, blobs, PDS, and Tap state.

- `apps/api/src/middleware/logger.ts:1-12`
- `apps/api/src/appview/loop.ts:23-44`
- `docs/operations.md:5-39`
- `Makefile:146-165`

### Web Application

#### W-01: Legacy redirects are swallowed

Twenty-seven legacy route loaders call SvelteKit `redirect()` inside a bare
`try/catch`; because redirect throws, the intended workspace redirect is caught
and users fall through to `/me`.

Representative evidence:

- `apps/web/src/routes/(authed)/proposals/[id]/+page.server.ts:8-12`
- `apps/web/src/routes/+layout.server.ts:18` shows the correct `isRedirect`
  pattern

#### W-02: User-controlled website URLs permit unsafe schemes

Cooperative/network websites are rendered directly into `href`. Shared
validation uses generic `.url()`, which permits non-HTTP schemes such as
`javascript:` and `data:`.

- `apps/web/src/routes/(public)/explore/[handle]/+page.svelte:113`
- `apps/web/src/routes/(authed)/coop/[handle]/settings/+page.svelte:195`
- `packages/common/src/validation.ts:751`

#### W-03: Cooperative workspace does not enforce handle membership/context

The network layout checks membership. The cooperative layout swallows member
lookup failure, while pages call session-scoped API endpoints without passing
the route handle. A user can see cooperative B branding with cooperative A
data or confusing failures.

- `apps/web/src/routes/(authed)/net/[handle]/+layout.server.ts:33-35`
- `apps/web/src/routes/(authed)/coop/[handle]/+layout.server.ts:16-47`

#### W-04: No Content-Security-Policy is configured

There is no SvelteKit CSP, Caddy CSP, or hook-level CSP. The inline theme script
will require a nonce/hash.

- `apps/web/svelte.config.js:5-13`
- `infrastructure/Caddyfile:4-10`
- `apps/web/src/app.html:8-14`

#### W-05: Error and submission behavior is inconsistent

Expired sessions and permission failures frequently become generic 500s;
several destructive/create forms lack double-submit prevention; client-direct
mutations swallow errors and do not invalidate loader data.

Representative evidence:

- `apps/web/src/routes/(authed)/coop/[handle]/admin/+page.server.ts:13-20`
- `apps/web/src/routes/(authed)/coop/[handle]/governance/[id]/+page.svelte:118-212`
- `apps/web/src/lib/components/agents/TriggerPanel.svelte:132-147`

## Medium And Lower-Priority Register

These do not justify delaying the P0 containment work, but should be scheduled
before production:

| ID   | Finding                                                                                                                                          | Primary evidence                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| M-01 | `requireAuth` selects an arbitrary cooperative for multi-coop users because the active membership query has no order or explicit tenant context. | `apps/api/src/services/membership-read-model.ts:180-186`      |
| M-02 | Infrastructure failure in auth is returned as 401, conflating outage with invalid session.                                                       | `apps/api/src/auth/middleware.ts:131-135`                     |
| M-03 | Session IDs are not regenerated after login/setup/OAuth exchange; OAuth exchange redemption races.                                               | `apps/api/src/routes/auth.ts:53-65,391-419`                   |
| M-04 | Member class rename orphans name-based assignments and silently resets vote weights.                                                             | `apps/api/src/services/member-class-service.ts:66-131`        |
| M-05 | Proposal denominator uses projections while authorization uses authority data, producing policy-source mismatch.                                 | `apps/api/src/services/proposal-service.ts:666-712`           |
| M-06 | Proposal delete permits resolved decisions to be withdrawn/invalidated.                                                                          | `apps/api/src/services/proposal-service.ts:396-424`           |
| M-07 | Identity/account events do not update public entity handle/status; deactivated actors remain locally active.                                     | `apps/api/src/index.ts:438-463`                               |
| M-08 | Consent indexer accepts an unverified evidence pointer despite a verifier service existing.                                                      | `apps/api/src/appview/indexers/membership-indexer.ts:43-51`   |
| M-09 | Federated authors without local `entity` rows can fail foreign keys and remain dead-lettered.                                                    | `packages/db/src/migrations/schema.sql:4460-4636`             |
| M-10 | Setup completion and some OAuth state are process-local or use check-then-act patterns.                                                          | `apps/api/src/auth/middleware.ts:48-69`                       |
| M-11 | Runtime declarative Lexicons allow admin-selected target table/column identities without an allowlist.                                           | `apps/api/src/services/lexicon-management-service.ts:239-256` |
| M-12 | Local PDS uses pseudo-CIDs and incomplete pagination, reducing test fidelity.                                                                    | `packages/federation/src/local/cid-utils.ts:3-32`             |
| M-13 | Space keys containing `/` depend on percent-encoded semantics inconsistent with the pinned record-key model.                                     | `packages/arbiter-client/src/space-ref.ts:93-119`             |
| M-14 | `did_rotation_history` has no verified production evidence writer and should not be confused with PLC key rotation.                              | `packages/spaces-consumer/src/did-equivalence-port.ts:19-65`  |
| M-15 | Agreement, proposal, vote, and list endpoints contain N+1 or unbounded list patterns.                                                            | `apps/api/src/routes/agreement/agreements.ts:21-52`           |
| M-16 | Common cursor encoding loses PostgreSQL sub-millisecond precision.                                                                               | `apps/api/src/lib/pagination.ts:19-23`                        |
| M-17 | Label WebSocket has replay/listener race and no proper backpressure; SSE has no client cap.                                                      | `apps/api/src/services/label-subscription.ts:44-91`           |
| M-18 | Process EventEmitter exceeds default listener expectations and provides no durable delivery semantics.                                           | `apps/api/src/appview/sse.ts:32-37`                           |
| M-19 | Notification preferences are stored but not applied by trigger notification delivery.                                                            | `apps/api/src/ai/triggers/action-executor.ts:178-208`         |
| M-20 | Web cookie forwarding parses one combined `Set-Cookie` header naively.                                                                           | `apps/web/src/lib/server/cookies.ts:11-49`                    |
| M-21 | SSR hooks perform API calls without timeouts on every request; root layout adds another global API call.                                         | `apps/web/src/hooks.server.ts:8-29`                           |
| M-22 | Login OAuth URL is relative while other API calls use configured API base, breaking bare dev topology.                                           | `apps/web/src/routes/login/+page.svelte:16`                   |
| M-23 | Redis is a required healthy dependency but has no runtime client or current purpose.                                                             | `apps/api/src/config.ts:16-18`                                |
| M-24 | Shutdown lacks stop handles for all AppView loops and active workers.                                                                            | `apps/api/src/index.ts:511-532`                               |
| M-25 | Production/development dependencies use mutable images or source branches; Node type versions drift.                                             | `infrastructure/docker-compose.prod.yml:98-100`               |
| M-26 | Active documentation contains broken links, stale test counts, nonexistent commands, and retired topology descriptions.                          | `README.md:129-136,224-230`                                   |

## Architecture Assessment

### What should remain

The following architectural commitments are directionally correct and should
not be discarded during remediation:

1. DIDs, not handles, as security identity.
2. Cooperative DID distinct from founder/member DIDs.
3. Public, permissioned, and E2EE data as genuinely different storage tiers.
4. Protocol verification separated from application acceptance policy.
5. Group authority behind ports while cooperative policy remains above the
   protocol/host layer.
6. GovernanceView accepting a cooperative plugin set rather than importing
   cooperative services.
7. ATProto repos as canonical public record sources and PostgreSQL as a
   projection/read model.
8. Proposal 0016 details pinned and kept behind helper/port boundaries.

### What should change

1. **One command path per invariant.** HTTP, firehose, permissioned sync,
   admin reindex, and background jobs must all call the same application
   acceptance and transition policy.
2. **One canonical record contract.** Lexicon JSON, generated types, writers,
   validators, indexers, and tests must be generated or checked from one
   manifest.
3. **Explicit command versus projection services.** Command services write
   canonical records with CAS. Projectors consume immutable accepted changes
   and never invent authority or business transitions.
4. **Durable inbox/outbox boundaries.** AppView intake, domain events,
   webhooks, notifications, and side effects need idempotency keys and retry
   state.
5. **Tenant context must be explicit.** Do not infer one arbitrary cooperative
   into `req.actor`; resolve the cooperative from the URL/resource and verify
   actor membership for that cooperative.
6. **Do not use Node VM as a security boundary.** Either remove scripting or
   isolate it outside the API trust domain.
7. **Separate disposable PoC bootstrap from persistent deployment.** The
   current baseline migration policy and persistent update docs cannot both be
   true.

### Package and service structure

The current hand-wired container and flat service directory are difficult to
reason about (`container.ts` wires roughly 70 services; several services exceed
800-1,400 lines). A wholesale framework rewrite is not recommended. Refactor
along domain boundaries only as correctness work touches them:

```text
apps/api/src/domains/
  identity-membership/
  governance/
  agreements/
  finance/
  collaboration/
  integrations/

apps/api/src/platform/
  auth/
  atproto/
  appview/
  jobs/
  events/
  outbound-http/
```

Each domain should expose command handlers, query handlers, acceptance policy,
and projectors. Avoid compatibility wrappers; this is a PoC and canonical
types should be updated in place.

## Positive Findings

1. The Proposal 0016 cryptographic core is substantially aligned with the
   pinned implementation: signed context, HMAC, LtHash, record CID checks,
   author signature checks, CAR recovery, and blob verification are present.
2. Permissioned record acceptance cross-checks strict space membership and
   fails closed on indeterminate membership.
3. Unsafe unverified permissioned ingestion is prohibited in production and
   the consumer remains disabled by default.
4. OAuth/DPoP token operations are delegated to the official OAuth library,
   and production member writes fail closed without a member OAuth session.
5. Kysely parameterization is used consistently; no confirmed SQL injection
   was found.
6. Password hashing, random token generation, hashed API tokens, and the
   existing AES-256-GCM primitive are sound in the reviewed uses.
7. Helmet, CORS allowlisting, JSON limits, authentication rate limiting,
   secure/HttpOnly/SameSite production cookies, and non-root application
   images provide a useful baseline.
8. Svelte escaping is used consistently; no `{@html}`, `innerHTML`, `eval`, or
   `new Function` sink was found in the web source.
9. Core database uniqueness constraints exist for one active membership, vote,
   and signature, although replay semantics around them need repair.
10. Delegation mutation detects cycles and uses a cooperative advisory lock.
11. The codebase has broad tests across API, web, federation, spaces,
    GovernanceView, and CoopView. The problem is production-path coverage and
    gate accuracy, not absence of testing effort.
12. The active architecture document correctly identifies many Proposal 0016
    unknowns rather than claiming the draft is stable.

## ATProto Ecosystem Direction

The V12 direction remains broadly aligned with current community work if the
implementation gaps above are corrected:

1. Treat Proposal 0016 and its implementation PR as executable drafts, not a
   stable protocol dependency. Continue to pin exact targets and keep wire
   details behind ports/helpers.
2. Preserve the model of many typed spaces under one community/cooperative DID.
   Role spaces are application/group-policy structure, not a protocol-level
   membership claim.
3. Use shipped granular OAuth `repo:`, `rpc:`, `blob:`, `account:`, and
   `identity:` permissions or published permission sets. Do not use an `rpc:`
   namespace as a substitute for repo collection authority.
4. Keep protocol verification separate from cooperative acceptance. A valid
   commit proves authorship and integrity, not membership, eligibility, legal
   authority, or permission to affect a CSN projection.
5. Use official ATProto identity, OAuth, service-auth, repository, CAR, CID,
   and Lexicon packages where their contracts fit. Custom security protocol
   implementations should be minimized.
6. Follow the V12 commitment to retire custom RFC 9421 federation routes in
   favor of ATProto service-authenticated XRPC. Do not spend a major refactor on
   the current parser; contain it until replacement.
7. Continue using the current PR #5187 head, Rust atproto-crates, Blacksky
   `rsky`, Stratos, Habitat, CGS, and product-specific implementations as
   differentiated evidence. HappyView's unsigned-commit shape is a negative
   authentication fixture unless its trust model changes. Pin only the
   executable surfaces under test; none is a protocol or application-policy
   oracle.
8. Keep `community.lexicon.governance.*` drafts outside the canonical runtime
   schema set until namespace sponsorship and community review exist. CSN
   extensions should wrap community contracts rather than modify them.
9. Do not run a private relay as an access-control mechanism. Public relay data
   is public; permission belongs at the repo/space and application acceptance
   layers.
10. Do not activate permissioned background sync with `read_self`-like access;
    full-space reconciliation requires the authority and scope that can
    enumerate the whole writer set.
11. Keep custody, blob retention, revocation, and re-homing as explicit
    application/operating-policy decisions. Current projects implement
    materially different models and Proposal 0016 does not settle them.
12. Track claims/receipt-based access and service self-description as
    speculative extension work. Keep ports capable of future adaptation, but
    do not add guessed fields or dependencies before an accepted contract.

## Proposed Remediation Plan

No phase below should begin until this plan, including its product decisions,
is approved. Each phase should use a separate branch and merge only after its
exit criteria pass.

### Gate 0: Immediate Containment

**Goal:** Prevent known critical paths from becoming reachable while fixes are
designed.

1. Disable cooperative script CRUD/test/enable and runtime execution.
2. Keep `SPACES_CONSUMER_ENABLED=false` in all non-conformance environments.
3. Do not connect Tap to untrusted public records until application acceptance
   gates exist.
4. Prevent draft/Tier 2 collections from using public-repo placement.
5. Redact secrets from request logging and rotate credentials from retained
   logs.
6. Mark deployment documentation as non-production and block real finance,
   legal signatures, and confidential records.

**Exit criteria:** Critical paths are unreachable by configuration and route
tests prove the containment.

### Phase 1: Authority And Tenant Invariants

**Goal:** Establish one reusable authorization model before repairing domain
behavior.

1. Replace implicit `req.actor.cooperativeDid` with explicit tenant resolution:
   `(actorDid, cooperativeDid, resource)`.
2. Add service-layer authorized loaders for agreements, proposals, campaigns,
   projects, posts/threads, finance, private records, connectors, blobs, and
   network membership.
3. Enforce role assignment ceilings, no self-promotion, and last-owner safety.
4. Enforce cooperative admission policy during registration.
5. Bind federation signer identity to every asserted body DID and resolve
   evidence from the signer's PDS.
6. Define MCP scope constants and revalidate active membership/permissions per
   request.
7. Add read permissions for personal finance, onboarding, legal, and Tier 2
   data; return aggregates separately from member details.
8. Scope payment webhooks by cooperative, provider, event ID, pledge, campaign,
   and signed provider metadata.

**Required tests:** Table-driven route/service authorization matrix covering
owner, admin, coordinator, member, observer, suspended, removed, non-member,
wrong cooperative, and federated signer mismatch.

**Exit criteria:** No sensitive service accepts unrelated actor/cooperative/
object identifiers without proving their relationship.

### Phase 2: Canonical ATProto Contract

**Goal:** Make every record and endpoint conform to one canonical model.

1. Decide the canonical V12 proposal, vote, agreement, signature, finance, and
   stakeholder record shapes.
2. Correct invalid Lexicon primitives and field constraints in place.
3. Generate runtime schemas, type IDs, TypeScript types, and exports from one
   manifest; fail CI on drift.
4. Refactor every producer, validator, indexer, fixture, and test together.
5. Validate immediately before every public or permissioned write and before
   typed projection.
6. Add CAS (`swapRecord`/`swapCommit`) and paginated result contracts to the
   canonical PDS interface.
7. Publish correct ATProto DID documents; implement path-correct DID resolution
   and bidirectional handle verification.
8. Repair service auth, OAuth repo scopes, and XRPC input/output validation;
   replace custom RFC 9421 agreement federation with service-authenticated
   XRPC. Apply only minimal request-coverage containment to RFC 9421 while it
   remains reachable.
9. Resolve AT URIs through each authority DID's actual PDS.

**Exit criteria:** The same fixtures pass source Lexicon validation, generated
type checks, real PDS writes/reads, public projection, and permissioned
projection.

### Phase 3: Durable AppView And Side-Effect Model

**Goal:** Guarantee replay-safe, ordered, recoverable projection.

1. Introduce a durable inbox keyed by source, repo/DID, sequence/revision,
   operation, and record URI/CID.
2. Separate protocol verification, application acceptance, raw storage, typed
   projection, and side-effect outbox states.
3. Commit accepted raw event, all required projections, and checkpoint in one
   transaction where the source permits it.
4. Do not acknowledge/advance on retryable failure. Quarantine permanent
   schema/policy rejection with explicit reason and operator workflow.
5. Add dependency retry for out-of-order cross-repo records.
6. Make all projectors idempotent by state derivation or applied-event keys;
   remove blind counters.
7. Add durable event/webhook/notification outboxes with idempotency, leasing,
   retry, dead-letter, and replay.
8. Apply identity/account/tombstone state to every public projection.
9. Make local, Tap, direct subscribe, backfill, and reindex semantics match.

**Exit criteria:** Crash/retry/reorder tests demonstrate no event loss,
duplicate side effect, counter drift, stale resurrection, or checkpoint ahead
of projection.

### Phase 4: Governance Correctness

**Goal:** Make proposal outcomes deterministic and explainable.

1. Apply one acceptance policy to HTTP writes, public records, permissioned
   records, and reindex.
2. Choose delegation semantics:
   - recommended: compute represented voting power at close from an immutable
     proposal membership/delegation snapshot and ensure each member contributes
     once; or
   - simpler alternative: prohibit a delegator's direct vote while delegation
     is active and define revocation effects explicitly.
3. Snapshot eligible voters, classes, weights, and policy at the defined
   governance boundary.
4. Implement separate turnout quorum and approval threshold; define
   supermajority, abstention, invalid choice, zero voters, and delegation-based
   participation.
5. CAS every lifecycle transition and enforce deadline at cast time.
6. Preserve configured deadlines; store actual close/resolve times separately.
7. Delete/retract canonical public vote records or model retraction as an
   explicit canonical event that all AppViews honor.
8. Prevent deletion or mutation of resolved decisions except through an
   explicit superseding action.

**Exit criteria:** Property/table tests cover concurrency, replay, members
joining/leaving, suspension, delegation cycles/revocation/direct voting,
single-member and zero-member cooperatives, ties, supermajority, and late
ballots.

### Phase 5: Financial And Legal Integrity

**Goal:** Establish auditable accounting and signature invariants.

1. Use integer minor units or a decimal money type; define one rounding and
   largest-remainder policy.
2. Make ledger append and balance update one transaction using SQL arithmetic
   or row locks; add reconciliation invariants.
3. Make patronage calculation/distribution CAS-based and idempotent; correct
   nullable uniqueness.
4. Link revenue/expense entries to non-overlapping fiscal periods and enforce
   period close/freeze rules.
5. Derive surplus from approved books or require an explicit reconciled
   adjustment workflow.
6. Deduplicate provider event IDs and atomically transition payment state and
   campaign totals.
7. Bind agreement signatures to immutable content CID/version, declared party,
   signer DID, and timestamp evidence.
8. Make agreement transitions CAS-based and canonical-repo backed.
9. Add maker-checker policy for expense approval/reimbursement and other
   sensitive financial actions.

**Exit criteria:** Concurrent and crash-injection tests preserve ledger =
balance, allocation sum = approved distributable amount, one provider event =
one transition, and one signer/version = one active signature.

### Phase 6: Proposal 0016 Activation Gate

**Goal:** Keep the experimental substrate conformant without making application
correctness depend on unstable wire details.

1. Replace the ambiguous "Proposal 0016" profile with separately named exact
   pins for the published proposal, current PR #5187 head, HappyView, and each
   independent fixture source. Never silently combine their wire behavior.
2. Repin the official executable-draft profile only after reviewing all nine
   commits since `3f6c96d5`, including URI/SpaceRef, `read_self`, credential,
   client-attestation, and CAR changes.
3. Require a target that cannot split a revision invisibly or supports a
   `(revision, operation)` cursor; test batches larger than page limits.
4. Exercise the latest PR's `getRepo` end to end and verify roots, exact record
   bytes/CIDs, signed commit, DRISL index, provider memory bounds, and recovery
   after deliberately skipped operations. Use paths where lexicographic and
   length-first ordering differ, and record expected ordering separately for
   each proposal/implementation profile.
5. Add conformance tests for credential issuer/authority equality, strict
   `kid`, audience, client metadata/JWKS, SSRF handling, short lifetime, and
   single-use replay rejection.
6. Add hardened outbound endpoint resolution, HTTPS policy, redirect
   validation, timeout, response-size, and streamed verification.
7. Implement authenticated `notifyWrite`/space deletion and retain periodic
   reconciliation as recovery.
8. Resolve writer host for account lifecycle and purge/retain data according
   to explicit policy.
9. Define blob ownership, authorization, GC retention, and re-homing when repo
   host and space host differ; test against Habitat/plyr.fm-shaped cases.
10. Replace or clearly isolate the `private_record` adapter; do not emit fake
    protocol URIs/CIDs from it.
11. Use record-key-safe space keys.
12. Wire client attestation and narrow wildcard scopes only after publication,
    key custody, replay storage, and consent decisions are complete.

**Exit criteria:** Current PR #5187 and at least one independent implementation
profile pass applicable positive differential tests; HappyView's unsigned
commit remains a verified rejection fixture unless a separately approved
authenticated format lands; malformed and adversarial credentials, pagination,
CAR, blob, deletion, account lifecycle, and replay tests pass; a deployed
authenticated cross-service probe passes. Consumer remains flag-gated.

### Phase 7: Production And Engineering Gate

**Goal:** Make the documented deployment reproducible and observable.

1. Build workspace-aware API/web images and test them from a clean context.
2. Package migration assets and decide persistent append-only migrations versus
   explicitly disposable deployments. Recommended: append-only migrations
   before any persistent environment.
3. Route `/xrpc/*` and WebSockets through Caddy; add required PDS ingress.
4. Make Compose environment mapping match the Zod configuration contract.
5. Implement the documented instance-role component matrix.
6. Split liveness/readiness and include schema, DB/session, PDS, Tap, spaces,
   and job freshness as configured dependencies.
7. Move timers to leased workers; add distributed event delivery, OAuth state,
   and rate limiting before horizontal scaling.
8. Add request IDs, redaction, metrics, traces, pool/queue/lag telemetry, and
   alerts.
9. Implement tested backup and restore for DB, blobs, and relevant PDS/Tap
   state.
10. Pin images/commits and align Node runtime/types.

**Required CI matrix:** clean install; formatting; lint all packages; TypeScript
and Svelte checks; build; generated Lexicon drift; fresh schema and upgrade;
unit/integration tests; clean Docker builds; final-image migration; Caddy API,
XRPC, and WebSocket smoke tests; real PDS/OAuth/Tap tests for protocol changes;
backup/restore drill.

**Exit criteria:** A clean checkout can build final images, migrate an empty and
previous-release database, start through Caddy, report meaningful readiness,
complete a PDS-to-Tap-to-AppView flow, and restore tested backups.

### Phase 8: Web And Maintainability Cleanup

**Goal:** Repair user-facing correctness and reduce future change risk after
backend invariants stabilize.

1. Fix legacy redirect exception handling.
2. Restrict external links to `http:`/`https:` and add CSP.
3. Enforce cooperative workspace membership/context in the root layout and API
   calls.
4. Centralize 401/403 handling and submission state; invalidate client-direct
   mutations.
5. Add API timeouts and robust multi-cookie forwarding.
6. Move touched services into domain modules with command/query/projector
   separation; avoid a wholesale rewrite.
7. Remove dead surfaces: unwired event catalogs, dormant verifier paths,
   unused Redis requirement, nonfunctional webhook UI, and stale docs.

**Exit criteria:** protected journey E2E tests use real navigation, mobile and
accessibility checks cover core flows, and active docs contain no broken
commands or architecture claims.

## Decisions Required Before Approval

1. **Scripting:** remove it for the PoC, or fund a separately isolated runner?
   Recommendation: remove/disable until a real capability-isolated runner is a
   product requirement.
2. **Governance delegation:** compute at close from a snapshot, or prohibit
   direct voting while delegated? Recommendation: snapshot and count each
   represented member once.
3. **Governance records:** mutable canonical proposal record with CAS, or
   immutable proposal plus lifecycle events/anchors? Both can work; select one
   before Lexicon repair.
4. **Admission:** should setup default to invite-only, request/approval, or open?
   The stored policy and registration behavior must agree.
5. **Finance visibility:** which roles can see individual receipts, balances,
   allocations, tax forms, and onboarding notes?
6. **Persistent data:** remain explicitly disposable through the PoC, or support
   upgrades now? Recommendation: adopt append-only migrations before any
   external pilot.
7. **CSN as OAuth resource server:** should third-party ATProto clients call its
   XRPC directly, or are XRPC viewers browser/session-only for now?
8. **Authority hosting:** retain CSN DB as default, or target a concrete
   SimpleSpace/Roomy-style host for the first pilot?
9. **Tier 2 retention/deletion:** define re-homing, member removal, authority
   deletion, audit retention, and moderator access before activation.
10. **Network joining:** confirm that target-network approval is required.
    Recommendation: yes, with pending consent plus explicit acceptance.

## Recommended Approval Scope

Approve the program in checkpoints rather than as one blanket rewrite:

1. Approve Gate 0 and Phase 1 first.
2. Review and approve the canonical record/governance decisions before Phase 2.
3. Review the durable ingestion design before Phase 3 implementation.
4. Treat finance/legal and Proposal 0016 activation as independent signoffs.
5. Do not call the project deployable until Phase 7 exit criteria pass.

The smallest safe first implementation tranche is Gate 0 plus the public
governance acceptance fix, role-assignment ceiling, invite-policy enforcement,
request-log redaction, and regression tests. It should not include broad file
reorganization.
