# V12 Phase 6 V9 Surface Retirement

- **Date:** 2026-07-30
- **Status:** Phase in progress; checkpoint 1 complete
- **Entry gate:** Phases 3-5 stable on `main`

## Purpose

Phase 6 removes V9 implementation surfaces that the V12 layered architecture
has replaced. A name appearing in the retirement checklist is not sufficient
evidence for deletion. Each checkpoint must first prove that no live runtime,
security, migration, or user workflow still depends on it.

The project is a proof of concept, so no compatibility wrapper is required for
a genuinely retired internal API. Live behavior still requires either a V12
replacement or an explicit product decision before deletion.

## Audit Method

For every subsystem:

1. search source, tests, package exports, configuration, routes, web clients,
   scripts, deployment docs, and schema references;
2. identify the current runtime owner and any security boundary;
3. identify the V12 replacement and prove it is active;
4. delete code, wiring, schema, tests, and current documentation together;
5. run focused package/API tests; and
6. run `pnpm build && pnpm test` before the no-ff checkpoint merge.

Archived architecture and migration history remain historical evidence and do
not count as runtime consumers.

## Usage Audit

| Candidate                                                    | July 30 evidence                                                                                                                                   | Disposition                                                              |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `IFederationClient` and `HttpFederationClient`               | No app/container/service consumer; only package exports and the implementation refer to the outbound abstraction                                   | Remove first                                                             |
| RFC 9421 signing                                             | `requireFederationAuth` verifies mounted inbound federation routes and cross-instance tests exercise signed calls                                  | Retain until inbound routes are replaced or retired                      |
| `SigningKeyResolver`                                         | No runtime caller; one method supports cross-instance tests and the raw-byte method is only dormant future infrastructure                          | Remove; use a test-local real-DB key loader for retained signature tests |
| `privateRecordService`, route, adapter, and `private_record` | Default permissioned writer, Tier 2 source authority, readiness/copy-ledger source, direct private-record API, and finance/ops descriptions remain | Blocked on V12-S05 migration/cutover evidence                            |
| `governanceLabeler`                                          | Mounted label XRPC, WebSocket subscription, admin UI, public proposal outcome labels, and tests remain                                             | Retain pending a `$labeler`/anchor contract                              |
| `cooperative-link-service` and table                         | Container and cooperative-link governance routes still expose the user workflow                                                                    | Retain pending a recursive-space/network replacement                     |
| local PDS/PLC/blob/provisioning classes                      | Configured dev/test fallback, setup, provisioning scripts, and real-PDS tests still use portions                                                   | Retain until Docker/real-PDS development is the only supported posture   |
| federation outbox                                            | Table, processor, enqueue path, schema type, and runtime wiring were removed in V7; only two stale current-code comments remained                    | Complete; comments removed in checkpoint 2                               |

## Checkpoint 1: Dormant Outbound Federation Client

Delete:

- `packages/federation/src/interfaces/federation-client.ts`;
- `packages/federation/src/http/http-federation-client.ts`; and
- `packages/federation/src/http/signing-key-resolver.ts`;
- the resolver's isolated unit tests; and
- their root, interface, and HTTP package exports.

Retain:

- `http/signing.ts`, because inbound middleware verifies signed requests;
- `DidWebResolver`, because mounted federation routes use it;
- inbound federation routes and their tests; and
- `AuthCredentialResolver`, which belongs to the active PDS authentication
  path rather than the retired outbound client.

Cross-instance tests load and decrypt the same real `entity_key` row through a
test-local helper, preserving signature timing and key-format behavior without
keeping an unused production resolver. No route or schema changes in this
checkpoint.

The retained inbound path exposed stale harness assumptions that the old
persistent database had hidden. The checkpoint therefore also:

- normalizes bare P-256 multibase keys to the `did:key:` form required by the
  current PLC server when an HTTP PLC genesis operation is created;
- verifies RFC 9421 signatures from both JSON Web Key and DID Multikey
  verification methods;
- builds the API dependency graph before starting dev containers, so mounted
  package `dist` exports match the source under test;
- runs application migrations inside the Compose network before API startup;
- gives interactive and test stacks distinct Compose project names;
- gives the test stack an ephemeral PostgreSQL volume with failure-log capture
  and unconditional cleanup;
- publishes federation PostgreSQL on host port `55432`, avoiding the normal
  local database on `5432`; and
- models both entity and consent-record projection explicitly in the
  cross-instance membership test.

These are retained-path corrections, not a revival of the deleted outbound
client. The multi-instance harness now proves inbound authentication against
the same current PLC and encrypted key material used by local development.

## Checkpoint 1 Verification

- `pnpm --filter @coopsource/federation build`
- focused `PlcClient` tests: 1 file, 11 tests
- isolated three-instance federation suite: 1 file, 8 tests
- federation package tests: 16 files, 118 tests
- `pnpm lint`: 4 tasks passed
- `pnpm build`: 10 tasks passed
- `pnpm test`: 17 tasks passed, including API (107 files, 1,015 tests)

## Checkpoint 2: Federation Outbox Residue

The V7 cleanup already removed the federation outbox table, processor, enqueue
path, schema type, reset wiring, and tests. Phase 6 found no remaining runtime
or schema consumer. This checkpoint removes the final current-code retirement
comments and records the subsystem as complete.

The event delivery log in `EventBusService` is unrelated and remains active. It
serves as the outbox for internal asynchronous event delivery and is not part
of the retired V9 cross-instance federation queue.

Historical design, implementation-plan, and migration documents retain their
outbox references as evidence of the earlier removal.

### Checkpoint 2 Verification

- current source/schema usage audit found no federation outbox consumer
- focused federation API tests: 1 file, 35 tests
- `pnpm lint`: 4 tasks passed
- `pnpm build`: 10 tasks passed
- `pnpm test`: 17 tasks passed, including API (107 files, 1,015 tests)

## Later Checkpoints

### Inbound federation surface

Classify each route before deletion:

- public entity/profile reads need a mapped ATProto/AppView replacement;
- membership request/approval must move through the group-authority and consent
  seams without losing caller authorization;
- agreement signature commands need a durable inter-cooperative replacement;
  and
- hub register/notify must be proven unused or replaced.

Only after the mounted routes are gone may RFC 9421 signing and the
cross-instance HTTP-signature tests retire.

### Tier 2 private records

Do not remove the table, service, route, or adapter while `private-record` is
the default writer or while retained source rows are the rollback/correction
authority. V12-S01, V12-S02, V12-S04, and V12-S05 remain open. The copy ledger
is migration tooling, not cutover approval.

### Governance labels

Do not remove labels merely because they predate V12. They remain a public
notification and moderation surface. Retirement requires a reviewed
`$labeler`, public-anchor, or equivalent contract that preserves public outcome
behavior without exposing private governance.

### Cooperative links

Do not remove an active user workflow until recursive space membership or
another Layer 2 authority model owns the same relationship and lifecycle.

### Local development substrate

Retire local PDS/PLC/provisioning pieces only after the development and test
commands use the real disposable PDS/PLC harness by default. Keep blob storage
as a separate decision because local filesystem blobs may remain a valid
storage adapter even after the local PDS retires.

## Completion Criteria

Phase 6 completes when every checklist item is either removed with its V12
replacement verified or explicitly reclassified as a retained V12 component.
No checkpoint may weaken authentication, discard the only Tier 2 authority
copy, remove a user-visible workflow without replacement, or claim an open
signoff decision.
