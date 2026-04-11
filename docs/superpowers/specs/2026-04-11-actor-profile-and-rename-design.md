# Lexicon Fixes + actor.profile Feature + Rename Cleanup — Design Spec

**Date:** 2026-04-11
**Status:** Planned, not started (shelved while other work lands)
**Prior session:** Plan was written and critically reviewed in a 2026-04-11 planning session. Scope and tradeoffs were confirmed with the user via AskUserQuestion.
**Audience:** Future session picking up this work, or reviewer deciding whether to reshape scope
**Tracked in memory:** `project_lexicon_fixes.md` identified the original issues during the 2026-04-10 LEXICONS.md documentation pass.

## Context

Three related issues were identified while writing `packages/lexicons/LEXICONS.md` (2026-04-10):

1. **`network.coopsource.actor.profile` has no JSON schema file.** AuthService writes this record to every new member's PDS (`apps/api/src/services/auth-service.ts:117-125`) with `{ displayName, createdAt }`, but there's no JSON schema under `packages/lexicons/network/coopsource/`. Every other record type written to PDS has a lexicon schema.

2. **`ops.schedule` and `commerce.resource` have code/schema naming mismatches.** The lexicon JSON files define `network.coopsource.ops.schedule` and `network.coopsource.commerce.resource`, but two service-layer string literals still use the obsolete `ops.scheduleShift` and `commerce.sharedResource` collection IDs (`schedule-service.ts:55`, `shared-resource-service.ts:43`), and the TypeScript/DB/frontend type system still says `ScheduleShift`/`SharedResource` throughout (~50 locations).

3. **Lexicon codegen is stale.** `packages/lexicons/src/generated/lexicons.ts` contains 23 of 41 schemas. The other 18 (admin.*, legal.*, finance.*, commerce.*, ops.*) have JSON files but aren't registered at runtime, so the validator doesn't validate them and consumers can't import their TS types. This is pre-existing debt that predates the actor.profile gap.

The user asked for the full expanded scope: a real profile-editing feature (schema + write path + edit UI + firehose indexer), a full rename cleanup across code/DB/types, and the stale codegen folded in. One PR.

## User-confirmed scope (answered during 2026-04-11 planning round 1)

- **Rename scope:** Full rename — everything in the code matches canonical lexicon IDs (`ScheduleShift` → `Schedule`, `SharedResource` → `Resource`). Collection strings, classes, Kysely types, DB tables, Zod schemas, frontend types.
- **actor.profile shape:** Full feature — expanded schema (description, pronouns, website, avatarCid, bannerCid) + write path in AuthService/ProfileService + edit UI with avatar/banner upload + firehose indexer.
- **Codegen:** Regenerate — run `lex:generate`, hand-author new TS types in `types.ts`, update `index.ts` exports, update tests.
- **PR shape:** One PR, single branch.
- **Migrations:** Edit existing migration files in-place (see `feedback_migrations_dev.md` memory). DB is disposable; `make db-reset` at the end. No new migration files stacked on top.

## Tradeoff notes (worth revisiting before execution)

- **Lexicon name semantics.** The canonical lexicon name `ops.schedule` is semantically weaker than `shift` (each record is one time-bounded assignment, not a schedule-as-collection). Same story for `commerce.resource` vs the more descriptive `sharedResource`. This plan renames the CODE to match the lexicon JSON because the user memory says code should be consistent with canonical IDs. **Alternative pivot:** rename the LEXICON JSON instead (`ops.schedule` → `ops.shift`, `commerce.resource` → `commerce.sharedResource`) — smaller diff, better semantics, flips the direction. Worth reconfirming with the user before executing if it's been a while.
- **API route paths stay.** `/api/v1/ops/shifts` and `/api/v1/commerce/resources` are already user-facing and reasonable. Route paths don't have to match lexicon IDs; only wire-level collection strings + type system need alignment.
- **avatarCid / bannerCid as plain `string`, not ATProto `blob`.** Canonical ATProto pattern is `avatar: blob` with `BlobRef { $type: 'blob', ref: { $link: cid }, mimeType, size }`, uploaded via `uploadBlob` XRPC against the member's own PDS. Coopsource's existing blob pipeline (LocalBlobStore + `entity.avatar_cid text` + `/api/v1/blobs/:cid` serving) stores blobs on the instance, not the author's PDS, and uses plain CID strings. Following that pattern keeps actor.profile consistent with cooperative avatar handling; cost is federation gap if a remote instance tries to resolve the blob. **Future work:** full BlobRef handling would need `MemberWriteProxy.uploadBlob` + DPoP-bound XRPC.
- **`description` in lexicon vs `bio` in PG.** PG column is `profile.bio` (pre-existing, V8.3). Lexicon uses `description` to match Bluesky convention. The service layer translates `description ↔ bio` at the boundary. Alternative: rename the PG column to `description`. Rejected because it adds churn across types.ts, frontend `Profile.bio`, and search tsvector in migration 061.
- **Group ordering.** Plan is ordered 1 → 2 → 3 → rename → profile-frontend → 6 on purpose — doing the rename BEFORE the profile frontend keeps commits clean (rename is pure refactor, profile is pure feature). Both touch `apps/web/src/lib/api/types.ts` and `client.ts` in non-overlapping ways.

## Design

### actor.profile lexicon target state

File: `packages/lexicons/network/coopsource/actor/profile.json`

```
network.coopsource.actor.profile (record, key: "self")
  displayName: string  (required, maxLength 64)
  description: string? (maxLength 256)  — the UI calls this "bio"
  pronouns:    string? (maxLength 64)
  website:     string? (maxLength 256)  — no URI format enforcement (users paste without protocol)
  avatarCid:   string? (maxLength 256)  — opaque CID ref served via /api/v1/blobs/{cid}
  bannerCid:   string? (maxLength 256)  — same
  createdAt:   datetime (required)
```

Key `self` (singleton per DID) matches Bluesky's `app.bsky.actor.profile` convention. This is a **schema change from the current code**, which uses `createRecord` with a TID key (`auth-service.ts:117-125`). AuthService + ProfileService switch to `rkey: 'self'` + `putRecord` (upsert).

### profile table new columns

Edited directly into migration `packages/db/src/migrations/058_profile.ts`:

- `pronouns text`
- `website text`
- `banner_cid text`
- `profile_record_cid text`

**No `profile_record_uri` column** — URI is deterministic from `at://{entity_did}/network.coopsource.actor.profile/self`, only CID changes across writes.

### Rename map

| Old | New | Location |
|-----|-----|----------|
| `network.coopsource.ops.scheduleShift` | `network.coopsource.ops.schedule` | wire (service literal, `schedule-service.ts:55`) |
| `network.coopsource.commerce.sharedResource` | `network.coopsource.commerce.resource` | wire (service literal, `shared-resource-service.ts:43`) |
| DB table `schedule_shift` | `schedule` | Kysely + migration 040 |
| DB table `shared_resource` | `resource` | Kysely + migration 046 |
| `ScheduleShiftTable` | `ScheduleTable` | `packages/db/src/schema.ts` |
| `SharedResourceTable` | `ResourceTable` | `packages/db/src/schema.ts` |
| `SharedResourceService` (file + class) | `ResourceService` | `apps/api/src/services/` |
| `sharedResourceService` container key | `resourceService` | `container.ts` |
| `CreateSharedResourceSchema` / `UpdateSharedResourceSchema` | `CreateResourceSchema` / `UpdateResourceSchema` | `packages/common/src/validation.ts` |
| Frontend type `SharedResource` | `Resource` | `apps/web/src/lib/api/types.ts` |
| Frontend type `ScheduleShift` | `Schedule` | `apps/web/src/lib/api/types.ts` |
| API client methods `createSharedResource` etc. | `createResource` etc. | `apps/web/src/lib/api/client.ts` |

**Kept as-is:** API route paths (`/api/v1/ops/shifts`, `/api/v1/commerce/resources`), frontend page URLs (`/coop/[handle]/schedule`, `/coop/[handle]/commerce/resources`).

### Critical files to modify

**Lexicon package:**
- Create `packages/lexicons/network/coopsource/actor/profile.json`
- Regenerate `packages/lexicons/src/generated/lexicons.ts` (via `pnpm lex:generate`)
- Hand-edit `packages/lexicons/src/generated/types.ts` — add 19 new interface definitions (actor.profile + 18 orphans), update `LEXICON_IDS` and `LexiconRecordMap`
- Hand-edit `packages/lexicons/src/index.ts` — add 19 new type exports
- Hand-edit `packages/lexicons/tests/lexicons.test.ts` — assertion count 23 → 42, hardcoded ID list

**Database:**
- `packages/db/src/migrations/058_profile.ts` — add 4 new profile columns
- `packages/db/src/migrations/040_scheduling.ts` — rename table + indexes
- `packages/db/src/migrations/046_shared_resources.ts` — rename table + indexes + `resource_booking` FK
- `packages/db/src/schema.ts` — update `ProfileTable`, rename `ScheduleShiftTable`/`SharedResourceTable`

**API backend:**
- `apps/api/src/services/auth-service.ts:117-125` — `createRecord` → `putRecord` with `rkey: 'self'`
- `apps/api/src/services/profile-service.ts` — add `updateProfile`, `uploadAvatar`, `uploadBanner`, private `writeProfileToPds` helper
- `apps/api/src/routes/me-profile.ts` — extend PATCH body, add `POST /me/avatar` + `/me/banner`
- `apps/api/src/services/schedule-service.ts` — fix collection literal + table references
- `apps/api/src/services/shared-resource-service.ts` → `resource-service.ts` — fix literal, rename class + file + table references
- `apps/api/src/container.ts` — rename key + import
- `apps/api/src/routes/commerce/resources.ts` — rename imports + container calls
- `apps/api/src/routes/ops/schedules.ts` — rename type imports
- `apps/api/src/index.ts` — route import rename
- `apps/api/src/appview/indexers/profile-indexer.ts` — **NEW FILE**
- `apps/api/src/appview/hooks/builtin/index.ts` — register profile indexer

**Shared validation:**
- `packages/common/src/validation.ts` — add `UpdateMyProfileSchema`, rename `Create/UpdateSharedResourceSchema`
- `packages/common/src/index.ts` — update exports

**Frontend:**
- `apps/web/src/lib/api/types.ts` — extend `MeProfilePayload`, rename `SharedResource`/`ScheduleShift`
- `apps/web/src/lib/api/client.ts` — add profile methods, rename shared-resource methods
- `apps/web/src/lib/components/ui/FileUpload.svelte` — **NEW COMPONENT**
- `apps/web/src/routes/(authed)/me/profile/+page.svelte` — overhaul from read-only to edit form
- `apps/web/src/routes/(authed)/me/profile/+page.server.ts` — **NEW FILE**
- `apps/web/src/routes/(authed)/coop/[handle]/schedule/+page.svelte` — type rename
- `apps/web/src/routes/(authed)/coop/[handle]/commerce/resources/*` — type rename

### Existing helpers/patterns to reuse

- `apps/api/src/services/entity-service.ts:251-266` — `uploadAvatar` for cooperatives; copy pattern for member avatar/banner
- `apps/api/src/services/member-write-proxy.ts` — `updateRecord({ memberDid, collection, rkey, record })` already exists; use it for actor.profile writes
- `apps/api/src/services/alignment-service.ts:54-70` — `memberUpdate` fallback pattern (check `memberWriteProxy`, fall back to `pdsService.putRecord`)
- `apps/api/src/appview/indexers/membership-indexer.ts` — reference for indexer structure (state machine + soft-delete)
- `apps/api/src/appview/indexers/admin-indexer.ts:5-37` — simpler update-only indexer pattern
- `apps/web/src/routes/(authed)/me/settings/+page.server.ts` — reference for SvelteKit form-action pattern (load → action → fail/success)
- `packages/federation/src/interfaces/blob-store.ts` — `IBlobStore.upload(data, mimeType)` → `BlobRef`
- `apps/api/src/routes/blobs.ts` — existing `GET /api/v1/blobs/:cid` serves blob display
- `apps/api/src/routes/org/cooperatives.ts:101-124` — existing cooperative avatar upload via multer; copy for `/me/avatar`

### Key design decisions

**Profile indexer idempotency guard.** When `ProfileService.updateProfile` writes PG + PDS, the firehose indexer would fire a moment later and re-update PG with the same values. The indexer checks `existing.profile_record_cid === event.cid` and returns early if already synced. This prevents the local-write → firehose → indexer → PG double-update loop.

**AuthService register-time write uses `pdsService.putRecord` (not `memberWriteProxy`).** The user has no OAuth session yet (they're literally being created this request). Later profile edits go through `ProfileService.updateProfile`, which uses the `memberWriteProxy` path to DPoP-bind to the member's OAuth session.

**FileUpload.svelte is presentational, not event-emitting.** It's a thin wrapper around `<input type="file" name="...">` designed to live inside a `<form enctype="multipart/form-data" action="?/uploadAvatar" use:enhance>`. SvelteKit form actions consume FormData from native form submissions; they don't fire on JS `change` events. The component renders label + preview + native input, and the enclosing form handles submission.

**ProfileService UPDATE queries filter `is_default=true AND invalidated_at IS NULL`.** The profile table has a partial unique index on this predicate (mirroring `getDefaultProfile`). Plain `WHERE entity_did = did` could hit multiple rows if multi-profile ships later.

**Multer requires explicit `fileFilter`.** `upload.single` doesn't enforce mimetype by default. Plan specifies an explicit closure that rejects non-image/* with a ValidationError.

**`createdAt` preservation across profile edits.** The service reads `profile.created_at` from PG and passes it unchanged on each `putRecord` — `createdAt` in actor.profile is the profile creation time, not the last-update time (matches Bluesky semantics).

**Lexicon codegen pipeline debt.** `lex:generate` only regenerates `src/generated/lexicons.ts`; `src/generated/types.ts` is hand-written despite living in `generated/`. Adding a new schema is therefore a 3-file edit (JSON + codegen for lexicons.ts + hand-edit types.ts + hand-edit index.ts). This plan fixes the 18 pre-existing orphans + actor.profile; future schema work still follows this manual pattern until codegen is unified (out of scope).

## What's NOT in scope

- Moderation labels on actor.profile (Bluesky has `labels`; not needed yet)
- Pinned post / starter pack / joinedViaStarterPack (Bluesky-specific)
- Multi-profile support (V8.3 defers to V8.X)
- Rate-limited rename flow for displayName (tracked separately as "V8.X rename flow")
- Federated profile display for remote accounts from non-coopsource PDSes
- Full `BlobRef` type handling (`MemberWriteProxy.uploadBlob`, DPoP-bound blob XRPC). We use plain `string` CID refs.
- Migration consolidation of 061/062 into 058 (future cleanup)
- Unifying the lexicon codegen to auto-generate `types.ts` (future cleanup)
- PG column rename from `bio` → `description`

## Verification plan (summary — see plan file for specific commands)

1. Lexicon package — 42 schemas, build clean, tests green
2. Rename completeness — zero grep hits for `scheduleShift`/`sharedResource`/`ScheduleShift`/`SharedResource`/`schedule_shift`/`shared_resource` in `apps/` + `packages/`
3. Build + type check — `pnpm build` + `pnpm --filter @coopsource/web check` clean
4. Test suite — `pnpm test` (vitest) + `make test:pds` (federation PDS DPoP write path) green
5. DB reset — `make db-reset` applies cleanly from edited migrations
6. Manual e2e — register → /me/profile → edit + upload → refresh → persistence + sidebar avatar + indexer idempotency log
7. Documentation — LEXICONS.md + ARCHITECTURE docs updated

## Open questions for pickup session

- Is the "rename code to match lexicon JSON" direction still desired, or has the mood shifted toward "rename lexicon JSON to match code" (`ops.shift`, `commerce.sharedResource`)? This would flip Group 4 entirely.
- Has the user shipped anything since 2026-04-11 that would invalidate line-number references in this doc? Do a fresh grep for `scheduleShift`/`sharedResource` before starting execution.
- Has the profile table or AuthService changed? If so, the migration 058 edits and the `auth-service.ts:117-125` anchor may have drifted.
- Is `make db-reset` still disposable? (Memory: `feedback_migrations_dev.md`.) If the project has shipped or is close to shipping, flip to stacked forward-only migrations.
