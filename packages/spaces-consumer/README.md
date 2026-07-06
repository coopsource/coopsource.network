# @coopsource/spaces-consumer

Stage 1 V11 consumer for ATProto permissioned-space data. The public package boundary is intentionally capability-shaped:

- `GroupDirectoryPort` answers direct and resolved membership questions.
- `SpaceCredentialStore` and `SpaceCredentialManager` shape short-lived
  per-space credential refresh without committing to a live upstream issuer.
- `TwoStepSpaceCredentialIssuer` models the draft upstream grant exchange
  (`getMemberGrant` -> `getSpaceCredential`) behind transport-level client
  ports.
- `CredentialedPermissionedRepoPort` acquires a space credential before each
  sync batch and delegates record verification/checkpointing to the wrapped
  repo adapter.
- `PermissionedRepoPort` watches and syncs verified permissioned records.
- `PermissionedRecordWritePort` creates records in a permissioned space behind
  a replaceable adapter. The current API uses a legacy `private_record` adapter
  behind this port for runtime writes. `XrpcPermissionedRecordWritePort` targets
  the draft Proposal 0016 `com.atproto.space.createRecord/deleteRecord` XRPC
  write surface and is tested as real HTTP client code, but it is not the
  default until CSN has a real author OAuth session provider for `space:`
  scopes.
- `SpacesConsumer` cross-checks each verified record author before emitting it.

The old mechanism sketches (`NotificationSubscriber`, `RepoPuller`, `EcmhVerifier`, `ArbiterMemberList`) remain source-level scaffolding for tests and future adapters, but they are not exported from the package root.

## Adapter Sketch Policy

The executable sketches now live at the stable-port level:

- `DenyAllGroupDirectoryPort` and `StaticGroupDirectoryPort` sketch the Group Directory contract.
- `InMemoryPermissionedRepoPort` and `FailClosedPermissionedRepoPort` sketch permissioned watch/sync/verification/checkpoint behavior.
- `InMemorySpaceCredentialStore` and `SpaceCredentialManager` model
  expiration, refresh-per-batch, near-expiry refresh, and invalidation after
  member-list changes for future permissioned-data adapters.
- `TwoStepSpaceCredentialIssuer` is the executable draft credential flow. It
  sequences member-grant issuance before space-credential exchange, derives
  credential expiry from either response metadata or JWT `exp`, and keeps
  unstable XRPC details behind `SpaceMemberGrantClientPort` and
  `SpaceCredentialExchangeClientPort`.
- `CredentialedPermissionedRepoPort` is the local Phase 4 harness wrapper. It
  proves the credential manager gates sync batches before the repo port returns
  verified records; the first covered collection is
  `network.coopsource.governance.vote`.
- `InMemoryPermissionedRecordWritePort` sketches the write contract with
  structured record locations, duplicate-location rejection, and an awaited
  async write boundary for adapter-fidelity tests.
- `XrpcPermissionedRecordWritePort` is the draft upstream write adapter. It
  posts to the authoring user's PDS, requires an OAuth authorization header,
  validates returned permissioned record URIs against the requested
  space/repo/collection, and maps draft XRPC errors such as `SpaceNotFound` and
  `NotAMember` to typed write failures.
- `KyselyPermissionedCheckpointStore` sketches durable space-level checkpoint storage against the current PoC table.
- `@coopsource/arbiter-client` provides the Stage 2A CSN-backed `CsnDbGroupDirectoryPort`.

Mechanism-specific code is still useful, but it belongs behind these ports. A real notification client, repo puller, verifier, Arbiter client, or permissioned-data sync implementation should be documented as a `PermissionedRepoPort` or `GroupDirectoryPort` adapter, not as a new application-facing dependency.

See `docs/plans/2026-05-17-v11-spaces-consumer-adapter-architecture.md` for the adapter families and documentation rule.

## Public Surface

| Concern                      | Public API                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Space identity               | `SpaceRef`                                                                                                       |
| Permissioned record identity | `PermissionedRecordLocation`                                                                                     |
| Verified records             | `VerifiedPermissionedRecord`, `VerifiedPermissionedChanges`                                                      |
| Group Directory              | `GroupDirectoryPort`, `DenyAllGroupDirectoryPort`, `StaticGroupDirectoryPort`                                    |
| Space credentials            | `SpaceCredentialStore`, `InMemorySpaceCredentialStore`, `SpaceCredentialManager`, `TwoStepSpaceCredentialIssuer` |
| Permissioned sync            | `PermissionedRepoPort`, `InMemoryPermissionedRepoPort`, `FailClosedPermissionedRepoPort`                         |
| Credentialed sync            | `CredentialedPermissionedRepoPort`                                                                               |
| Permissioned writes          | `PermissionedRecordWritePort`, `InMemoryPermissionedRecordWritePort`, `XrpcPermissionedRecordWritePort`          |
| Checkpoints                  | `PermissionedCheckpointStore`, `KyselyPermissionedCheckpointStore`                                               |
| Orchestration                | `SpacesConsumer`                                                                                                 |

Permissioned records use structured locations, not `AtUri`. The permissioned URI scheme is still unsettled upstream, so no public Stage 1 type requires `at://` for permissioned-space data.

## Security Boundaries

- `SpacesConsumer` accepts a record only when strict resolved membership returns `ok: true`, `partial: false`, `stale: false`, no `missingSpaces`, and the author DID is present in `members`.
- Verified records from non-members are rejected or quarantined, then checkpointed after the batch is fully handled.
- Verification failures, indeterminate membership, and handler errors do not commit checkpoints.
- API wiring defaults disabled. When explicitly enabled, membership checks use `CsnDbGroupDirectoryPort` and permissioned repo verification remains fail-closed.
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
  unsafeAcceptUnverifiedPermissionedData:
    config.UNSAFE_ACCEPT_UNVERIFIED_PERMISSIONED_DATA,
  db: container.db,
  spaces: [],
});
```

Stage 1 remains log-only and subscribes to no real spaces by default. Stage 2A wires a CSN-backed Group Directory adapter; real upstream permissioned-data and Arbiter adapters land after those protocol details stabilize.
