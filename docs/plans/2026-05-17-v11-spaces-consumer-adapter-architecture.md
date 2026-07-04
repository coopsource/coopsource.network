> **Status (2026-07-04): executed.** This design shipped as code on `main` (`packages/spaces-consumer`, `packages/arbiter-client`, the DB baseline). Implementation record; `ARCHITECTURE-V12.md` is canonical.

# V11 Spaces Consumer Adapter Architecture

> **Date:** May 17, 2026  
> **Branch:** `codex/v11-atproto-alignment-planning`  
> **Purpose:** Document what replaces the original mechanism sketches after Stage 1 moved to stable ports.

## Summary

Stage 1 no longer treats notification subscribers, per-member repo pullers, ECMH verifiers, or raw Arbiter member-list clients as application-facing architecture. Those mechanisms still matter, but they live behind two stable ports:

- `GroupDirectoryPort`: direct and resolved membership authority.
- `PermissionedRepoPort`: permissioned watch/sync/verification/checkpoint.

The stable-port adapters are the new executable sketches. They document the behavior CSN needs while keeping unsettled ATProto permissioned-data details out of app-facing code.

## Group Directory Adapters

Current sketches:

- `DenyAllGroupDirectoryPort`: fail-closed fixture/default for tests and disabled paths.
- `StaticGroupDirectoryPort`: deterministic test/development fixture with direct DID, local-space, and remote-space members.
- `CsnDbGroupDirectoryPort` in `@coopsource/arbiter-client`: Stage 2A PoC adapter backed by current CSN `membership` and `membership_role` tables.

Expected real adapters:

- **Arbiter XRPC adapter:** wraps the upstream Arbiter API when it is usable. It should return membership decisions with snapshot or source-revision markers and support strict consistency.
- **CSN temporary Group Directory adapter:** acceptable for the PoC if upstream Arbiter work lags. It must implement the same port and be replaceable without changing `SpacesConsumer` or app services.
- **Projection-backed adapter:** allowed only for `consistency: 'projection-ok'`; strict reads must fail closed or consult live authority.

Strict checks accept records only when resolved membership returns `ok: true`, `partial: false`, `stale: false`, no `missingSpaces`, and the author DID appears in `members`.

Stage 2A uses `CsnDbGroupDirectoryPort` for API wiring when `SPACES_CONSUMER_ENABLED=true`. The temporary role-space convention uses canonical `spaceKey` values such as `roles/board`, `roles/custom/<slug>`, and `classes/worker`; it is isolated in `@coopsource/arbiter-client` so the final Arbiter role-space type can replace it without changing consumers.

## Permissioned Repo Adapters

Current sketches:

- `InMemoryPermissionedRepoPort`: deterministic fixture for watch/sync/checkpoint behavior.
- `FailClosedPermissionedRepoPort`: no-record, no-checkpoint default for safe startup.
- `KyselyPermissionedCheckpointStore`: durable space-level checkpoint storage using the current PoC cursor table.

Expected real adapters:

- **Notification-backed adapter:** subscribes to Arbiter or space-owner change notifications, maps them to `PermissionedChangeHint`, and uses `sync()` to return verified changes.
- **Polling/resync adapter:** periodically checks space state and triggers full resync when a checkpoint cannot be verified.
- **Upstream permissioned-data adapter:** wraps the finalized ATProto permissioned repo sync APIs and verifier. URI scheme, cursor shape, and commit-verification details remain internal.

`sync()` must not accept `candidateAuthors`; member-driven pull is an adapter implementation detail. The consumer commits checkpoints only after a verified batch has been fully accepted, rejected, or quarantined.

## Documentation Rule

Future mechanism-specific work should be documented as an adapter behind one of the stable ports, not as a new public dependency. If a mechanism detail needs to cross the port boundary, first update the port design and tests to prove it is a durable CSN capability rather than an upstream wire-shape assumption.
