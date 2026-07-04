# V11 Stage 1 Stable Ports Refactor Plan

> **Date:** May 17, 2026  
> **Branch:** `codex/v11-atproto-alignment-planning`  
> **Purpose:** Move Stage 1 from protocol-mechanism sketches to stable V11 capability ports.

## Summary

Stage 1 should expose stable ports, not guessed permissioned-data wire mechanics. Keep the useful as-built pieces: fail-closed defaults, log-only API wiring, health reporting, Kysely-backed checkpoint storage, and strict per-record member cross-checks.

Application-facing code depends on:

- `GroupDirectoryPort` for direct/resolved membership decisions.
- `PermissionedRepoPort` for watching, syncing, verifying, and checkpointing permissioned records.

The low-level `NotificationSubscriber`, `RepoPuller`, `EcmhVerifier`, and `ArbiterMemberList` sketches may remain in source for tests and future adapters, but they are not package-root exports.

The replacement sketch layer is the stable-port adapter layer: fail-closed and in-memory `GroupDirectoryPort` / `PermissionedRepoPort` implementations document the behavior CSN needs, while concrete upstream mechanisms stay behind those adapters.

See `docs/plans/2026-05-17-v11-spaces-consumer-adapter-architecture.md` for the adapter policy and expected real adapter families.

## Public API Shape

Permissioned records use structured locations, not `AtUri`:

```ts
interface PermissionedRecordLocation {
  space: SpaceRef;
  authorDid: DID;
  collection: string;
  rkey: string;
}

interface VerifiedPermissionedRecord {
  location: PermissionedRecordLocation;
  cid: CID;
  record: unknown;
  sourceRevision?: string;
}
```

Opaque types remain distinct:

```ts
type PermissionedCheckpoint = string & { readonly __brand: 'PermissionedCheckpoint' };
type MembershipCursor = string & { readonly __brand: 'MembershipCursor' };
type MembershipSnapshotId = string & { readonly __brand: 'MembershipSnapshotId' };
```

Membership authority:

```ts
interface GroupDirectoryPort {
  listSpaces(args: { arbiterDid: DID; resolverDepth?: number }): Promise<SpaceSummary[]>;
  getSpaceConfig(args: SpaceRef): Promise<SpaceConfigResult>;
  getDirectSpaceMembers(args: SpaceRef): Promise<DirectSpaceMember[]>;
  resolveSpaceMembers(args: SpaceRef & { resolverDepth?: number }): Promise<ResolvedMembers>;
}
```

Permissioned repo sync:

```ts
interface PermissionedRepoPort {
  watch(args: {
    spaces: readonly SpaceRef[];
    onChange: (hint: PermissionedChangeHint) => Promise<void> | void;
  }): Promise<PermissionedWatchHandle>;

  sync(args: {
    space: SpaceRef;
    hint?: PermissionedChangeHint;
  }): Promise<VerifiedPermissionedChanges>;

  commitCheckpoint(args: {
    space: SpaceRef;
    checkpoint: PermissionedCheckpoint;
  }): Promise<void>;
}
```

`sync()` does not accept `candidateAuthors`; member-driven pull stays internal to adapters if a temporary implementation needs it.

## Processing Rules

- `SpacesConsumer` accepts a record only when strict membership returns `ok: true`, `isMember: true`, and `stale !== true`.
- Verified non-member records are rejected or quarantined and still allow checkpoint commit after the whole batch is handled.
- Verification failures, stale or errored membership decisions, and thrown handlers do not commit checkpoints.
- `ack()` is not used; the durable boundary is `commitCheckpoint({ space, checkpoint })`.
- Health uses `verificationFailures`, not digest-specific terminology, and tracks `resyncsTriggered`.
- API wiring uses `UNSAFE_ACCEPT_UNVERIFIED_PERMISSIONED_DATA`, rejected in production, for explicit local unverified dev mode.

## Tests

Required tests:

- Public package root exports stable ports and not mechanism sketches.
- Structured permissioned locations replace permissioned `AtUri` usage.
- Fail-closed defaults accept no records and increment `verificationFailures`.
- Verified member records call `onAccepted` and commit checkpoints.
- Verified non-member records call `onRejected` or equivalent quarantine and commit checkpoints.
- Verification failures, indeterminate membership, and thrown handlers do not commit checkpoints.
- Membership pagination uses `MembershipCursor`, not `MembershipSnapshotId`.
- API dispatch starts disabled by default and wires only stable ports when enabled.
- API dispatch rejects `UNSAFE_ACCEPT_UNVERIFIED_PERMISSIONED_DATA` in production and resets health on stop.

## Acceptance Criteria

- No package-root Stage 1 export requires `AtUri` for permissioned records.
- No package-root Stage 1 export requires notification, per-member pull, or ECMH batch semantics.
- No application-facing Stage 1 code depends on `ArbiterMemberList.list(space): DID[]`.
- Existing Stage 1 behavior remains safe to run with no real upstream protocol implementations wired.

## Implementation Status

Implemented on `codex/v11-atproto-alignment-planning`.

Verified:

- `pnpm build`
- `pnpm --filter @coopsource/arbiter-client test`
- `pnpm --filter @coopsource/arbiter-client lint`
- `pnpm --filter @coopsource/arbiter-client build`
- `pnpm --filter @coopsource/spaces-consumer lint`
- `pnpm --filter @coopsource/spaces-consumer test`
- `pnpm --filter @coopsource/api exec vitest run tests/spaces-consumer-dispatch.test.ts`

Follow-on Stage 2A status:

- `@coopsource/arbiter-client` now provides `CsnDbGroupDirectoryPort`, `CsnDbGroupMutationPort`, `membersSpace()`, and `roleSpace()`.
- API dispatch uses the CSN-backed Group Directory adapter when `SPACES_CONSUMER_ENABLED=true`; permissioned repo verification remains fail-closed by default.

Known broader-suite blockers unrelated to this slice:

- `pnpm test` currently fails in `@coopsource/federation` when Docker is unavailable at `unix:///Users/alan/.docker/run/docker.sock`.
- `pnpm --filter @coopsource/api test` currently fails broadly when the local test database lacks newer tables such as `tax_form_1099_patr` and `governance_label`.
