# Lexicon Fixes + actor.profile Feature + Rename Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Before starting:** Read the companion design spec at `docs/superpowers/specs/2026-04-11-actor-profile-and-rename-design.md` for full context, tradeoffs, user decisions, and open questions. Also re-verify the line-number anchors below haven't drifted since 2026-04-11.

**Goal:** Close three related lexicon debts in one PR — (1) add the missing `network.coopsource.actor.profile` JSON schema and wire up a full profile-editing feature end-to-end (schema + service + routes + indexer + edit UI), (2) rename `scheduleShift`/`sharedResource` to `schedule`/`resource` throughout code/DB/types to match canonical lexicon IDs, (3) regenerate stale lexicon codegen and hand-author the 18 orphan TS types that have been missing since those schemas were added.

**Architecture:** Six task groups, sequenced to keep refactors and features in separate commits:
1. Lexicon package (JSON + codegen + hand-written types + tests)
2. DB schema + profile service + API routes (backend)
3. Profile indexer (firehose → PG)
4. Full rename (`scheduleShift` → `schedule`, `sharedResource` → `resource`) — pure refactor
5. Frontend profile edit UI — pure feature
6. Architecture doc + LEXICONS.md updates + final verification

Each group ends with its own commit. Group 4 runs `make db-reset` to exercise all prior migration edits in one shot.

**Tech Stack:** TypeScript strict, Express 5, Kysely, SvelteKit 2/Svelte 5 runes, Zod 4, Vitest 4. ATProto lexicon schemas via `@atproto/lex-cli`. Multer for file uploads. Tailwind 4 for styling.

**Source of truth for lexicon JSON fields:** JSON schemas in `packages/lexicons/network/coopsource/**/*.json`. Transcribe accurately; do not guess.

**User-confirmed decisions (2026-04-11 planning round):**
- Full rename scope (not minimal fix)
- Full expanded actor.profile feature (schema + write path + edit UI + indexer)
- Regenerate codegen as part of this PR
- One PR, one branch
- Edit migration files in-place (DB is disposable pre-release)

---

## Context summary

**Three issues being fixed:**
1. `network.coopsource.actor.profile` has no JSON schema (AuthService writes it, no lexicon)
2. `ops.schedule` / `commerce.resource` have code/schema naming mismatches
3. Lexicon codegen is stale (23 of 41 schemas in generated TS types)

**Key files touched:**
- `packages/lexicons/**` — new schema + regen + hand-written types
- `packages/db/src/migrations/{040,046,058}_*.ts` — in-place edits
- `packages/db/src/schema.ts` — type renames + new profile columns
- `apps/api/src/services/{auth,profile,schedule,shared-resource→resource}-service.ts`
- `apps/api/src/routes/me-profile.ts` — extended PATCH + new avatar/banner uploads
- `apps/api/src/appview/indexers/profile-indexer.ts` — NEW
- `apps/api/src/container.ts`, `apps/api/src/routes/commerce/resources.ts`, `apps/api/src/routes/ops/schedules.ts`, `apps/api/src/index.ts`
- `packages/common/src/validation.ts` — new `UpdateMyProfileSchema`, renames
- `apps/web/src/lib/api/{types,client}.ts` — profile additions + renames
- `apps/web/src/lib/components/ui/FileUpload.svelte` — NEW
- `apps/web/src/routes/(authed)/me/profile/{+page.svelte,+page.server.ts}` — overhaul/new
- `apps/web/src/routes/(authed)/coop/[handle]/{schedule,commerce/resources}/*` — type renames

---

## Task groups

### Group 1 — actor.profile lexicon + codegen cleanup

**Pre-existing debt to be aware of:** `lex:generate` only regenerates `src/generated/lexicons.ts` (the runtime array). `src/generated/types.ts` is **hand-written**, not auto-generated — despite living in a `generated/` folder. Adding a new lexicon schema is therefore a 3-file edit: (1) JSON file, (2) run codegen for `lexicons.ts`, (3) hand-edit `types.ts` to add the TS interface + LEXICON_IDS entry + LexiconRecordMap entry, (4) hand-edit `src/index.ts` to re-export. This plan is the first time the 18 pre-existing orphans get their `types.ts` entries; future schema work will still need to follow this manual pattern until codegen is unified (out of scope for this PR).

- [ ] **1.1** Create `packages/lexicons/network/coopsource/actor/profile.json` with lexicon 1, id `network.coopsource.actor.profile`, record type, key `self`, required `["displayName", "createdAt"]`, properties:
  - `displayName: { type: "string", maxLength: 64 }`
  - `description: { type: "string", maxLength: 256 }`
  - `pronouns: { type: "string", maxLength: 64 }`
  - `website: { type: "string", maxLength: 256 }`
  - `avatarCid: { type: "string", maxLength: 256 }`
  - `bannerCid: { type: "string", maxLength: 256 }`
  - `createdAt: { type: "string", format: "datetime" }`
  - Review against sibling schemas for formatting consistency (`org/membership.json`, `connection/link.json`).

- [ ] **1.2** Run `pnpm --filter @coopsource/lexicons lex:generate`. Verify `src/generated/lexicons.ts` now lists 42 entries (41 existing JSON files + actor.profile).

- [ ] **1.3** Hand-author TypeScript interfaces in `packages/lexicons/src/generated/types.ts` for: `ActorProfile`, `AdminComplianceItem`, `AdminFiscalPeriod`, `AdminMemberNotice`, `AdminOfficer`, `CommerceCollaborativeProject`, `CommerceIntercoopAgreement`, `CommerceListing`, `CommerceNeed`, `CommerceResource`, `FinanceExpense`, `FinanceExpenseApproval`, `FinanceRevenue`, `LegalDocument`, `LegalMeetingRecord`, `OpsSchedule`, `OpsTask`, `OpsTaskAcceptance`, `OpsTimeEntry` (19 total). Each interface's field list is transcribed directly from the corresponding JSON file.

- [ ] **1.4** Add all 19 new keys to the `LEXICON_IDS` constant and `LexiconRecordMap` type in `types.ts`.

- [ ] **1.5** Export the 19 new interfaces from `packages/lexicons/src/index.ts` (append to the existing grouped `export type { ... }` block, adding `// Actor types`, `// Admin types`, `// Commerce types`, `// Finance types`, `// Legal types`, `// Ops types` headers).

- [ ] **1.6** Update `packages/lexicons/tests/lexicons.test.ts`:
  - `expect(lexiconSchemas).toHaveLength(42)` (was 23)
  - `expect(values).toHaveLength(42)` (was 23)
  - Extend the hardcoded ID assertion array to include all 42 IDs

- [ ] **1.7** Verify: `pnpm --filter @coopsource/lexicons build && pnpm --filter @coopsource/lexicons test`

- [ ] **1.8** Commit: `docs(lexicons): add actor.profile schema + regenerate lexicons, add 18 missing type exports`

---

### Group 2 — DB schema + profile service + API routes

- [ ] **2.1** Edit `packages/db/src/migrations/058_profile.ts`:
  - Add columns to `createTable('profile')`: `pronouns text`, `website text`, `banner_cid text`, `profile_record_cid text`
  - Backfill `INSERT` doesn't need changes (new columns default NULL)

- [ ] **2.2** Edit `packages/db/src/schema.ts` `ProfileTable` interface — add the 4 new columns with appropriate Kysely types (`pronouns: string | null`, `website: string | null`, `banner_cid: string | null`, `profile_record_cid: string | null`).

- [ ] **2.3** Add to `apps/api/src/services/profile-service.ts`:
  - **All UPDATE queries must filter** `.where('entity_did', '=', did).where('is_default', '=', true).where('invalidated_at', 'is', null)` — mirrors the partial unique index and `getDefaultProfile` pattern. Do not use entity_did alone.
  - Private helper `async writeProfileToPds(entityDid: DID, profile: ProfileRow): Promise<RecordRef>` — builds the canonical actor.profile record (`{ displayName: profile.display_name, description: profile.bio ?? undefined, pronouns: profile.pronouns ?? undefined, website: profile.website ?? undefined, avatarCid: profile.avatar_cid ?? undefined, bannerCid: profile.banner_cid ?? undefined, createdAt: profile.created_at.toISOString() }`), calls `memberWriteProxy.updateRecord({ memberDid: entityDid, collection: 'network.coopsource.actor.profile', rkey: 'self', record })`. Fall back to `pdsService.putRecord(...)` when `memberWriteProxy` is undefined (dev). Return the RecordRef. Mirrors `alignment-service.ts:54-70` fallback pattern.
  - `updateProfile(entityDid: string, updates: { displayName?, description?, pronouns?, website? })` — within a DB transaction, UPDATE the default profile row with the filter above (mapping `description` → `bio`). After commit, re-select the row (using `getDefaultProfile`-equivalent query) and call `writeProfileToPds` with the refreshed row. On success, UPDATE profile SET profile_record_cid using the returned CID. Wrap the PDS call in try/catch; on failure log a warning (`profile_pds_sync_failed`, include the DID and error) and still return the updated profile so the user sees the optimistic update.
  - `uploadAvatar(entityDid: string, data: Buffer, mimeType: string): Promise<string>` — `blobStore.upload(data, mimeType)` → `blobRef.ref.$link`, UPDATE profile SET avatar_cid with the default-filter. Then re-select + `writeProfileToPds` + UPDATE profile_record_cid (same sync-with-log-on-fail pattern). Return the new CID.
  - `uploadBanner(...)` — same pattern, stores `banner_cid`.

- [ ] **2.4** Edit `apps/api/src/services/auth-service.ts:117-125`:
  - Replace `createRecord` with `putRecord`: `const profileRef = await this.pdsService.putRecord({ did: did as DID, collection: 'network.coopsource.actor.profile', rkey: 'self', record: { displayName: params.displayName, createdAt: now.toISOString() } })`
  - Immediately after, add an UPDATE: `await this.db.updateTable('profile').set({ profile_record_cid: profileRef.cid }).where('entity_did', '=', did).where('is_default', '=', true).where('invalidated_at', 'is', null).execute()`
  - Keep the existing error-propagation behavior (if putRecord throws, register fails — same as today). No try/catch swallowing here; the DB UPDATE is a simple follow-up that can fail but we let it propagate too since the profile row must exist (it was created in the prior transaction).
  - IMPORTANT: this is a one-shot write at register time. Later profile edits go through `ProfileService.updateProfile`, which uses the `memberWriteProxy` path to DPoP-bind to the member's OAuth session. The register-time write uses `pdsService.putRecord` because the user has no OAuth session yet (they're literally being created this request).

- [ ] **2.5** Extend `apps/api/src/routes/me-profile.ts`:
  - Extend `PATCH /api/v1/me/profile` body to accept `displayName?`, `description?`, `pronouns?`, `website?`, `discoverable?`, `dismissedGetStarted?`. Use `UpdateMyProfileSchema.parse(req.body)` from common validation. Keep `requireAuth` middleware (existing on the PATCH).
  - Route profile fields to `profileService.updateProfile`; continue to route `discoverable`/`dismissedGetStarted` to the existing single-field methods (no PDS round-trip for those).
  - Add `POST /api/v1/me/avatar` with `requireAuth` + multer `upload.single('avatar')`. Configure multer with `limits: { fileSize: 1 * 1024 * 1024 }` AND an explicit `fileFilter: (req, file, cb) => { const ok = ['image/png','image/jpeg','image/webp','image/gif'].includes(file.mimetype); cb(ok ? null : new ValidationError('unsupported mimetype: ' + file.mimetype), ok); }`. (Multer does NOT enforce mimetype by default — `fileFilter` is required.) Returns `{ cid, url: '/api/v1/blobs/{cid}' }`. Delegates to `profileService.uploadAvatar`. Model after `apps/api/src/routes/org/cooperatives.ts:101-124`.
  - Add `POST /api/v1/me/banner` — identical pattern with `upload.single('banner')`.

- [ ] **2.6** Add `UpdateMyProfileSchema` to `packages/common/src/validation.ts` (zod): `displayName: z.string().min(1).max(64).optional()`, `description: z.string().max(256).optional()`, `pronouns: z.string().max(64).optional()`, `website: z.string().max(256).optional()` (don't enforce URL format yet — users paste without protocol), `discoverable: z.boolean().optional()`, `dismissedGetStarted: z.boolean().optional()`. Require at least one field present (refine).

- [ ] **2.7** Export `UpdateMyProfileSchema` + `UpdateMyProfileInput` from `packages/common/src/index.ts`.

- [ ] **2.8** Build: `pnpm --filter @coopsource/db build && pnpm --filter @coopsource/common build && pnpm --filter @coopsource/api build`

- [ ] **2.9** Commit: `feat(profile): expand actor.profile lexicon + updateProfile + avatar/banner upload routes`

---

### Group 3 — Profile indexer (firehose → PG)

- [ ] **3.1** Create `apps/api/src/appview/indexers/profile-indexer.ts`:
  - Export `indexActorProfile(db, event)`
  - On `delete`: UPDATE profile SET invalidated_at = now() WHERE entity_did = event.did AND is_default = true AND invalidated_at IS NULL (soft-delete the default profile). Note: this is unusual — deletion of actor.profile typically shouldn't happen, but we handle it defensively.
  - On `create`/`update`:
    - Look up the existing default profile row for `event.did` (filter `is_default=true AND invalidated_at IS NULL`). If none, return (indexer doesn't create entities — we don't surface federated remote-only profiles).
    - **Idempotency guard:** if `existing.profile_record_cid === event.cid`, return early. This prevents the local-write → firehose → indexer → PG double-update loop when our own ProfileService wrote the record moments ago.
    - Extract `displayName`, `description`, `pronouns`, `website`, `avatarCid`, `bannerCid`, `createdAt` from `event.record` (note the field names are plain strings — not BlobRefs — per the lexicon tradeoff decision).
    - UPDATE profile SET `display_name=displayName`, `bio=description` (lexicon→PG alias), `pronouns`, `website`, `avatar_cid=avatarCid`, `banner_cid=bannerCid`, `profile_record_cid=event.cid`, `updated_at=now()`, `indexed_at=now()` WHERE id = existing.id.

- [ ] **3.2** Register in `apps/api/src/appview/hooks/builtin/index.ts` — add entry to `complexHooks` array: `{ id: 'builtin:actor.profile', collections: ['network.coopsource.actor.profile'], phase: 'post-storage', priority: 10, postHandler: async (ctx) => { await indexActorProfile(ctx.db, ctx.event); } }`.

- [ ] **3.3** Build: `pnpm --filter @coopsource/api build`

- [ ] **3.4** Commit: `feat(appview): profile indexer — sync actor.profile records to profile table`

---

### Group 4 — Full rename (scheduleShift → schedule, sharedResource → resource)

**Order rationale:** doing the rename BEFORE the profile frontend feature keeps commits clean — rename is a pure refactor, profile feature is pure feature. They both touch `types.ts`/`client.ts` but in non-overlapping ways, so doing them sequentially avoids bundled commits.

- [ ] **4.1** Edit `packages/db/src/migrations/040_scheduling.ts`:
  - `createTable('schedule_shift')` → `createTable('schedule')`
  - Rename indexes: `idx_schedule_shift_coop_starts` → `idx_schedule_coop_starts`, `idx_schedule_shift_coop_assigned_starts` → `idx_schedule_coop_assigned_starts`, `idx_schedule_shift_coop_status` → `idx_schedule_coop_status`
  - Update `down()` to drop the new name

- [ ] **4.2** Edit `packages/db/src/migrations/046_shared_resources.ts`:
  - `createTable('shared_resource')` → `createTable('resource')`
  - Rename indexes: `idx_shared_resource_coop_status` → `idx_resource_coop_status`, `idx_shared_resource_type_status` → `idx_resource_type_status`
  - Update `resource_booking` FK references if any point at `shared_resource.id`
  - Update `down()` to drop new name

- [ ] **4.3** Edit `packages/db/src/schema.ts`:
  - Rename `ScheduleShiftTable` interface → `ScheduleTable`
  - Rename `SharedResourceTable` interface → `ResourceTable`
  - Update `Database` interface: `schedule_shift: ScheduleShiftTable` → `schedule: ScheduleTable`; `shared_resource: SharedResourceTable` → `resource: ResourceTable`

- [ ] **4.4** Edit `packages/db/src/index.ts` — rename exports: `ScheduleShiftTable` → `ScheduleTable`, `SharedResourceTable` → `ResourceTable`.

- [ ] **4.5** `apps/api/src/services/schedule-service.ts`:
  - Line 55: `'network.coopsource.ops.scheduleShift'` → `'network.coopsource.ops.schedule'`
  - Line 2: update import from `ScheduleShiftTable` → `ScheduleTable`
  - Line 11: `type ShiftRow = Selectable<ScheduleShiftTable>` → `type ScheduleRow = Selectable<ScheduleTable>` (or keep `ShiftRow` as a local alias — it's an internal name)
  - All `db.selectFrom('schedule_shift')` / `insertInto('schedule_shift')` / `updateTable('schedule_shift')` → `'schedule'`

- [ ] **4.6** `apps/api/src/routes/ops/schedules.ts`:
  - Line 3: import rename
  - Line 11: `formatShift(row: Selectable<ScheduleShiftTable>)` → `Selectable<ScheduleTable>`
  - `db` references if any

- [ ] **4.7** Rename file: `apps/api/src/services/shared-resource-service.ts` → `apps/api/src/services/resource-service.ts`:
  - Line 43: `'network.coopsource.commerce.sharedResource'` → `'network.coopsource.commerce.resource'`
  - Class rename: `SharedResourceService` → `ResourceService`
  - Line 2: import rename
  - Line 11: `type ResourceRow = Selectable<SharedResourceTable>` → `Selectable<ResourceTable>`
  - All `db.<op>('shared_resource')` → `'resource'`

- [ ] **4.8** `apps/api/src/container.ts`:
  - Line 65: import `SharedResourceService` → `ResourceService` from `./services/resource-service.js`
  - Line 138: `sharedResourceService: SharedResourceService` → `resourceService: ResourceService`
  - Line 267: instantiation rename
  - Line 351: return property rename

- [ ] **4.9** `apps/api/src/routes/commerce/resources.ts`:
  - Line 3: import `SharedResourceTable` → `ResourceTable` (keep `ResourceBookingTable`)
  - Lines 10-11: import `CreateSharedResourceSchema` / `UpdateSharedResourceSchema` → `CreateResourceSchema` / `UpdateResourceSchema`
  - Line 16: `formatResource(row: Selectable<SharedResourceTable>)` → `Selectable<ResourceTable>`
  - Line 53: `createSharedResourceRoutes` → `createResourceRoutes`
  - Lines 62, 123: schema usage renames
  - Lines 63-190: all `container.sharedResourceService` → `container.resourceService`

- [ ] **4.10** `apps/api/src/index.ts`:
  - Line 83: import `createSharedResourceRoutes` → `createResourceRoutes`
  - Line 283: `app.use(createSharedResourceRoutes(container))` → `createResourceRoutes(container)`

- [ ] **4.11** `packages/common/src/validation.ts`:
  - Line 1312: `CreateSharedResourceSchema` → `CreateResourceSchema`
  - Line 1321: `UpdateSharedResourceSchema` → `UpdateResourceSchema`
  - Lines 1398-1399: type exports rename

- [ ] **4.12** `packages/common/src/index.ts`:
  - Lines 154-155, 270-271: update exports

- [ ] **4.13** Frontend renames:
  - `apps/web/src/lib/api/types.ts`: rename interface `SharedResource` → `Resource`, rename interface `ScheduleShift` → `Schedule`
  - `apps/web/src/lib/api/client.ts`: rename exports `SharedResource` → `Resource`, `ScheduleShift` → `Schedule`; rename methods `createSharedResource` → `createResource`, `getSharedResources` → `getResources`, `getSharedResource` → `getResource`; update generics throughout
  - `apps/web/src/routes/(authed)/coop/[handle]/schedule/+page.svelte`: rename `ScheduleShift` import + all type references → `Schedule`
  - `apps/web/src/routes/(authed)/coop/[handle]/commerce/resources/+page.svelte` + `+page.server.ts`: rename `SharedResource` import + all type references → `Resource`; update `api.createSharedResource` → `api.createResource`, `api.getSharedResources` → `api.getResources`

- [ ] **4.14** `make db-reset` (drop + recreate + migrate) — verifies the edited migrations (Group 2.1 profile columns + Group 4.1/4.2 table renames) apply cleanly

- [ ] **4.15** Full typecheck + tests:
  - `pnpm build`
  - `pnpm test` (vitest, fast suite)
  - `pnpm --filter @coopsource/web check` (svelte-check)
  - Verify with Grep tool (patterns are regex, zero hits expected in `apps/` + `packages/`):
    - `scheduleShift`
    - `sharedResource`
    - `ScheduleShift`
    - `SharedResource`
    - `schedule_shift|shared_resource`
    - `ops\.scheduleShift`
    - `commerce\.sharedResource`

- [ ] **4.16** Commit: `refactor: rename scheduleShift → schedule, sharedResource → resource to match canonical lexicon IDs`

---

### Group 5 — Frontend profile edit UI

- [ ] **5.1** Create `apps/web/src/lib/components/ui/FileUpload.svelte`:
  - Presentational wrapper around a native `<input type="file">` — **does NOT manage its own submission**. Designed to live inside a `<form method="POST" action="?/uploadAvatar" enctype="multipart/form-data" use:enhance>` so the parent form handles upload via SvelteKit form actions.
  - Props: `label: string`, `name: string` (input field name, e.g. `'avatar'`), `accept: string` (e.g. `'image/*'`), `maxBytes: number` (for client-side pre-validation display), `currentUrl?: string` (existing CID URL for preview)
  - Slot behavior: renders the label, the current preview `<img src={currentUrl}>` if set, a native `<input type="file" name={name} accept={accept}>`, plus a small size/type hint
  - Client-side validation: on `input` change, check `file.size > maxBytes` and display an inline error using `$state` runes; prevent submission if invalid
  - No HTTP, no custom events, no JS upload logic — the `<input>` belongs to the enclosing form

- [ ] **5.2** Extend `apps/web/src/lib/api/types.ts`:
  - Add `description: string | null`, `pronouns: string | null`, `website: string | null`, `bannerCid: string | null` to `MeProfilePayload`
  - Add same fields to `Profile` (line 4-10)

- [ ] **5.3** Extend `apps/web/src/lib/api/client.ts`:
  - Add `updateMyProfile(body: UpdateMyProfileInput): Promise<MeProfileResponse>` — PATCH `/me/profile` with JSON body
  - Add `uploadMyAvatar(formData: FormData): Promise<{ cid: string; url: string }>` — POST `/me/avatar` (takes FormData, not File, so SvelteKit form actions can pass it through)
  - Add `uploadMyBanner(formData: FormData): Promise<{ cid: string; url: string }>` — POST `/me/banner`

- [ ] **5.4** Overhaul `apps/web/src/routes/(authed)/me/profile/+page.svelte` from read-only view to edit form:
  - Keep the existing Identity card (handle/email/DID read-only)
  - Handle `data.profile === null` case with the existing unauth/no-coop gate (copy from `me/settings/+page.svelte`)
  - Replace the "Current Profile" card with three separate forms (each submits to its own form action to keep JSON and blob uploads independent):
    1. **Text fields form** (`method="POST" action="?/saveProfile" use:enhance`): displayName (`<Input>`), description (`<TextArea label="Bio">`), pronouns (`<Input>`), website (`<Input>`), Save button
    2. **Avatar form** (`method="POST" action="?/uploadAvatar" enctype="multipart/form-data" use:enhance`): `<FileUpload name="avatar" label="Avatar" accept="image/*" maxBytes={1*1024*1024} currentUrl={data.profile.avatarCid ? '/api/v1/blobs/' + data.profile.avatarCid : undefined}>`, Upload button
    3. **Banner form** — same pattern with `name="banner"` and `bannerCid`
  - Success/error inline messaging per the `me/settings/+page.svelte` pattern; each form has its own `form` prop result

- [ ] **5.5** Create `apps/web/src/routes/(authed)/me/profile/+page.server.ts`:
  - `load()` — `api.getMyProfile()` (copy pattern from `me/settings/+page.server.ts`, including 401 → `{ profile: null }` fallthrough)
  - `actions.saveProfile` — read `formData`, extract displayName/description/pronouns/website, call `api.updateMyProfile` with an object (not FormData), return `{ success, ...updatedFields }` or `fail(status, { error })`
  - `actions.uploadAvatar` — `const formData = await request.formData(); await api.uploadMyAvatar(formData)`. Pass FormData straight through to the API client (which passes it as body to `fetch`). Return `{ success, avatarCid, avatarUrl }` or `fail`.
  - `actions.uploadBanner` — same for banner

- [ ] **5.6** Build + type-check:
  - `pnpm --filter @coopsource/web check`
  - `pnpm --filter @coopsource/web build`

- [ ] **5.7** Commit: `feat(web): profile edit UI with avatar/banner upload`

---

### Group 6 — Final verification + architecture doc update

- [ ] **6.1** Update architecture doc — grep `profile` in `ARCHITECTURE-V7.md` and `ARCHITECTURE-V8.md` to locate the current V8.3 profile section. Update it to note: (a) actor.profile now has a JSON schema; (b) the expanded profile fields (description, pronouns, website, banner); (c) the new profile indexer; (d) the schedule/resource rename.

- [ ] **6.2** Update `packages/lexicons/LEXICONS.md`:
  - Remove the note "actor.profile is also written to member PDS but has no JSON schema in this package — it is defined in code only"
  - Add `actor.profile` to the ownership matrix (Member's PDS count: 8 → 9 records)
  - Update total schema count: 41 → 42 (in overview + any other references)
  - Update namespace count: 11 → 12 (adding `actor`)
  - Add a new `actor` namespace section with a prose intro + field table for `actor.profile`
  - Remove the two notes about code using `ops.scheduleShift` / `commerce.sharedResource` (they're no longer true)

- [ ] **6.3** Final manual QA: start dev server, register a new account, navigate to `/me/profile`, edit displayName/bio/pronouns/website (Save), upload avatar + banner (Upload each), refresh page, confirm persistence. Confirm avatar renders in sidebar/nav. Tail API logs — confirm `ProfileService.updateProfile` logs successful PDS sync and the indexer's idempotency guard skips the firehose echo.

- [ ] **6.4** Commit: `docs: update LEXICONS.md + ARCHITECTURE for actor.profile feature`

---

## Verification

End-to-end validation before claiming done:

1. **Lexicon package health**
   - `pnpm --filter @coopsource/lexicons test` — 42 schemas, all IDs present
   - `pnpm --filter @coopsource/lexicons build` — clean, no TS errors
   - Manually check `packages/lexicons/src/generated/lexicons.ts` contains `network.coopsource.actor.profile`

2. **Rename completeness** (use the Grep tool; patterns are regex, all should return zero hits in `apps/` + `packages/`)
   - `scheduleShift`
   - `sharedResource`
   - `ScheduleShift`
   - `SharedResource`
   - `schedule_shift|shared_resource`
   - `ops\.scheduleShift`
   - `commerce\.sharedResource`

3. **Build + type check**
   - `pnpm build` — all workspaces clean
   - `pnpm --filter @coopsource/web check` — svelte-check clean

4. **Test suite**
   - `pnpm test` — vitest green (expect 981 tests still passing, possibly +a few for profile indexer)
   - `make test:pds` — federation PDS tests green (validates the DPoP write path for actor.profile)

5. **DB reset**
   - `make db-reset` runs clean from migrations in their edited state
   - `psql coopsource -c '\d profile'` — shows `pronouns`, `website`, `banner_cid`, `profile_record_cid` columns (note: no `profile_record_uri` — URI is deterministic)
   - `psql coopsource -c '\d schedule'` — table exists with correct indexes; old `schedule_shift` table is gone
   - `psql coopsource -c '\d resource'` — table exists with correct indexes; old `shared_resource` table is gone

6. **Manual e2e (golden path)**
   - Register new person → navigate to `/me/profile` → all fields editable
   - Fill in displayName, bio, pronouns, website → Save → success toast, values persist on refresh
   - Upload avatar (PNG < 1MB) → preview renders → Save → avatar appears in sidebar
   - Upload banner → same flow
   - Tail API logs — confirm actor.profile `putRecord` call reaches PDS
   - Tail firehose / AppView logs — confirm `indexActorProfile` fires and idempotency guard skips the echo

7. **Documentation**
   - `LEXICONS.md` reflects actor.profile + rename (no stale notes)
   - `ARCHITECTURE-V8.md` mentions the new indexer + profile fields
   - No grep hits for stale `scheduleShift` / `sharedResource` in docs

---

## Out of scope

- Moderation labels on actor.profile (Bluesky has `labels`; not needed yet)
- Pinned post / starter pack / joinedViaStarterPack (Bluesky-specific)
- Multi-profile support (V8.3 defers to V8.X)
- Rate-limited rename flow for displayName (tracked separately as "V8.X rename flow")
- Federated profile display for remote accounts from non-coopsource PDSes
- Full `BlobRef` type handling for avatars/banners — plain CID strings for now
- Migration consolidation of 061/062 into 058 (future cleanup)
- Unifying lexicon codegen to auto-generate `types.ts` (future cleanup)
- PG column rename `bio` → `description` (kept with service-layer translation)
