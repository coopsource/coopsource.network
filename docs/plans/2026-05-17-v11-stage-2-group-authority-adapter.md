# V11 Stage 2A Group Authority Adapter

> **Date:** May 17, 2026
> **Branch:** `codex/v11-atproto-alignment-planning`
> **Purpose:** Start Stage 2 with a replaceable CSN-backed `GroupAuthorityPort` adapter while upstream Arbiter XRPC remains unsettled.

## Summary

Stage 2A implements `@coopsource/arbiter-client` as an Arbiter compatibility layer. It does not claim that the upstream Arbiter XRPC API or final role-space wire shape is settled.

The package gives CSN one app-facing authority boundary:

- `membersSpace(cooperativeDid)` for the cooperative members space.
- `roleSpace(cooperativeDid, role)` for temporary role-space references.
- `CsnDbGroupAuthorityPort` for strict membership and role checks against current CSN tables.

This lets the spaces consumer move off deny-all membership wiring without exposing current PostgreSQL tables or speculative Arbiter API details to application code.

## Adapter Behavior

- Members space: `{ arbiter: cooperativeDid, type: 'network.coopsource.org.cooperative', skey: 'members' }`.
- Temporary role space: `{ arbiter: cooperativeDid, type: 'network.coopsource.org.role', skey: role }`.
- Active authority comes from `membership.status = 'active'` and `membership.invalidated_at is null`.
- Role authority additionally requires a matching `membership_role.role`.
- `projection-ok` and `strict` both use the same table-backed authority for this PoC adapter.
- Unknown spaces and malformed cursors fail closed.
- Membership pagination uses an opaque cursor over `membership.indexed_at` and `membership.id`.
- `sourceRevision` is derived from `membership.indexed_at`, plus `membership_role.indexed_at` for role checks.

## Integration Status

Implemented:

- New package `packages/arbiter-client`.
- `CsnDbGroupAuthorityPort` implementing the stable `GroupAuthorityPort` contract.
- API spaces-consumer dispatch now uses `CsnDbGroupAuthorityPort` when enabled.
- `SPACES_CONSUMER_ENABLED=false` remains the default.
- Permissioned repo verification still defaults fail-closed unless local unsafe dev mode is explicitly enabled.
- Boolean env parsing uses explicit string booleans so `SPACES_CONSUMER_ENABLED=false` and `UNSAFE_ACCEPT_UNVERIFIED_PERMISSIONED_DATA=false` remain false.
- API and dev Dockerfiles include the new workspace packages needed by the spaces-consumer dispatch path.
- Shutdown awaits `stopSpacesConsumer()` before tearing down shared resources.

Deferred:

- Real Arbiter XRPC client.
- Cooperative controlled-DID provisioning.
- Creating, deleting, or configuring spaces.
- Migrating `MembershipService` writes to space/Arbiter operations.
- Retiring the bilateral membership tables and lexicons.

## Tests

Covered in `@coopsource/arbiter-client`:

- Members and role space helper output.
- Empty role skey rejection.
- Active, pending, and invalidated membership decisions.
- Role-space checks requiring a matching role.
- Keyset pagination across same-timestamp membership rows.
- Fail-closed behavior for unknown spaces and malformed cursors.

API dispatch tests continue to cover disabled startup, production rejection of unsafe unverified mode, enabled health, and stop/reset behavior.

Verified:

- `pnpm --filter @coopsource/arbiter-client test`
- `pnpm --filter @coopsource/arbiter-client lint`
- `pnpm --filter @coopsource/arbiter-client build`
- `pnpm --filter @coopsource/api exec vitest run tests/config.test.ts tests/spaces-consumer-dispatch.test.ts`
- `pnpm --filter @coopsource/api build`
- `pnpm build`

`pnpm build` still emits the existing Svelte `$state(data...)` warnings from the web app, but the build completes.

## Next Work

The next Stage 2 slice should define the write-side adapter boundary before changing `MembershipService`: cooperative provisioning, add/remove member, add/remove role member, and audit trail readback. Those operations should remain in `@coopsource/arbiter-client` and be backed by CSN tables only until real Arbiter XRPC semantics are available.
