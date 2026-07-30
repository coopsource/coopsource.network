# V12 Phase 4 Tier 2 Migration Readiness

- **Date:** 2026-07-30
- **Status:** Read-only checkpoint; no storage migration or default change
- **Signoff:** V12-S01 and V12-S05 remain open

## Purpose

Governance proposal and vote projections already store semantic permissioned
record URIs even while `PrivateRecordPermissionedWritePort` keeps the physical
payload in `private_record`. Copying those rows to a draft permissioned host
without first reconciling both sides could omit canonical cooperative records,
copy stale payloads, or strand orphaned audit material.

This checkpoint adds a read-only readiness manifest. It does not write to a
permissioned host, update projection CIDs, delete private rows, or change
`PERMISSIONED_RECORD_WRITER_MODE`.

## Checks

For active proposal and vote projections, the audit:

1. separates public repository URIs from permissioned record URIs;
2. verifies that the permissioned URI identifies the projection cooperative,
   author, collection, and CSN members space;
3. derives the exact physical `private_record` key;
4. requires a matching private source with the same creator;
5. compares selected payload fields in memory to detect stale or mismatched
   source rows without including their values in the report; and
6. requires a valid source `createdAt`.

The reverse pass reports governance private rows that have no active
permissioned projection. Missing, invalid, mismatched, and orphaned rows are
all blockers until an operator records a disposition.

Projection and private-source reads run in one repeatable-read transaction so
concurrent governance writes cannot mix two database snapshots in one report.

The report contains counts, record identifiers, locations, source update
timestamps, and field-name diagnostics. It never includes Tier 2 payload
values. The identifiers still disclose private-governance metadata, so the
report is a confidential operational artifact and must not be published.

## Command

```bash
DATABASE_URL=postgres://... \
  pnpm --filter @coopsource/api audit:tier2-governance-migration
```

An optional cooperative filter limits database reads and report scope:

```bash
pnpm --filter @coopsource/api audit:tier2-governance-migration \
  --cooperative-did did:plc:example
```

The command exits nonzero when blockers exist. It has no mutation flag.

## Verification

- API build: passed.
- Focused API tests: 4 files, 30 tests passed.
- Live read-only CLI exercise against the local test database: passed with no
  candidates or blockers and no payload output.
- Full build: 10/10 Turbo tasks passed.
- Full test rerun: 17/17 Turbo tasks passed, including API 105 files/1,004
  tests, spaces-consumer 20/115, arbiter-client 7/41, lexicons 8/55, and
  Docker-backed federation 17/122.

The first full test attempt had one transient 404 during invitation setup in
the existing permissions suite. That file passed 16/16 in isolation, and the
complete repository test command then passed on rerun.

## Copy-Ledger Checkpoint

The next checkpoint implemented a disabled copy and replica-verification
command that consumes a clean manifest and:

- preserve `private_record` as the source of rollback;
- use an explicit, durable migration ledger;
- preserve semantic space location and record key;
- verify the copied CID and read/recovery path before projection changes;
- record partial copy failures durably and make retry idempotent;
- never delete private sources in the same checkpoint; and
- remain disabled until V12-S01/V12-S05 signoff.

Remote rollback deletion remains unimplemented. The pinned delete contract has
no expected-CID precondition, so a read-then-delete sequence could race with and
delete a newer member update. See
`docs/plans/2026-07-30-v12-phase-4-tier2-copy-ledger.md`.

Production custody, retention, correction, deletion, host selection, and
default activation remain unresolved. This readiness report supplies evidence
for those decisions; it does not make them.
