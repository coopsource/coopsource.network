# V12 Phase 4 Tier 2 Copy Ledger

- **Date:** 2026-07-30
- **Status:** Implemented but not activated
- **Signoff:** V12-S01, V12-S02, V12-S04, and V12-S05 remain open

## Purpose

This checkpoint implements the next reversible part of governance Tier 2
migration: deterministic copying from retained `private_record` sources to the
draft permissioned-record writer, followed by verification through CSN's
verified permissioned replica.

It does not change `PERMISSIONED_RECORD_WRITER_MODE`, projection URIs or CIDs,
source authority, the production host, or any `private_record` row.

## Durable State

The `tier2_governance_migration` table stores one row per proposal or vote
projection. It contains:

- projection and cooperative identifiers;
- the physical private-source key and update timestamp;
- a canonical SHA-256 digest of the target record;
- the semantic permissioned target URI;
- acknowledged target CID and source revision;
- coded state and error values; and
- attempt, copy, verification, and update timestamps.

The ledger never stores a second payload or free-form remote error text.
Digests, DIDs, URIs, CIDs, and timestamps are still confidential governance
metadata and must not be published.

The constrained states are:

1. `copy_pending`: a source snapshot and deterministic target are durable, but
   no target acknowledgement is trusted;
2. `copied`: the draft XRPC writer acknowledged the exact semantic target and
   the retained source was unchanged after the call; and
3. `verified`: the verified permissioned replica observed the same CID and
   canonical payload digest while the retained source remained unchanged.

## Copy Behavior

Copy is fail-fast and scoped to one explicit cooperative DID. It first requires
a clean read-only readiness report. A database advisory lock rejects concurrent
copy or verification commands for the same cooperative. Each record then:

1. rechecks the active projection and private source in a repeatable-read
   transaction;
2. writes `copy_pending` before calling the remote target;
3. creates at the existing semantic record key;
4. retries a conflict through the draft `putRecord` path, making ambiguous
   prior attempts idempotent;
5. rejects a returned location different from the projection URI;
6. rechecks source and projection state after the remote acknowledgement; and
7. records only the acknowledged CID/revision and coded outcome.

The command stops after the first blocked record. A rerun resumes from the
ledger and does not duplicate an unchanged acknowledged copy.

## Verification

Verification does not trust the write response by itself. It reads
`permissioned_repo_record`, which is populated only after the permissioned
consumer's commit and payload verification path. Source, replica, and ledger
checks run in one repeatable-read transaction. CID or digest differences remain
blocked and are recorded as codes without payload values.

This is local orchestration evidence. The pinned atproto target still lacks a
working full-recovery endpoint, so it is not production read/recovery evidence.

### Checkpoint evidence

- API and database package builds passed.
- Five focused API files passed with 21 tests covering the copy service,
  readiness dependency, copy/readiness command parsers, and admin reset.
- A disabled, non-remote `verify` command completed successfully against the
  local test database for an empty exact-cooperative scope.
- Root lint passed all 4 configured tasks.
- `pnpm build && pnpm test` passed; Turbo completed 10/10 build tasks and 17/17
  test tasks.

## Activation Gate

The operational command is disabled unless
`TIER2_GOVERNANCE_MIGRATION_ENABLED=true`. Copy also requires an explicit
cooperative DID, `PUBLIC_API_URL`, member OAuth sessions with the draft space
grants, and the exact confirmation phrase.

```bash
TIER2_GOVERNANCE_MIGRATION_ENABLED=true \
DATABASE_URL=postgres://... \
PUBLIC_API_URL=https://api.example \
pnpm --filter @coopsource/api migrate:tier2-governance \
  --operation copy \
  --cooperative-did did:plc:example \
  --confirm COPY_TIER2_GOVERNANCE_TO_DRAFT_XRPC
```

After the verified consumer has observed the copies:

```bash
TIER2_GOVERNANCE_MIGRATION_ENABLED=true \
DATABASE_URL=postgres://... \
pnpm --filter @coopsource/api migrate:tier2-governance \
  --operation verify \
  --cooperative-did did:plc:example
```

These commands are implementation surfaces, not approval to run them against
cooperative data.

## Rollback Boundary

The pinned `com.atproto.space.deleteRecord` input has no expected-CID or
swap-record precondition. Reading a matching CID and then deleting would have a
time-of-check/time-of-use race: an author could update the target between those
calls, and an automated rollback could delete the newer record.

Therefore this checkpoint does not implement remote deletion or claim
operational rollback. `private_record` remains authoritative and retained, so
no cutover occurs. Safe remote cleanup requires one of:

- a protocol-level conditional delete;
- a host-enforced write freeze with an auditable custody policy; or
- a separately approved retention/disposition procedure that does not
  misrepresent deletion safety.

The cooperative's retention interest does not justify deleting a member's
changed record without a concurrency guarantee.

## Remaining Gate

Before activation or default change:

- select and approve production authority/host custody;
- demonstrate live full recovery and deletion semantics against the selected
  target;
- approve retention, correction, departure, and incident procedures;
- obtain V12-S01/V12-S02/V12-S04/V12-S05 signoff; and
- run a cooperative-specific readiness, copy, sync, verification, and recovery
  rehearsal with a documented rollback procedure.
