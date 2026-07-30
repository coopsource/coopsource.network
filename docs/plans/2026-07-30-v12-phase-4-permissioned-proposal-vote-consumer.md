# V12 Phase 4 Permissioned Proposal/Vote Consumer

**Date:** 2026-07-30
**Status:** Implemented checkpoint; disabled by default; production activation
not approved

## Purpose

Implement the first concrete Proposal 0016 read/recovery path behind
`PermissionedRepoPort` without changing the current Tier 2 writer or treating
draft protocol behavior as stable.

The slice keeps these boundaries:

```text
Proposal 0016 verification
  -> CSN active-membership acceptance
    -> idempotent proposal/vote projection
      -> existing API read shape
```

`listRepos` remains a protocol writer inventory. It is not interpreted as a
cooperative member or reader roster.

## Implemented

### Protocol adapter

- `XrpcPermissionedSyncClient` implements the pinned `listRepos`,
  `listRepoOps`, and `registerNotify` HTTP contracts.
- `XrpcPermissionedRepoPort` treats notifications as wake-up hints and runs
  periodic `listRepos` sweeps for correctness.
- Per-writer oplogs resume from durable revisions, reject broken `prev` links
  and non-advancing revisions, validate inline record CIDs, and preserve stable
  writer order.
- Proposal 0016 LtHash uses the pinned 1024-lane/2048-byte construction.
- `Proposal0016CommitVerifier` checks the signed context, HKDF expansion, HMAC,
  LtHash, and writer DID signing key.
- A conflicting notification hash cannot override a current authority
  `listRepos` head.
- Writers removed from `listRepos` emit tombstones and are removed from the
  durable replica after projection succeeds.
- `XrpcCarPermissionedRepoRecoveryPort` parses and verifies the pinned two-root
  CAR shape.
- `XrpcPermissionedBlobVerifier` fetches referenced blobs, checks declared
  sizes, and verifies SHA-256 multihash content.
- Space-authority endpoints and each writer's PDS and `#atproto` signing key
  are resolved independently from DID documents.

### Durability and ordering

- `permissioned_repo_cursor` and `permissioned_repo_record` persist verified
  per-writer replica state.
- `permissioned_notification_registration` persists registration expiry.
- Replica state is staged behind an opaque checkpoint. It is committed only
  after all acceptance and projection handlers succeed.
- A process restart after projection but before checkpoint replays the batch;
  projection is idempotent.
- Signals for one space are serialized. Credential authentication failures
  invalidate the cached credential and retry once with a fresh credential.

### API projection

- The API can construct the concrete reader with
  `PERMISSIONED_REPO_READER_MODE=draft-xrpc`.
- `SPACES_CONSUMER_SPACES` supplies explicit configured subscriptions; the
  default is `[]`.
- CSN strict membership acceptance remains above protocol verification in the
  API dispatcher.
- Verified proposal and vote creates, updates, deletes, replay, and writer
  removal project into the existing Postgres read model.
- Malformed known records, proposal/cooperative mismatches, vote author
  spoofing, cross-space or cross-cooperative proposal references, stale
  proposal CIDs, and references to unprojected proposals fail closed before
  checkpoint advance.
- Existing `getProposal`/`getProposalByUri` response behavior is preserved,
  including the GovernanceView-backed unweighted vote summary.

## Verification Coverage

Focused tests cover:

- exact HTTP requests, authorization, nullable links, and typed auth errors;
- LtHash, canonical Lexicon CIDs, signed context/HMAC/signature, CAR, and blobs;
- notification-before-readable retry and conflicting or duplicate hints;
- authority inventory precedence over stale writer hints;
- periodic recovery after a deliberately missed notification;
- persisted registration reuse;
- credential expiry during a batch;
- stale membership rejection without checkpoint;
- LtHash mismatch and full recovery;
- projection-before-checkpoint restart replay;
- tombstones and writer removal, including cleanup after membership removal;
- concurrent member repositories and per-space signal serialization;
- proposal/vote projection, replay, update, deletion, query shape, and durable
  cursor advancement.

Final focused verification on 2026-07-30:

- `pnpm build`: 10/10 tasks passed.
- `pnpm --filter @coopsource/spaces-consumer test`: 19 files and 104 tests
  passed.
- `pnpm --filter @coopsource/api exec vitest run --no-file-parallelism`: 100
  files and 981 tests passed.
- Two default-parallel API reruns each passed 980/981 tests but exposed the
  existing shared setup/session race in different inlay files; both failures
  passed in isolation, and the serialized full run passed. Treat this as test
  harness nondeterminism, not a substitute for the required repository gate.
- The initial `pnpm test` attempt reached 15/17 tasks before Docker Desktop
  required an update and administrator approval for its networking helper.
- After that update, the exact `pnpm test` command passed all 17 tasks,
  including 100 API files/981 tests and 17 federation files/120 tests. The
  environment gate is closed.

## Parked Activation Decisions

### Inbound notification service authentication

The generic adapter and registration store are complete, but the API does not
register an inbound endpoint. The pinned implementation currently derives a
notification service identity/audience from the endpoint URL, while CSN's
service-auth verifier requires a DID audience. Creating a local hybrid would
weaken interoperability and authentication clarity.

Periodic reconciliation remains the correctness mechanism. Activating push
delivery requires V12-S09 signoff after the upstream identity/audience
contract converges or CSN explicitly selects a temporary pinned target.

### Upstream full recovery

The CAR client and verifier are implemented. The pinned atproto PR's `getRepo`
handler still returns `MethodNotImplemented`, so a live exercise cannot yet
demonstrate server-side full recovery against that target. Fail-closed behavior
remains in place.

### Public identity/account events

Writer DID documents are resolved on each relevant reconciliation, but public
identity/account event subscription is not implemented. Periodic sweeps cover
event loss, not immediate account takedown or DID endpoint/key change. Add this
as the next narrow protocol-hardening slice before production activation.

### Canonical storage migration

`PERMISSIONED_RECORD_WRITER_MODE` remains `private-record`. Do not flip it until
live read/recovery/deletion and operational rollback evidence satisfy V12-S05.
The new reader and projection tables are cache/checkpoint state, not approval
of a production custody or retention model.

## Next Work

1. Add public DID/account event reconciliation and explicit account-state
   invalidation.
2. Build differential runners against the pinned atproto branch and HappyView
   dev release; record commit/CAR/notification deviations.
3. Exercise live full recovery when a pinned implementation serves `getRepo`.
4. Resolve V12-S09 before exposing or registering an inbound notification
   endpoint.
5. Proceed to managing-app, cooperative custody, retention, and migration
   decisions without changing runtime defaults.
