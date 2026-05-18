# @coopsource/spaces-consumer

Stage 1 V11 consumer for ATProto permissioned-space data. The public package boundary is intentionally capability-shaped:

- `GroupAuthorityPort` answers strict membership questions.
- `PermissionedRepoPort` watches and syncs verified permissioned records.
- `SpacesConsumer` cross-checks each verified record author before emitting it.

The old mechanism sketches (`NotificationSubscriber`, `RepoPuller`, `EcmhVerifier`, `ArbiterMemberList`) remain source-level scaffolding for tests and future adapters, but they are not exported from the package root.

## Adapter Sketch Policy

The executable sketches now live at the stable-port level:

- `DenyAllGroupAuthorityPort` and `StaticGroupAuthorityPort` sketch the membership authority contract.
- `InMemoryPermissionedRepoPort` and `FailClosedPermissionedRepoPort` sketch permissioned watch/sync/verification/checkpoint behavior.
- `KyselyPermissionedCheckpointStore` sketches durable space-level checkpoint storage against the current PoC table.
- `@coopsource/arbiter-client` provides the Stage 2A CSN-backed `CsnDbGroupAuthorityPort`.

Mechanism-specific code is still useful, but it belongs behind these ports. A real notification client, repo puller, verifier, Arbiter client, or permissioned-data sync implementation should be documented as a `PermissionedRepoPort` or `GroupAuthorityPort` adapter, not as a new application-facing dependency.

See `docs/plans/2026-05-17-v11-spaces-consumer-adapter-architecture.md` for the adapter families and documentation rule.

## Public Surface

| Concern | Public API |
|---|---|
| Space identity | `SpaceRef` |
| Permissioned record identity | `PermissionedRecordLocation` |
| Verified records | `VerifiedPermissionedRecord`, `VerifiedPermissionedChanges` |
| Membership authority | `GroupAuthorityPort`, `DenyAllGroupAuthorityPort`, `StaticGroupAuthorityPort` |
| Permissioned sync | `PermissionedRepoPort`, `InMemoryPermissionedRepoPort`, `FailClosedPermissionedRepoPort` |
| Checkpoints | `PermissionedCheckpointStore`, `KyselyPermissionedCheckpointStore` |
| Orchestration | `SpacesConsumer` |

Permissioned records use structured locations, not `AtUri`. The permissioned URI scheme is still unsettled upstream, so no public Stage 1 type requires `at://` for permissioned-space data.

## Security Boundaries

- `SpacesConsumer` accepts a record only when strict membership returns `ok: true`, `isMember: true`, and `stale !== true`.
- Verified records from non-members are rejected or quarantined, then checkpointed after the batch is fully handled.
- Verification failures, indeterminate membership, and handler errors do not commit checkpoints.
- API wiring defaults disabled. When explicitly enabled, membership checks use `CsnDbGroupAuthorityPort` and permissioned repo verification remains fail-closed.
- `UNSAFE_ACCEPT_UNVERIFIED_PERMISSIONED_DATA=true` enables local unverified dev mode, is rejected in production, and logs a warning.

## Health Surface

`SpacesConsumer.health()` returns:

- `subscribedSpaces`
- `lastPullAt`
- `recordsAccepted`
- `recordsRejected`
- `verificationFailures`
- `resyncsTriggered`
- `memberCrossCheckFailures`
- `errorCount`
- `startedAt`

`apps/api` exposes this under `/health` as `spacesConsumer`.

## API Wiring

```typescript
await startSpacesConsumer({
  enabled: config.SPACES_CONSUMER_ENABLED,
  unsafeAcceptUnverifiedPermissionedData: config.UNSAFE_ACCEPT_UNVERIFIED_PERMISSIONED_DATA,
  db: container.db,
  spaces: [],
});
```

Stage 1 remains log-only and subscribes to no real spaces by default. Stage 2A wires a CSN-backed group-authority adapter; real upstream permissioned-data and Arbiter adapters land after those protocol details stabilize.
