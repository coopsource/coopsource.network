# V11 Stage 2 Group Authority Adapter

> **Date:** May 17, 2026
> **Branch:** `codex/v11-atproto-alignment-planning`
> **Purpose:** Start Stage 2 with replaceable CSN-backed group authority adapters while upstream Arbiter XRPC remains unsettled.

## Summary

Stage 2 implements `@coopsource/arbiter-client` as an Arbiter compatibility layer. It does not claim that the upstream Arbiter XRPC API or final role-space wire shape is settled.

The package gives CSN app-facing authority boundaries:

- `membersSpace(cooperativeDid)` for the cooperative members space.
- `roleSpace(cooperativeDid, role)` for temporary role-space references.
- `CsnDbGroupAuthorityPort` for strict membership and role checks against current CSN tables.
- `CsnDbGroupAuthorityCommandPort` for cooperative provisioning, member changes, role changes, and temporary audit reads.

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

Stage 2A implemented:

- New package `packages/arbiter-client`.
- `CsnDbGroupAuthorityPort` implementing the stable `GroupAuthorityPort` contract.
- API spaces-consumer dispatch now uses `CsnDbGroupAuthorityPort` when enabled.
- `SPACES_CONSUMER_ENABLED=false` remains the default.
- Permissioned repo verification still defaults fail-closed unless local unsafe dev mode is explicitly enabled.
- Boolean env parsing uses explicit string booleans so `SPACES_CONSUMER_ENABLED=false` and `UNSAFE_ACCEPT_UNVERIFIED_PERMISSIONED_DATA=false` remain false.
- API and dev Dockerfiles include the new workspace packages needed by the spaces-consumer dispatch path.
- Shutdown awaits `stopSpacesConsumer()` before tearing down shared resources.

Stage 2B/2C implemented on this branch:

- `GroupAuthorityCommandPort` and `CsnDbGroupAuthorityCommandPort`.
- Temporary cooperative provisioning returns the cooperative DID as the arbiter DID.
- Temporary role-space creation validates role skeys and returns `roleSpace()`.
- `addMember`, `removeMember`, `addRoleMember`, `removeRoleMember`, and `setMemberRoles` mutate current CSN tables behind the command-port boundary.
- Changed commands are recorded in `fact_log` with `entity_type = 'v11.groupAuthority'`; `operator_audit_log` remains scoped to legacy operator PDS writes.
- `MembershipService` role and removal writes use the command port.
- Setup bootstrap, public invitation acceptance, `AuthService.register`, and network join/leave use the command port for membership and role authority.
- Migrated paths no longer create cooperative-owned V9 `memberApproval` records.
- Stage 2D replaces member-authored `network.coopsource.org.membership` evidence with `network.coopsource.org.memberConsent`.
- Invitation acceptance audit uses the inviter as the authority actor; the joining member remains consent evidence, not the actor who added themself.
- Federation membership approval now writes through `GroupAuthorityCommandPort` instead of creating `memberApproval` records.
- Federation membership requests carry caller-supplied consent evidence instead of minting member-owned records on the receiving instance.
- Appview member-consent hooks no longer treat member-authored records or `memberApproval` records as active authority. Member-authored records only attach evidence URIs to existing command-created rows.
- Transactional route flows request a transaction-scoped command port from the container instead of constructing the CSN adapter directly.

Deferred:

- Real Arbiter XRPC client.
- Cooperative controlled-DID provisioning.
- Creating, deleting, or configuring real Arbiter spaces.
- Migrating `MembershipService` reads to space/Arbiter operations.
- Replacing `fact_log` audit projection with real `$admin` audit consumption.
- Retiring the bilateral membership tables and lexicons.

## Tests

Covered in `@coopsource/arbiter-client`:

- Members and role space helper output.
- Empty role skey rejection.
- Active, pending, and invalidated membership decisions.
- Role-space checks requiring a matching role.
- Keyset pagination across same-timestamp membership rows.
- Fail-closed behavior for unknown spaces and malformed cursors.
- Command-port add/reactivate/remove member behavior.
- Role add/remove/set behavior and idempotent role replacement.
- Active-member prerequisite for role membership.
- Temporary audit pagination over `fact_log`.

API dispatch tests continue to cover disabled startup, production rejection of unsafe unverified mode, enabled health, and stop/reset behavior.

Verified:

- `pnpm --filter @coopsource/arbiter-client test`
- `pnpm --filter @coopsource/arbiter-client lint`
- `pnpm --filter @coopsource/arbiter-client build`
- `pnpm --filter @coopsource/api exec vitest run tests/config.test.ts tests/spaces-consumer-dispatch.test.ts tests/relay-consumer.test.ts`
- `pnpm --filter @coopsource/api build`
- `pnpm build`
- `git diff --check`

`pnpm build` still emits the existing Svelte `$state(data...)` warnings from the web app, but the build completes.

Attempted `pnpm --filter @coopsource/api exec vitest run tests/members.test.ts`, but the local test database was not migrated and failed during `truncateAllTables()` on missing table `tax_form_1099_patr` before route code ran.

## Next Work

The next slice should use the command boundary to prepare Stage 3 deliberately:

- Keep the appview member-consent evidence hook as a non-authoritative projection until Stage 3, then replace it with Arbiter space consumption.
- Start Stage 3 read migration only after read/write command surfaces agree on source revision, audit semantics, and DID-rotation handling.
- Decide whether the temporary `membership.member_record_uri/member_record_cid` projection columns need neutral evidence names before Stage 3 migrations begin.
