# @coopsource/spaces-consumer

V12 consumer boundary for draft ATProto permissioned-space data. The package
remains disabled by default and is intentionally capability-shaped:

- `GroupDirectoryPort` answers direct and resolved membership questions.
- `SpaceCredentialStore` and `SpaceCredentialManager` shape short-lived
  per-space credential refresh without committing to a live upstream issuer.
  `KyselySpaceCredentialStore` persists the short-lived cache across API
  process restarts.
- `TwoStepSpaceCredentialIssuer` models the draft upstream grant exchange
  (`getDelegationToken` -> `getSpaceCredential`) behind transport-level client
  ports.
- `DidSpaceAuthorityResolver` resolves the authority's
  `#atproto_space_host` and `#atproto_space` entries with the specified
  `#atproto_pds` and `#atproto` fallbacks.
- `ClientAttestationProvider` separates short-lived attestation construction
  from production signing-key custody.
- `CredentialedPermissionedRepoPort` acquires a space credential before each
  sync batch and delegates record verification/checkpointing to the wrapped
  repo adapter.
- `PermissionedRepoPort` watches and syncs verified permissioned records.
- `XrpcPermissionedRepoPort` implements the pinned draft read path with
  `listRepos`, `listRepoOps`, periodic sweeps, staged checkpoints, writer
  removal, and replaceable commit/CAR/blob verification.
- `PermissionedRecordWritePort` creates records in a permissioned space behind
  a replaceable adapter. The current API uses a legacy `private_record` adapter
  behind this port for runtime writes. `XrpcPermissionedRecordWritePort` targets
  the draft Proposal 0016 `com.atproto.space.createRecord/putRecord/deleteRecord`
  XRPC write surface and is tested as real HTTP client code, but it is not the
  default until CSN has a real author OAuth session provider for `space:`
  scopes.
- `SpacesConsumer` applies the current CSN membership acceptance policy after
  its repo port returns a protocol-verified batch.

The old mechanism sketches (`NotificationSubscriber`, `RepoPuller`, `EcmhVerifier`, `ArbiterMemberList`) remain source-level scaffolding for tests and future adapters, but they are not exported from the package root.

## Adapter Sketch Policy

The executable sketches now live at the stable-port level:

- `DenyAllGroupDirectoryPort` and `StaticGroupDirectoryPort` sketch the Group Directory contract.
- `InMemoryPermissionedRepoPort` and `FailClosedPermissionedRepoPort` sketch permissioned watch/sync/verification/checkpoint behavior.
- `InMemorySpaceCredentialStore`, `KyselySpaceCredentialStore`, and
  `SpaceCredentialManager` model expiration, refresh-per-batch, near-expiry
  refresh, persistent short-lived caching, and invalidation after member-list
  changes for future permissioned-data adapters.
- `TwoStepSpaceCredentialIssuer` is the executable draft credential flow. It
  sequences delegation-token issuance before space-credential exchange, derives
  credential expiry from either response metadata or JWT `exp`, and keeps
  unstable XRPC details behind `SpaceDelegationTokenClientPort` and
  `SpaceCredentialExchangeClientPort`.
- `Proposal0016ClientAttestationProvider` creates the pinned ES256 JWT
  header/claims and delegates signing to `ClientAttestationJwtSigner`.
  Production JWKS publication and key custody remain intentionally unwired.
- `CredentialedPermissionedRepoPort` is the local Phase 4 harness wrapper. It
  proves the credential manager gates sync batches before the repo port returns
  verified records; the first covered collection is
  `network.coopsource.governance.vote`.
- `InMemoryPermissionedRecordWritePort` sketches the write contract with
  structured record locations, duplicate-location rejection, and an awaited
  async write boundary for adapter-fidelity tests.
- `XrpcPermissionedRecordWritePort` is the draft upstream write adapter. It
  posts `createRecord`, `putRecord`, and `deleteRecord` to the authoring user's
  PDS, requires an OAuth authorization header, validates returned permissioned
  record URIs against the requested space/repo/collection, and maps draft XRPC
  errors from the pinned Lexicons to typed write failures. Membership is not a
  record-write protocol error in the pinned baseline.
- `KyselyPermissionedCheckpointStore` sketches durable space-level checkpoint storage against the current PoC table.
- `KyselyPermissionedReplicaStore` persists per-writer revisions and verified
  records atomically. `KyselyPermissionedNotificationRegistrationStore`
  persists registration expiry.
- `@coopsource/arbiter-client` provides the Stage 2A CSN-backed `CsnDbGroupDirectoryPort`.

Mechanism-specific code is still useful, but it belongs behind these ports. A
real notification client, repo puller, verifier, authority client, or
permissioned-data sync implementation should be documented as a
`PermissionedRepoPort` or `GroupDirectoryPort` adapter, not as a new
application-facing dependency.

See `docs/plans/2026-05-17-v11-spaces-consumer-adapter-architecture.md` for the adapter families and documentation rule.

## Public Surface

| Concern                      | Public API                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Space identity               | `SpaceRef`                                                                                                       |
| Permissioned record identity | `PermissionedRecordLocation`                                                                                     |
| Verified records             | `VerifiedPermissionedRecord`, `VerifiedPermissionedChanges`                                                      |
| Group Directory              | `GroupDirectoryPort`, `DenyAllGroupDirectoryPort`, `StaticGroupDirectoryPort`                                    |
| Space credentials            | `SpaceCredentialStore`, `InMemorySpaceCredentialStore`, `KyselySpaceCredentialStore`, `SpaceCredentialManager`, `TwoStepSpaceCredentialIssuer` |
| Authority discovery          | `DidSpaceAuthorityResolver`, `SpaceAuthorityResolutionError`                                             |
| Client attestation           | `ClientAttestationProvider`, `Proposal0016ClientAttestationProvider`, `ClientAttestationJwtSigner`       |
| Permissioned sync            | `PermissionedRepoPort`, `XrpcPermissionedRepoPort`, `XrpcPermissionedSyncClient`, `InMemoryPermissionedRepoPort`, `FailClosedPermissionedRepoPort` |
| Commit/recovery/blob verification | `Proposal0016CommitVerifier`, `XrpcCarPermissionedRepoRecoveryPort`, `XrpcPermissionedBlobVerifier` |
| Replica/registration state   | `KyselyPermissionedReplicaStore`, `KyselyPermissionedNotificationRegistrationStore` |
| Credentialed sync            | `CredentialedPermissionedRepoPort`                                                                               |
| Permissioned writes          | `PermissionedRecordWritePort`, `InMemoryPermissionedRecordWritePort`, `XrpcPermissionedRecordWritePort`          |
| Checkpoints                  | `PermissionedCheckpointStore`, `KyselyPermissionedCheckpointStore`                                               |
| Orchestration                | `SpacesConsumer`                                                                                                 |

Permissioned records use structured locations, not `AtUri`. The pinned
Proposal 0016 draft currently serializes them under
`at://{authority}/space/...`; parsing and formatting stay behind helpers
because the proposal is not final.

## Security Boundaries

- Protocol sync and CSN acceptance are separate gates. A real repo adapter must
  verify the pinned commit format, LtHash, CIDs/CAR, author identity, and
  schema before returning records.
- `SpacesConsumer` then accepts a record only when strict CSN group resolution
  returns `ok: true`, `partial: false`, `stale: false`, no `missingSpaces`,
  and the author DID is present in `members`.
- Verification failures, indeterminate group policy, and handler errors do not
  commit checkpoints.
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
  spaces: parseSpacesConsumerRefs(config.SPACES_CONSUMER_SPACES),
  permissionedRepo,
});
```

The runtime projects verified proposal/vote records into the existing API read
model, but remains disabled and subscribes to no spaces by default. Select
`PERMISSIONED_REPO_READER_MODE=draft-xrpc` and configure
`SPACES_CONSUMER_SPACES` only in an explicit draft exercise.

The API does not yet expose/register an inbound notification endpoint because
the pinned URL-derived service-auth audience conflicts with CSN's DID-audience
verifier. Periodic sweeps provide correctness. Public DID/account event
ingestion is implemented with host-scoped durable account state. The pinned
atproto `getRepo` handler remains unimplemented; the reader fails closed when
full recovery is required.

`runPermissionedConformanceProbe` and the API
`probe:permissioned-conformance` command provide a non-destructive by default,
abort-aware differential harness for the pinned atproto PR #5187 and
HappyView `2.12.0-dev.2` profiles. Notification registration is the explicit
mutating opt-in. The harness does not change the production reader target or
accept HappyView's unsigned commit shape.
