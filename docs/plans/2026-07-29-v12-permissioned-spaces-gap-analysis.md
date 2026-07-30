# V12 Permissioned Spaces Gap Analysis

- **Date:** 2026-07-29
- **Code baseline:** `main` at `319b390`
- **Research baseline:** [ATProto Permissioned Spaces Ecosystem Research
  Report](./2026-07-29-atproto-permissioned-spaces-research-report.md)

## Executive Assessment

V12 does not need another architecture pivot. Its package boundaries and
four-layer direction remain appropriate:

```text
Proposal 0016 spaces
  -> replaceable group/authority adapter
    -> generic GovernanceView
      -> cooperative CoopView policy
```

Phase 5 has produced a coherent generic governance core: tally/outcome,
proposal lifecycle, vote-summary projection, authorization, eligibility,
quorum, delegation, patronage, and distribution adapters. The most valuable
next work is no longer another broad `ProposalService` extraction. It is to
repair the Phase 4 protocol baseline and implement a real permissioned-repo
consumer vertical slice.

The highest-risk gaps are:

1. No concrete notification/pull/LtHash/CAR-recovery adapter exists.
2. The enabled consumer still uses an empty in-memory repo and log-only
   projection.
3. Canonical V12 text still elevates pre-Diary-7 member-list semantics to
   protocol truth.
4. The live XRPC exercise does not request the current draft's required
   SimpleSpace management scopes.
5. DID service discovery, client attestation, revocation, deletion, and
   organizational retention are incomplete.

**Implementation update, 2026-07-30:** P0 and the first P1 consumer checkpoint
are complete. The concrete adapter now covers inventory/oplog pulls, periodic
reconciliation, Proposal 0016 LtHash/commit verification, CAR and blob
verification, durable replicas/registrations, writer removal, credential
refresh, CSN membership acceptance, and idempotent proposal/vote projection.
The matrix below records the July 29 baseline that motivated the work. The
public DID/account-event gap was closed by the July 30 lifecycle checkpoint.
The remaining critical activation gaps are inbound notification service
identity, production lifecycle-source selection, the pinned atproto server's
unimplemented `getRepo`, live differential evidence, and the
custody/retention/migration decisions.

## Severity Scale

| Severity | Meaning                                                                                   |
| -------- | ----------------------------------------------------------------------------------------- |
| Critical | Blocks a real permissioned governance flow or creates a false production-readiness signal |
| High     | Contract or security mismatch likely to break interoperability or policy                  |
| Medium   | Important incompleteness that can follow the first vertical slice                         |
| Low      | Direction is sound; documentation, naming, or future hardening remains                    |

## Gap Matrix

| Area                    | Current implementation                                                                                                                   | Current ecosystem baseline                                                                                                        | Severity                                        | Required action                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Layering                | Spaces, Arbiter client, GovernanceView, and CoopView are separate packages                                                               | Community work also separates protocol, group authority, governance, and app policy                                               | Low                                             | Preserve boundaries                                                                         |
| Canonical docs          | `ARCHITECTURE-V12.md` is dated Jul 11 and still cites Diary 6 member-list assumptions                                                    | Diary 7 and forum correction remove membership from the core protocol                                                             | High                                            | Reconcile canonical architecture and watchlist                                              |
| Sync adapter            | `PermissionedRepoPort` exposes `watch`, `sync`, verification status, and checkpointing; only in-memory/fail-closed implementations exist | Proposal requires notifications plus periodic `listRepos`, `listRepoOps`, LtHash, CAR recovery, blobs, and public identity events | Critical                                        | Implement a concrete XRPC adapter                                                           |
| Runtime consumer        | `startSpacesConsumer` is flag-gated; dispatch supplies an empty in-memory repo and log-only `onAccepted`                                 | A useful AppView must project verified records and recover missed notifications                                                   | Critical                                        | Wire a real adapter and one idempotent projection                                           |
| Protocol vs membership  | `SpacesConsumer` always resolves a group roster and discards non-members                                                                 | Core spaces have no roster; SimpleSpace or managing apps define policy                                                            | High                                            | Move membership acceptance into a policy/decorator above protocol sync                      |
| Writer discovery        | Current abstractions treat a space notification as sufficient input and membership as the author set                                     | `listRepos` is the protocol writer inventory and is not a reader/member list                                                      | High                                            | Represent writer discovery separately from group eligibility                                |
| Credentials             | Two-step issuer, persistent short-lived cache, refresh, and typed errors exist                                                           | Flow broadly matches Proposal 0016; revocation and client attestation remain unsettled                                            | High                                            | Keep issuer; add attestation provider and explicit revocation posture                       |
| Membership invalidation | Group mutation wrapper deletes CSN's cached credential on member-list changes                                                            | Upstream has expiry and an unresolved need for revocation fan-out                                                                 | High                                            | Describe this as local cache invalidation, not global revocation                            |
| DID service discovery   | `DidProvisioningPort` uses `#space_host` and `CoopSourceSpaceHost`; live exercise accepts a configured URL                               | Current proposal uses optional `#atproto_space_host` and `#atproto_space`, with PDS fallbacks                                     | High                                            | Add DID-resolved endpoint selection and update service identifiers                          |
| OAuth scopes            | Scope formatter supports read/write and generic `manage`; advertised plan requests read/write only                                       | Current PDS branch requires `manage=create` for create and `manage=update` for member operations                                  | High                                            | Add a narrowly scoped management plan for the live harness/manager                          |
| Live XRPC exercise      | Creates/reuses a SimpleSpace, adds members, obtains a credential, and performs vote CRUD                                                 | Current branch separates management grants and does not define `NotAMember` on record writes                                      | High                                            | Update scopes/error mapping; run against pinned implementations                             |
| SimpleSpace client      | Supports create, add member, and remove member                                                                                           | Draft surface also has update/delete/list members and service-authenticated `checkUserAccess`                                     | Medium                                          | Add only methods needed by the first managing-app policy slice                              |
| Record writes           | XRPC writer supports create/put/delete behind author OAuth plus space credential                                                         | Draft also has `applyWrites`, blob operations, and evolving error contracts                                                       | Medium                                          | Keep CRUD for one-record slice; add atomic writes/blobs when a use case requires them       |
| Default Tier 2 storage  | `PERMISSIONED_RECORD_WRITER_MODE` defaults to `private-record`                                                                           | Proposal 0016 storage is not production-ready, but local DB is still canonical in practice                                        | Critical for migration; safe as current default | Do not flip default until real sync/recovery passes; label DB authority honestly            |
| Placement routing       | `ProposalService` still calls `VisibilityRouter`, then uses `PermissionedRecordWritePort` for Tier 2                                     | V12 plan says placement should become space-native and retire the router later                                                    | Medium                                          | Defer removal until the vertical slice is proven, then make placement a stable port         |
| GovernanceView          | Generic tally/outcome/lifecycle and plugin adapters are wired; vote summary is extracted                                                 | Community group work supports reusable governance above spaces                                                                    | Low                                             | Treat current Phase 5 checkpoint as sufficient; extract more only when plainly pure         |
| Generic naming          | `GovernanceGroupRef` inputs are often named `cooperative`                                                                                | The package is intended for non-cooperative groups                                                                                | Medium                                          | Rename to `group` before external contract publication, in one focused refactor             |
| Plugin defaults         | Generic eligibility and authorization defaults permit actions; CoopView supplies production plugins                                      | A generic library may offer permissive defaults, but production construction must be explicit                                     | Medium                                          | Add composition tests proving API paths use CoopView policy; avoid accidental bare defaults |
| Community Lexicons      | Governance drafts are validation-tested and clearly non-canonical                                                                        | Atmospheric Groups and Lexicon Community contracts are still emerging                                                             | Low                                             | Keep private; no TSC publication yet                                                        |
| AppView substrate       | Custom TypeScript/Express AppView retained; HappyView is a compatibility target                                                          | Roomy and Blacksky also need custom app semantics/storage                                                                         | Low                                             | Keep decision; upgrade harness separately                                                   |
| Dependency baseline     | API `0.19.0`, OAuth client `0.3.17`; no space package                                                                                    | Latest packages are newer; `@atproto/space` is unpublished                                                                        | Medium                                          | Upgrade stable SDK/OAuth packages separately; vendor no draft package                       |
| Conformance tests       | Focused unit tests and an in-memory Phase 4 vote harness exist                                                                           | Proposal has at least three divergent executable interpretations                                                                  | High                                            | Add pinned contract fixtures and differential integration tests                             |
| Privacy/deletion        | No end-to-end per-space purge, delivery accounting, re-homing, or retention contract                                                     | Forum, Habitat, and Blacksky expose these as real requirements                                                                    | High                                            | Write a cooperative custody/retention decision before production activation                 |
| Moderation              | Governance labels are planned above the substrate                                                                                        | Private labels and abuse signals must not leak publicly                                                                           | High                                            | Include permissioned moderation records and operator review in production gate              |

## Detailed Findings

### 1. Architecture Direction Is Sound

The current package boundaries absorb the ecosystem's uncertainty well:

- `packages/spaces-consumer` can target the protocol without importing
  cooperative semantics.
- `packages/arbiter-client` can host CSN DB, SimpleSpace, Roomy-style Arbiter,
  or future group-authority adapters.
- `packages/governance-view` owns reusable tally, lifecycle, and action policy.
- `packages/coop-view` owns cooperative-specific eligibility, weights,
  delegation, patronage, and distribution.

Do not collapse Arbiter/Rego policy into GovernanceView. Rego at the host proxy
answers whether an XRPC operation is allowed; GovernanceView answers whether a
governance action is valid for the group.

### 2. Canonical Documentation Overstates The Old Model

`ARCHITECTURE-V12.md` currently says:

- notifications come from the Arbiter;
- the consumer pulls records from member PDSes;
- reader-side member-list enforcement is the protocol write-enforcement
  mechanism;
- member-list change rotates credentials;
- the April Arbiter role-space design is a concrete convergence target.

The first and fourth claims are no longer protocol facts. Proposal 0016
notifications are between writer repo hosts, the space authority, and
registered syncers. Writer discovery comes from `listRepos`. An application
may additionally reject records under a SimpleSpace or CSN group policy, but
that is Layer 2 behavior.

Required canonical correction:

```text
protocol verification
  = credential + commit/LtHash + repo sync + identity/schema checks

application acceptance
  = managing-app/group policy, optionally including active membership
```

Keeping these stages separate avoids rejecting valid writes merely because
`listRepos` and an application roster have different semantics.

### 3. The Runtime Consumer Is Still A Skeleton

The public `PermissionedRepoPort` is a reasonable capability boundary. Its
runtime implementation is not real:

- `apps/api/src/appview/spaces-consumer-dispatch.ts` constructs
  `InMemoryPermissionedRepoPort` with no records.
- No `registerNotify`, `notifyWrite`, `listRepos`, `listRepoOps`, `getRepo`,
  LtHash, CAR, or blob client is wired.
- Accepted records are logged, not projected.
- Checkpoint and recovery behavior are only exercised with local test doubles.

Enabling `SPACES_CONSUMER_ENABLED` therefore does not create a permissioned
AppView. The configuration should continue to default off until one complete
flow exists.

### 4. Draft Writes Are Further Along Than Draft Reads

The write side already has:

- structured permissioned record locations and URI helpers;
- OAuth session selection bound to the author DID;
- two-step credential acquisition;
- Kysely-backed short-lived credential caching;
- draft XRPC create/put/delete;
- ProposalService integration for closed proposal/vote writes;
- focused unit and API tests.

The remaining write problems are narrower:

- current management calls need `manage=` OAuth grants;
- authority endpoints should be DID-resolved;
- client attestation is an environment-provided string, not a signer/rotator;
- current error mapping still anticipates membership errors that the record
  write Lexicons do not define;
- `applyWrites` and blobs are absent.

Do not broaden writes before implementing reads. A write-only migration can
strand canonical data that CSN cannot verify, recover, or project.

### 5. Membership Needs A Layer Boundary

`SpacesConsumer` currently performs the group-directory lookup internally and
rejects every author outside the resolved member set. CSN does need an
active-member-at-write-time rule for governance. The issue is ownership:

- Protocol sync should discover and verify repositories.
- A Layer 2 acceptance policy should resolve the relevant roster/role state.
- Governance projection should apply collection-specific business rules.

This can remain fail closed without making membership part of
`PermissionedRepoPort`. A policy callback or decorator can preserve the
current behavior for CSN while allowing public spaces, allow-list apps,
organization hosts, or non-roster authorities later.

### 6. Credential Revocation Is Not Solved

`SpaceCredentialStore` correctly models expiry and refresh. The
member-mutation wrapper correctly prevents CSN from reusing its own cached
credential after a local roster change.

It does not revoke credentials held by:

- another app;
- another AppView instance;
- a former member's client;
- a syncer that has not received a revocation signal.

Until upstream supplies revocation fan-out, production policy must rely on
short expirations, credential re-evaluation, authority-side policy, and
explicit incident procedures. Documentation must not call local cache deletion
"credential rotation."

### 7. Organizational Custody Is A Product Decision

Per-user authority is attractive for portability but creates cooperative
record-retention questions:

- Can a departed voter delete the canonical vote?
- Does withdrawal erase a deliberation that other members replied to?
- Which records must the cooperative retain for legal/audit periods?
- Is a member-authored record canonical, or does the cooperative accept and
  re-home/countersign it?
- How is a right-to-delete request reconciled with governance auditability?

Roomy's community account and Habitat's organization data server are two
answers. Blacksky's AppView custody is another. CSN should not choose implicitly
through whichever adapter is easiest to implement.

## Recommended Sequence

### P0: Re-establish The Baseline

Create `feature/v12-phase-4-proposal-0016-conformance-baseline`.

**Progress 2026-07-30:** Implemented. Canonical/package documentation now
separates protocol verification from cooperative acceptance policy; the
proposal and implementation commits, DID fragments, commit fields, and every
draft method CSN currently calls are executable constants with tests. The
manager scope is narrowed to `manage=create,update`; authority endpoints and
verification methods resolve from DID documents; client attestation has a
deterministic signer port; draft error mapping matches the pin. Production
signer/key custody and differential HappyView/PR runners remain parked or P3
work. See
`docs/plans/2026-07-30-v12-phase-4-proposal-0016-conformance-baseline.md`.

1. Update `ARCHITECTURE-V12.md`, the V12 program plan, spaces-consumer README,
   Arbiter README, and HappyView spike addendum with the July 29 facts.
2. Pin Proposal 0016 plus atproto PR #5187 head SHA in a machine-readable test
   fixture or conformance document.
3. Add current draft Lexicon fixtures for the exact methods CSN uses. Keep them
   internal while `@atproto/space` is unpublished.
4. Add the minimal `manage=create,update` OAuth plan used only by the manager
   exercise.
5. Replace configured authority URLs with a DID service resolver supporting
   `#atproto_space_host`, `#atproto_space`, and PDS fallback.
6. Define a `ClientAttestationProvider` contract and use a deterministic signer
   in tests. Production key storage can remain gated.
7. Update draft error mapping to the pinned Lexicons.

**Done when:**

- canonical docs distinguish protocol verification from app membership policy;
- the live command requests valid current scopes;
- all targeted XRPC request/response shapes come from pinned fixtures;
- the same fixture suite can be pointed at atproto PR #5187 and HappyView;
- no runtime default changes.

### P1: One Real Read/Recovery Vertical Slice

Create `feature/v12-phase-4-permissioned-proposal-vote-consumer`.

**Progress 2026-07-30:** Implemented as a disabled-by-default checkpoint.
Items 1-11 are implemented, including persisted registrations even though the
API does not activate an inbound endpoint. Item 8 now re-resolves writer DIDs
on public identity events and applies durable host-scoped account invalidation
without treating PDS status as global membership policy. The CAR recovery
client is complete, but the pinned atproto `getRepo` server handler is still
`MethodNotImplemented`. See
`docs/plans/2026-07-30-v12-phase-4-public-repo-lifecycle-events.md`.

The focused suite covers the required timing/retry cases with two explicit
limitations: live writer deletion/recovery cannot be demonstrated against the
pinned server until it serves `getRepo`, and push notification registration
cannot be activated until V12-S09 resolves the service identity/audience
contract. Periodic sweep recovery is tested and remains the correctness path.

Implement one concrete `XrpcPermissionedRepoPort`:

1. Register for notifications and persist registrations.
2. Run a periodic `listRepos` reconciliation sweep.
3. Pull `listRepoOps` from the last stored revision.
4. Verify signed/HMAC commit format behind a replaceable verifier selected by
   the pinned target.
5. Compare LtHash state.
6. Recover divergence or missing history with `getRepo` CAR.
7. Fetch and verify required blobs.
8. Track public DID/account changes.
9. Pass verified records through a separate CSN membership acceptance policy.
10. Project proposal and vote records idempotently into the existing Postgres
    read model.
11. Commit a checkpoint only after the projection transaction succeeds.

Focused integration tests must cover:

- notification delivered before and after the corresponding write is readable;
- duplicated, reordered, delayed, and dropped notifications;
- periodic sweep recovery after a missed notification;
- credential expiry during a batch;
- writer removal between notification and projection;
- partial/stale group resolution;
- LtHash mismatch and full CAR recovery;
- process restart after projection but before checkpoint;
- deletion/tombstone projection;
- concurrent writes from two member repositories.

Test doubles must preserve relevant notification timing, ordering,
cancellation, and retry behavior rather than only matching response shapes.

**Done when:** one closed proposal and its votes can be written through draft
XRPC, independently synchronized, verified, projected, queried with the current
API response shape, deleted, and recovered from a deliberately missed
notification.

### P2: Managing-App And Migration Decisions

After the vertical slice:

1. Implement only the SimpleSpace `checkUserAccess`/management methods required
   by the selected CSN managing-app model.
2. Decide cooperative custody, retention, re-homing, and deletion policy.
3. Decide whether CSN runs a simple authority, integrates a Roomy-style Rego
   proxy, or supports both behind ports.
4. Make space placement a first-class port and stop calling
   `VisibilityRouter` from proposal/vote writes.
5. Change the default writer from `private-record` only after read/recovery and
   operational rollback are demonstrated.
6. Retire `private_record` authority and other Phase 6 surfaces one subsystem
   at a time.

### P3: Conformance And Ecosystem Work

1. Run differential tests against the pinned atproto branch, HappyView
   `2.12.0-dev`, and atproto-crates where feasible.
2. Record deviations, especially signed-context versus HMAC-only commits.
3. Upgrade released ATProto SDK/OAuth dependencies in a separate branch.
4. Revisit HappyView v3 only after a release exists and the TypeScript plugin
   contract can be exercised.
5. Prepare, but do not publish, feedback on revocation, `unregisterNotify`,
   recursive group policy, and retention.
6. Keep governance Lexicon outreach gated on user review and current
   Atmospheric Group work.

## Phase 5 Recommendation

Treat the current Phase 5 checkpoint as sufficient for sequencing purposes.
The generic vote-summary extraction completed the smallest obvious duplicate.
Continue only when a review identifies logic that is:

- pure;
- persistence and transport independent;
- useful to a non-cooperative group;
- backed by an existing contract and focused tests.

Do not implement `anchorSummary`, `historicalState`, or `meetingMinutes` until
their contracts exist. Do not use further service extraction to delay the
critical Phase 4 read/recovery slice.

Before any external publication, rename generic
`GovernancePluginSet` input properties from `cooperative` to `group` so the
package's public vocabulary matches its actual scope.

## Explicit Non-Recommendations

- Do not replace `apps/api` with HappyView.
- Do not adopt Roomy's current storage or old Arbiter Lexicons wholesale.
- Do not treat HappyView, Roomy, or Diary prose as the sole protocol oracle.
- Do not encode a member list into the generic spaces package.
- Do not make governance depend on E2EE transport.
- Do not publish the community governance drafts yet.
- Do not flip `PERMISSIONED_RECORD_WRITER_MODE` until read, recovery, deletion,
  and rollback work.
- Do not merge Phase 6 retirement with the protocol-conformance branch.

## Decision Summary

| Decision                  | Recommendation                                                          |
| ------------------------- | ----------------------------------------------------------------------- |
| Four-layer architecture   | Keep                                                                    |
| Custom `apps/api` AppView | Keep                                                                    |
| HappyView                 | Upgrade as harness; do not migrate AppView                              |
| Arbiter                   | Keep ports; refresh assumptions toward portable policy proxy            |
| Core membership           | Remove from protocol description; keep as CSN acceptance policy         |
| Phase 5                   | Consider stable enough; only small pure extractions                     |
| Immediate phase           | Return to Phase 4 conformance and real consumer                         |
| Production enablement     | Blocked on read/recovery, custody, revocation, and moderation decisions |
| External communication    | None in this slice                                                      |
