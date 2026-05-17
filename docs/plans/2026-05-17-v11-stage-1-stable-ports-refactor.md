# V11 Stage 1 Stable Ports Refactor Plan

> **Date:** May 17, 2026  
> **Branch:** `codex/v11-atproto-alignment-planning`  
> **Purpose:** Turn the Stage 1 spaces-consumer package from a protocol-mechanism sketch into a stable capability boundary before Stage 1 moves forward again.

## Summary

The existing Stage 1 implementation is useful and should not be thrown away. Its fail-closed sketches, health surface, Kysely cursor store, and defense-in-depth member cross-check are all valuable. The refactor should keep those pieces but move the public package boundary to stable ports:

- `GroupAuthorityPort` for membership, role, recursive membership, and strict membership reads.
- `PermissionedRepoPort` for sync, resync, record verification, and opaque cursor handling.

The low-level `NotificationSubscriber`, `RepoPuller`, `EcmhVerifier`, and `ArbiterMemberList` interfaces may remain, but only as internal adapter pieces or test fixtures.

## Key Changes

### Public Types

- Add a permissioned record location type that is not `AtUri`:

```ts
export interface PermissionedRecordLocation {
  readonly space: SpaceRef;
  readonly authorDid: DID;
  readonly collection: string;
  readonly rkey: string;
}
```

- Replace public `PulledRecord.uri: AtUri` with `location: PermissionedRecordLocation` plus optional `uri?: PermissionedUri` only when the upstream scheme is finalized.
- Add opaque cursor types:

```ts
export type PermissionedCursor = Brand<string, 'PermissionedCursor'>;
export type MembershipSnapshotId = Brand<string, 'MembershipSnapshotId'>;
```

If branded helpers do not yet exist in `@coopsource/common`, keep constructors test-only and avoid unsafe casts in production code.

### `GroupAuthorityPort`

Public interface shape:

```ts
export interface GroupAuthorityPort {
  isMember(args: {
    space: SpaceRef;
    did: DID;
    consistency: 'projection-ok' | 'strict';
  }): Promise<MembershipDecision>;

  resolveMembership(args: {
    space: SpaceRef;
    cursor?: PermissionedCursor;
    consistency: 'projection-ok' | 'strict';
  }): Promise<MembershipSnapshotPage>;
}
```

Required result fields:

- `MembershipDecision`: `ok`, `isMember`, optional `snapshotId`, optional `sourceRevision`, optional `stale`.
- `MembershipSnapshotPage`: `members`, optional `cursor`, optional `snapshotId`, optional `sourceRevision`.

Stage 1 adapter:

- Wrap current `ArbiterMemberList` for tests.
- Keep `DenyAllArbiterMemberList` as the fail-closed source.
- Do not require a complete in-memory member list outside test adapters.

### `PermissionedRepoPort`

Public interface shape:

```ts
export interface PermissionedRepoPort {
  sync(args: {
    space: SpaceRef;
    cursor?: PermissionedCursor;
  }): Promise<VerifiedPermissionedChanges>;
}
```

Required result fields:

- `records`: verified records with structured permissioned locations.
- `cursor`: opaque adapter-owned cursor.
- `verification`: `verified`, `resynced`, or `failed-closed`.
- `sourceRevision` or equivalent optional marker when the adapter has one.

Stage 1 adapter:

- Internally compose existing `NotificationSubscriber`, `RepoPuller`, `EcmhVerifier`, and `CursorStore` sketches.
- Rename public verification language away from "ECMH batch digest" to "permissioned repo verification".
- Keep `UnsafeAlwaysOkEcmhVerifier` test/dev-only and avoid exporting it as the default path for application code.

### Consumer Orchestration

- `SpacesConsumer` should depend on `GroupAuthorityPort` and `PermissionedRepoPort` at its public boundary.
- Low-level notification handlers can remain internal.
- Cursor advancement should be owned by the repo adapter, not by business logic comparing rev strings.
- Per-record member cross-check remains mandatory before `onAccepted`.

### Health Surface

Keep current health counters, but rename digest-specific terminology:

- `digestMismatches` -> `verificationFailures`
- Keep `memberCrossCheckFailures`, `recordsAccepted`, `recordsRejected`, `errorCount`.
- Add `resyncsTriggered` if the adapter can report it.

## Tests

Update or add tests for:

- Fail-closed default accepts no records.
- `PermissionedRepoPort` returns opaque cursors and does not expose rev ordering.
- Structured permissioned locations replace `AtUri`.
- Verification failure does not call `onAccepted` and increments `verificationFailures`.
- Member cross-check still drops records from non-members.
- Group authority supports paginated snapshots in test fixtures.
- Existing app wiring starts disabled with `SPACES_CONSUMER_ENABLED=false`.

## Acceptance Criteria

- No exported Stage 1 type requires `AtUri` for permissioned records.
- No exported Stage 1 type requires notification-batch digest semantics.
- No application-facing Stage 1 code depends on `ArbiterMemberList.list(space): DID[]`.
- Existing fail-closed behavior remains intact.
- Stage 1 remains safe to run with no real upstream protocol implementations wired.
