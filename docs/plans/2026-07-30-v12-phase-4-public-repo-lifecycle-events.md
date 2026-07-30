# V12 Phase 4 Public Repository Lifecycle Events

**Date:** 2026-07-30
**Status:** Implemented checkpoint; disabled permissioned reader remains the
runtime default; production activation not approved

## Purpose

Add public repository identity and account events as immediate reconciliation
inputs for the permissioned-space reader. This closes item 8 of the Phase 4 P1
vertical slice without treating a PDS-scoped account status as a global DID or
cooperative-membership decision.

The upstream contracts are:

- [`com.atproto.sync.subscribeRepos`](https://github.com/bluesky-social/atproto/blob/main/lexicons/com/atproto/sync/subscribeRepos.json)
  emits `#identity` and `#account` messages in the same sequenced stream as
  commits.
- The [ATProto sync specification](https://atproto.com/specs/sync) requires
  identity events to invalidate DID/handle caches.
- An account event describes repository availability at the emitting host.
  It does not establish global DID, legal-person, cooperative-member, or
  moderation status.
- [`@atproto/tap`](https://github.com/bluesky-social/atproto/tree/main/packages/tap)
  exposes a combined normalized identity/account event but does not expose the
  raw emitting host.

## Implemented

### Federation and AppView ingestion

- The federation stream now carries record commits plus typed identity and
  account lifecycle events.
- Both firehose decoder paths validate and decode `#identity` and `#account`.
- Direct `AtprotoPdsService` events carry the normalized configured service URL
  as `sourceHost`.
- Tap identity events split into ordered identity then account hints.
- A lifecycle handler must finish before Tap acknowledges the event or the
  local AppView cursor advances.
- A failed local lifecycle handler reconnects from the last durable cursor
  instead of allowing a later event to skip it.
- The spaces consumer starts before AppView ingestion and routes each lifecycle
  hint through its existing per-space serialization queue.

### Reconciliation behavior

| Input                                                            | Behavior                                                                                                                                                    |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity event                                                   | Re-resolve the writer DID endpoint and force reconciliation. A host move updates the durable replica host.                                                  |
| Active account event with a raw source host                      | Persist the newer host-scoped state and permit synchronization when that host is the DID-resolved writer endpoint.                                          |
| Inactive account event from the current DID-resolved writer host | Persist the state, project tombstones for cached records, remove the replica checkpoint, and suppress later sweeps until a newer active event or host move. |
| Account event from another host                                  | Preserve it only for that host. Do not remove data fetched from the current DID-resolved writer host.                                                       |
| Tap-derived account event without a source host                  | Treat it as a non-destructive reconciliation hint. It cannot create or clear host-scoped suppression.                                                       |

`listRepos` remains the authority's writer inventory. Account state is a
separate host availability input and is never interpreted as cooperative
membership.

### Durable state and replay

- `permissioned_repo_cursor.repo_host` records the DID-resolved host that
  supplied each verified replica.
- `permissioned_repo_account_state` stores the newest event for each
  `(repo_did, source_host)`.
- Conditional upserts use the emitting stream sequence, so duplicate or stale
  inactive events cannot overwrite a newer active event.
- Account state is independent of a space replica. Suppression therefore
  survives tombstone checkpoint commits, process restarts, and temporary
  removal from a space writer inventory.
- Existing projection checkpoints remain unchanged: application projection
  still succeeds before replica state advances.

## Verification

Focused coverage includes:

- exact raw identity/account frame decoding;
- Tap identity/account split order and active-status normalization;
- per-space lifecycle queue serialization;
- immediate host-matched tombstones;
- no tombstone for another host or unattributed Tap hints;
- suppression on later sweeps after the replica cursor is removed;
- reactivation by a newer event and rejection of a stale inactive replay;
- DID endpoint refresh;
- durable Postgres account-state ordering and replica-host persistence.

Verification completed during the slice:

- federation decoder: 1 file, 6 tests passed;
- spaces consumer lifecycle/XRPC scope: 2 files, 27 tests passed;
- API lifecycle/persistence scope: 2 files, 5 tests passed;
- `pnpm build`: 10/10 tasks passed.

Final post-review gate:

- `pnpm build && pnpm test`: build 10/10 and test 17/17 tasks passed;
- API: 101 files and 984 tests passed;
- federation: 17 files and 122 tests passed;
- spaces consumer: 19 files and 110 tests passed.

## Parked Decisions

### Production lifecycle source

The code supports direct `subscribeRepos` events and Tap hints, but production
topology is not selected. Destructive invalidation requires a raw event whose
emitting host matches the current DID-resolved writer host. Do not infer that
host for an inactive Tap event.

Changing between unrelated stream sources also changes sequence domains.
Host-attributed raw state remains fail-closed until a newer event from that
same host or a DID host move. An operational source-switch procedure should
reconcile and audit stored account states before production activation.

### Account meaning

Repository inactivity is availability state at one host. It must not suspend a
CSN account, revoke cooperative membership, erase governance history, or
replace due-process policy. Those remain separate cooperative and legal
decisions.

### Runtime defaults

`PERMISSIONED_REPO_READER_MODE=fail-closed` and
`PERMISSIONED_RECORD_WRITER_MODE=private-record` remain unchanged. This
checkpoint does not approve the production authority, custody, retention,
notification, or writer-migration decisions in the V12 signoff register.

## Next Work

1. Run the implemented differential runner against deployed atproto and
   HappyView fixtures once disposable authenticated sessions are available;
   see
   `2026-07-30-v12-phase-4-permissioned-conformance-differential.md`.
2. Exercise live full CAR recovery when a pinned implementation serves
   `getRepo`.
3. Resolve V12-S09 before exposing an inbound permissioned notification
   endpoint.
4. Continue managing-app, cooperative custody, retention, and migration design
   behind disabled defaults.
