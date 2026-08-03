# Independent Deep Review — Co-op Source Network @ `a81d46d`

*Scope: whole repo (12 review dimensions + agent/MCP surface) plus ATProto ecosystem refresh. Every claim below was verified by reading the cited line or by executing a probe; probes were deleted. Severities are post-verification — several submissions were downgraded after adversarial checking, and four were refuted outright.*

---

## 1. Verdict

CSN is a **large, coherent, well-architected system whose production surface has never been exercised**, and that is the single fact that explains almost every defect found. The layering is genuine (ports, plugin sets, `MembershipReadModel`, `GroupMutationPort`), the Svelte 5 runes migration is 100% complete, and there are ~2,030 tests that pass. But neither production container image can be built (`docker build -f apps/api/Dockerfile` fails with 19 TypeScript errors; `apps/web/Dockerfile` fails at `svelte-kit: not found`), no Docker deployment can create a schema (`packages/db/dist/migrations/schema.sql` ENOENT), the MCP endpoint cannot service a single tool call, and the financial services contain zero transactions across seven files. The recurring pattern is **a control that exists but is not wired to the path that needs it**: `system_config.cooperative_did` exists but `getCooperative()` ignores it; `cross_coop_visible` exists but nothing reads it; `isConfidentialCsnCollection()` exists but has one call site; `WebhookService.verifySignature` exists with zero callers; `validateWebhookUrl` exists but is not applied to DID resolution; token `scopes` are stored and never read.

The tranche-1 branch is real work — the role ceiling resisted every bypass I constructed, and C-01/C-02/C-03 are materially better than main. But **two of the three "fixed" criticals are partial in ways their own new tests cannot detect**, and one commit introduced a fresh privilege bypass. The remaining critical-tier findings (C-04 signature forgery, C-05 Tap ack-on-failure, C-06 non-atomic ledgers, S-08 SSRF, A-07 RFC 9421) are all still open and all still exploitable. Note also that the canonical audit itself is **untracked** (`git status` shows `?? docs/plans/2026-07-31-complete-codebase-audit-and-refactor-plan.md`), and `docs/plans/2026-08-01-audit-assessment-and-refactor-program.md` **does not exist in this repo** — if that assessment was written, it is outside the tree.

---

## 2. NEW findings (not in the 2026-07-31 audit or the 2026-08-01 assessment)

No new **critical** survived verification. Every finding at that tier maps to an existing ID (C-04, C-05, C-06, S-08, A-07) and every one is confirmed still open. The new material is concentrated in three places the audits never opened: **the agent/MCP token path**, **the cooperative-identity endpoints**, and **the test/build harness**.

### HIGH

**N-1 · `GET /api/v1/cooperative` returns an arbitrary cooperative; the settings page reads one coop and writes another**
`apps/api/src/services/entity-service.ts:39-71` — `selectFrom('entity').innerJoin('cooperative_profile',…).where('entity.type','=','cooperative').where('entity.status','=','active').executeTakeFirst()`. No actor predicate, no `ORDER BY`. The canonical value exists and is ignored: `apps/api/src/routes/setup.ts:166-169` writes `system_config.cooperative_did`, read by `auth.ts:41-47` and `well-known.ts:30-38`.

Reproduced through production HTTP routes only, no hand-inserted rows: setup+login → `GET /cooperative` returns alpha; `POST /api/v1/networks {"name":"Beta Network"}` → 201 (`network-service.ts:242` inserts `entity type=cooperative status=active` + profile, route at `routes/org/networks.ts:26-56`, mounted `index.ts:254`); `PUT /api/v1/cooperative {displayName:"Alpha Coop", website:"https://alpha.example"}` → 200 **whose own response body echoed `did:plc:ipooh…` / "Beta Network" / `website: null`**; the write landed on alpha (`entity-service.ts:231-266` scopes the UPDATE correctly), and updating alpha's rows moved its heap tuples behind beta's so the unordered seq scan now returns beta permanently.

**Failure:** an admin opens `/coop/alpha/settings`. The form prefills from beta — displayName, description, website, and the visibility checkboxes (`+page.svelte:223,239` bind `anonDiscoverable`/`publicMembers`). They hit Save. `?/update` and `?/updateVisibility` (`+page.server.ts:42-69`) write to `req.actor.cooperativeDid` = alpha. Beta's description **and its public-exposure flags** are copied onto alpha; the `website:null` echo means a second save blanks the website they just set. 28 other `+page.server.ts` files call `api.getCooperative()` for coop context and inherit the wrong identity. Adjacent to KNOWN M-01 but a different file, query, and failure mode — track separately.

**N-2 · The MCP endpoint is 100% non-functional, and fixing it opens a cross-tenant search primitive**
`apps/api/src/mcp/server.ts:473-481` builds a fresh `McpServer` **and** a fresh `StreamableHTTPServerTransport` per request, passing `sessionIdGenerator: () => crypto.randomUUID()` — which puts the transport in *stateful* mode. `initialize` mints a session, the transport is discarded when the response ends, and the next request builds an uninitialized transport that rejects the client's own session id.

```
D1 tools/list -> 400 {"error":{"code":-32000,"message":"Bad Request: Server not initialized"}}
D1 sid1 9a6fc4b8-…  sid2 5c33c4fc-…      (two initializes, two different sessions)
```

The comment at `server.ts:20-22` ("A fresh McpServer is created per request to avoid cross-request token contamination") is the direct cause. All ten tools and the advertised Claude Desktop integration (`server.ts:17-18`) are dead. `apps/api/tests/mcp-tools.test.ts:1-6` imports only `kysely` and the test-db helper — it re-implements the query logic in the test and covers **zero** lines of `server.ts`, which is why this was never caught.

Latent behind it: `createScopedMcpServer` binds `coopDid` at `server.ts:75` and is documented "scoped to a specific cooperative" (`:64`), but `coopDid` appears only at lines 84, 129, 153, 173. Four tools never use it — `query-records` (`:205-212`), `get-record` (`:277-290`), `search-records` (`:326-334`, a `content::text ILIKE '%…%'` over every row in the instance), `list-collections` (`:355-361`). Running those exact shapes with a coop-A token against a coop-B ballot:

```
D2 search-records: [{"uri":"at://did:plc:userbbbb…/network.coopsource.governance.vote/secretballot"}]
D2 get-record returns rationale "COOPB_SECRET_RATIONALE"
```

This is the S-04 class on a surface with no `:id`-shaped route to grep. **Whoever fixes the transport bug ships the data leak in the same commit** unless both are addressed together.

**N-3 · A member can raise an already-approved expense past review (no status CAS)**
`apps/api/src/services/expense-service.ts:125-159` — `updateExpense` SELECTs, guards on the read value (`:135-139`), then UPDATEs with `WHERE id / cooperative_did / member_did` and **no status predicate**, unwrapped by any transaction. `reviewExpense` is identical (guard `:244-248`, UPDATE `:253-264`). `reimburseExpenses` at `:297-307` *does* carry `.where('status','=','approved')` — the pattern was known and omitted twice.

Deterministic interleave proof: gate `updateExpense`'s SELECT, run `reviewExpense` to completion, release. Reviewer's returned row: `status=approved, amount=10`. Final DB row: `status=approved, amount=100000, reviewed_by=did:plc:zzreviewer`. The naive probe (8 concurrent updates racing one approve) reproduced 5/5. `PUT /api/v1/finance/expenses/:id` (`routes/finance/expenses.ts:190-203`) carries `requireAuth` only, and `UpdateExpenseSchema` (`packages/common/src/validation.ts:1395-1402`) puts no ceiling on `amount`.

Wider than the amount: `reviewExpense`'s missing CAS resurrects terminal state. Proved — submit → reviewer A SELECTs → reviewer B approves → manager reimburses (`status='reimbursed'`) → reviewer A's stale UPDATE forces `status` back to `'approved'` while `reimbursed_at` stays populated → a **second** `reimburseExpenses` returns 1 again. Double-reimbursement through the guard that was written correctly.

*Incidental, verified:* `createExpense` hardcodes `'submitted'` (`:101`) and nothing ever writes `'draft'`, so `deleteExpense`'s `status !== 'draft'` guard (`:328`) makes that endpoint permanently unreachable. And `expense` is absent from `truncateAllTables()` (`apps/api/tests/helpers/test-db.ts:80-118`), so expense rows leak across test files.

**N-4 · `POST /api/v1/financial/patronage/calculate` is not idempotent — a double-submit multiplies every member's capital credit**
This supersedes a weaker submission about `text` vs `uuid` columns. The unique constraint is `UNIQUE (fiscal_period_id, member_did, stakeholder_class)` (`packages/db/src/migrations/schema.sql:3172`) with PostgreSQL's **default NULLS DISTINCT** (confirmed via `pg_get_constraintdef`; `NULLS NOT DISTINCT` appears nowhere in `packages/db/src`). `stakeholderClass` is optional (`packages/common/src/validation.ts:1076-1080`) and the web client types it optional (`apps/web/src/lib/api/client.ts:1615-1623`), so **on the default path the constraint never fires**.

Three byte-identical POSTs using the API's own lowercase id → 3 records; one approve → `{approved:3}`; one allocate → `{allocated:3}`; final capital balance **240 for a $100 surplus at 80% retention** (correct: 80). No casing trick, no second identifier, no concurrency.

Compounding it, `patronage-service.ts:185` persists `data.fiscalPeriodId` (the caller's raw string) instead of the normalized `period.id` it selected at `:151-157`, and `patronage_record.fiscal_period_id` is `text` against a `uuid` PK. With a non-null `stakeholderClass`, an uppercase id yields a second record set (201/409/201) that is then **invisible** to `listRecords`, `approveRecords` and `allocatePatronageBulk`, all of which filter on exact text. Also `fiscalPeriodId: z.string().min(1)` (`validation.ts:1083`) lets a non-uuid reach Postgres and returns **500**, not 400.

Fix needs three parts: `NULLS NOT DISTINCT` (or a partial unique index), a period-level "already calculated" check, and normalizing the stored id.

**N-5 · `use:enhance` form reset silently blanks the onboarding config and writes defaults on the next save**
`apps/web/src/routes/(authed)/coop/[handle]/onboarding/+page.svelte:173-179` calls `update()` with no options. `@sveltejs/kit@2.57.1` `src/runtime/app/forms.js:96-103` defaults `reset = true` and calls `HTMLFormElement.prototype.reset.call(form_element)` on `result.type === 'success'` (which `+page.server.ts:88` returns). Svelte 5.53.5's document-level reset listener (`internal/client/dom/elements/misc.js:36-56`) then fires each element's `__on_r`, and `bind_value` (`bindings/input.js:22-30`) executes `set(input.defaultValue)` — writing the reset value **back into `$state`**.

Because `activeTab = $state('progress')` (`:9`) and the form sits behind `{#if activeTab === 'config'}` (`:169`), the form is never SSR'd; every input is client-created with no `value` attribute, so `defaultValue === ''`. Proved in Chromium with the repo's own compiler and runtime: `hasValueAttr: [false,false,false,false]`, and after reset the state became `[{name:"",description:"",order:1},…]`.

Milestone names carry `required` (`:230`), so the form then fails native constraint validation and the user is **locked out of saving** (proved: submit count stays 1, `checkValidity()` false). The silent-corruption path is the unguarded siblings on the same form: `probationDurationDays` (`:185-186`), `buyInAmount` (`:192-193`) and the three checkboxes (`:199/:204/:209`) also blank/uncheck, and `set_value`'s unchanged-value short-circuit (`internal/client/dom/elements/attributes.js:82-99`) means the following `invalidateAll()` does **not** repaint them. With zero milestones (nothing `required`), the next save posts `probationDurationDays=""` → `Number('' || 90)` = 90 (`+page.server.ts:63`, silently 180→90) and omits all three checkboxes → all flipped false (`:65-67`).

The identical construction exists at `apps/web/src/routes/(authed)/coop/[handle]/members/+page.svelte:20-21, 383-384, 441-443, 452` against the same config, so a user can round-trip stale data between the two routes. That instance is medium (its `$effect` at `:47` handles other state but not milestones).

**N-6 · `--cs-text-muted` fails WCAG AA in both themes across 530 call sites**
`apps/web/src/app.css:87` (light `#94a3b8`) and `:135`/`:189` (dark `#475569`). Recomputed sRGB relative-luminance ratios: light on `--cs-bg-card` #ffffff = **2.56:1**, on `--cs-bg` #fafafa = 2.46:1, on `--cs-bg-inset` #f1f5f9 = **2.34:1**; dark on #141419 = 2.42:1, on #0a0a0f = 2.61:1, on `--cs-bg-elevated` #1a1a22 = **2.28:1**. Body copy is 13px (`:231`) and the muted sites are 207 `text-xs` / 19 `text-[10px]` / 15 `text-[11px]`, so the 4.5:1 normal-text threshold applies — even the lenient 3:1 non-text threshold fails. Dark sidebar nav labels (`--cs-sidebar-text` #64748b on #0f0f14) = 4.02:1; the `opacity-50` section headings at `Sidebar.svelte:99` = 2.69:1 light / **1.89:1 dark**.

Not theoretical — the rules ship: `.svelte-kit/output/client/_app/immutable/assets/0.CKWFWuAn.css` contains `.text-\[var\(--cs-text-muted\)\]{color:var(--cs-text-muted)}` and the `::placeholder` variant. 530 matches across 104 `.svelte` files. Zero `prefers-contrast` / `forced-colors` / alternate-theme overrides exist anywhere in `apps/web/src`.

*Correction for whoever fixes it:* `--cs-input-placeholder` (`app.css:105/153/204`) has **zero consumers** — it is dead. All 42 placeholder sites use `placeholder:text-[var(--cs-text-muted)]`. Editing the placeholder token alone is a no-op. `--cs-text-secondary` is fine (7.58:1 / 7.16:1) and light-mode sidebar text passes at 6.96:1; the failure is confined to the muted tier, the dark sidebar tier, and the opacity-50 headings — a three-token fix.

**N-7 · The apps/api test database name is hardcoded, so `TEST_DATABASE_URL` cannot isolate a run and concurrent runs destroy each other**
`apps/api/tests/helpers/test-db.ts:15-16` — `const TEST_DB_NAME = 'coopsource_test'` and `const ADMIN_URL = 'postgresql://localhost:5432/postgres'`, both literal. `createTestDb()` (`:25-40`) drops and creates that literal name; `getTestConnectionString()` (`:18-23`) and `getTestDb()` (`:64-76`) honour `TEST_DATABASE_URL`. `turbo.json:20-23` declares `TEST_DATABASE_URL` as `passThroughEnv` for the `test` task, so the override is an intended, supported knob — it just doesn't work.

Worse than "fails to isolate": with the override DB **pre-created**, the run goes green (`Test Files 1 passed`, 110 tables migrated) **while still dropping `coopsource_test` and leaving it at 0 tables** (oid 101649543 → 101651235). The victim's next `truncateAllTables` fails on `tax_form_1099_patr` — the first table in the list at `:80-118` — which is exactly the mass-failure signature. This is live, not hypothetical: I sampled `coopsource_test`'s oid six times during verification and it changed every time (101623749 → 101631951 → 101634091 → 101649543 → 101651235 → 101672127), mostly from other agents in this session. Measured 287 and 456 spurious failures on this commit that way.

`apps/web/tests/e2e/global-setup.ts:11-14` is the correct pattern (derives ADMIN_URL from the target URL, honours `E2E_DATABASE_*`) and targets a *different* server (port 5433), so Playwright is not a collider.

**N-8 · `apps/web/Dockerfile` cannot build: the `--prod` prune re-runs `svelte-kit sync` after SvelteKit has been pruned**
`apps/web/Dockerfile:17` runs `RUN CI=true pnpm install --frozen-lockfile --prod`. `apps/web/package.json:11` declares `"prepare": "svelte-kit sync"` and `:28` puts `@sveltejs/kit` in devDependencies. Executed:

```
#15 [build 9/10] RUN pnpm --filter @coopsource/web build      DONE 11.3s
#16 [build 10/10] RUN CI=true pnpm install --frozen-lockfile --prod
    apps/web prepare$ svelte-kit sync
    apps/web prepare: sh: svelte-kit: not found
    [ELIFECYCLE] Command failed          ERROR: Dockerfile:17
```

Not suppressible by config: `.npmrc` has no `ignore-scripts` and is never copied into the image anyway (`Dockerfile:6` copies four files, not `.npmrc`); `CI=true` does not disable pnpm lifecycle scripts; `pnpm-workspace.yaml:12-14` `onlyBuiltDependencies` gates *dependency* scripts, not a workspace project's own `prepare`. Deterministic — `packageManager: pnpm@11.7.0` is pinned. Consumed by `infrastructure/docker-compose.prod.yml:127-130` and Makefile targets 152/169/190. File as **O-01b** — O-01's cited range (`apps/web/Dockerfile:6-27`) spans line 17, so fix them together.

---

### MEDIUM

**N-9 · `GET /api/v1/cooperative/by-handle/:handle` has no membership or visibility gate**
`apps/api/src/routes/org/cooperatives.ts:53-87` — `requireAuth` is the only middleware (compare `:90-93` and `:134-137`, where the PUT and avatar routes on the same router add `requirePermission`). `entity-service.ts:105-170` filters only on type/status/handle and never reads `anon_discoverable` or `cross_coop_visible`. Reproduced: an authenticated non-member gets 200 with the full record for a coop whose `anon_discoverable=false` and `cross_coop_visible=false`, including `governanceVisibility` and all eight `public_*` booleans — while the deliberately-public route `explore.ts:111` correctly 404s the same record. The whole response object is serialized into the SvelteKit data payload by `(authed)/coop/[handle]/+layout.server.ts:10-24`, which rejects only `isNetwork`. `cross_coop_visible` has been unenforced since V8.1 — `docs/superpowers/plans/2026-04-07-v8.1-visibility-foundation.md:817` says so outright.

**N-10 · `POST /api/v1/admin/pds/reindex/:did` replays another tenant's records and permanently inflates their counters**
`apps/api/src/routes/admin.ts:42-80` — `const did = req.params.did` then `.where('did','=',did)` with no comparison to `req.actor.cooperativeDid`; `requireAdmin` (`auth/middleware.ts:178-186`) only proves admin standing in the caller's *own* coop. Mounted unconditionally at `index.ts:267`, outside the `NODE_ENV !== 'production'` block. Proved as coop A's admin against coop B: `POST /reindex/<memberB>` → 200, `total:3`, and `calendar_event_ref.rsvp_count` for coop B went **1 → 2 → 3** across two calls. Cause: `admin.ts:60-68` hardcodes `operation: 'create'`, and `appview/hooks/declarative/handler.ts:239-244` blind-increments on create with no idempotency key. There is no recompute path. Also resets `invalidated_at: null` on another tenant's proposals (`proposal-indexer.ts:133-135`) and falsifies `indexed_at`.

*Two corrections to the obvious framing:* the hook registry contains **no** notification or labeler hooks (`container.ts:646-647` registers 12 declarative + 5 complex indexers plus the lexicon validator; script hooks are dead per C-02), and the C-01 authority gate at `proposal-indexer.ts:83-108/260-275` still applies, so the replay cannot fabricate proposals or ballots. Also: the counter inflation is reachable **without** the scoping bug — publish your own `community.lexicon.calendar.rsvp` naming another coop's `event_uri` and reindex your own DID. Fixing only `:did` scoping does not close it.

**N-11 · `GET /api/v1/admin/activity` returns the instance-global `fact_log`, unredacted**
`apps/api/src/routes/admin.ts:83-97` — `.selectFrom('fact_log').selectAll().orderBy('changed_at','desc').limit(50)`, no predicate. Proved non-synthetically: stood up a second cooperative with its own admin, logged in via `POST /api/v1/auth/login`, and `GET /admin/activity` returned coop A's real setup-generated audit row.

The table **can** be scoped — `fact_log.entity_id` is `${cooperativeDid}|${operation}|${subject}` (`packages/arbiter-client/src/group-mutation-port.ts:1007-1009`) and a correctly-scoped sibling reader already exists at `group-mutation-port.ts:700-704` (`.where('entity_id','like',\`${cooperativeDid}|%\`)`). The claim that "FactLogTable has no cooperative_did column so it cannot be scoped" is wrong; this is a one-line predicate. The leaked content is membership/role mutation metadata, actor DIDs, free-text `reason`, `auditMetadata` — **not** IPs (`group-mutation-port.ts:930` hardcodes `ip_address: null`). Same fix site, second defect: the query does not join `fact_log_redaction`, so GDPR-erased rows come back in full (proved).

**N-12 · Connector sub-resources are addressable across cooperatives, and `deleteConfig` destroys foreign mappings behind a 404**
`apps/api/src/routes/connectors/index.ts` passes only `String(req.params.id)` for five routes (`:133-143`, `:147-156`, `:160-168`, `:172-183`, `:187-196`); `connector-registry-service.ts` never filters internally (`addFieldMapping:133`, `listFieldMappings:169`, `deleteFieldMapping:178`, `recordSyncStart:191`, `getSyncLogs:241`) while the siblings `getConfig(id, cooperativeDid):92` and `updateConfig(…):64` do. Reproduced all five cross-tenant (read, write, delete, log read, sync trigger).

**The control case is not safe either** — `deleteConfig` (`connector-registry-service.ts:113-128`) deletes field mappings by `connector_config_id` at `:115-118` **before** the tenant-scoped config delete at `:120-124`. `DELETE /configs/<foreign-uuid>` returns 404 while having already destroyed all of that coop's mappings (expected 1, got 0, status 404). A silent destructive primitive concealed by the error response.

Two GETs (`:147-156`, `:172-183`) carry no `requirePermission` at all, so any active member reads integration field maps and sync history. There is no FK on `connector_field_mapping.connector_config_id` (`schema.sql:481-489`, plain `text`). The correct pattern already exists in the sibling module — `webhooks.ts:118` threads `req.actor.cooperativeDid` into its sub-resource loader.

*Exploitability caveat:* config ids are `gen_random_uuid()` and I found no endpoint that discloses another coop's ids, so there is no enumeration primitive; the echoed `connectorConfigId` in `formatFieldMapping:36` is just the caller's own input.

**N-13 · The API client surfaces the machine error code and discards every human message and validation detail**
`apps/web/src/lib/api/client.ts:210-211` — `message = body.error ?? body.message ?? message`. The API envelope always populates `error` (`middleware/error-handler.ts:10-11` Zod branch, `:30-32` AppError branch) with `err.code` from `packages/common/src/errors.ts:15-43`, so `body.error` unconditionally shadows the message. Verified with the real exported client against a stubbed fetch: 400 → `'ValidationError'` (not "Validation failed"); 409 → `'Conflict'` (not "Meeting record is already certified"); 403 → `'Forbidden'`.

`grep -rE "(fail|error)\([^)]*err\.message" apps/web/src/routes` → **148 matches across 52 files**, rendered raw (e.g. `governance/new/+page.svelte:22`). `apps/web/src/routes/login/+page.server.ts:33` uses the correct order, confirming the intended contract. Present since bootstrap commit `1417774`. Note the swap alone is not sufficient: `client.ts:210` types the body as `{ error?, message? }` and discards `details` and the `axis`/`reason` fields from `error-handler.ts:33-36`, so field-level and axis detail need the parsed type widened too.

**N-14 · Ten CSS custom properties are referenced but never defined, and all ten reach the production stylesheet unresolved**
Verified against `apps/web/.svelte-kit/output/client/_app/immutable/assets/0.CKWFWuAn.css`: 11 emitted rules with bare `var()` and zero matching definitions — `.bg-\[var\(--color-danger-50\)\]`, `.border-\[var\(--color-danger-200\)\]`, `.text-\[var\(--color-danger-600\)\]`, `.hover\:bg-\[var\(--cs-bg-hover\)\]:hover`, plus `--color-success-50/200/600`, `--cs-bg-muted`, `--cs-success`, `--cs-success-soft`. `app.css` defines only `--color-danger-light/-/-dark` (`:38-40`) and `--color-success-light/-/-dark` (`:32-34`) — no numeric scale.

Executable proof in headless Chromium of the emitted declarations: error and success banners compute **byte-identically** — `backgroundColor rgba(0,0,0,0)`, `color rgb(15,23,42)` (inherited), `borderTopColor rgb(15,23,42)` (currentColor). Affects `settings/agents/+page.svelte:35,41,139` **and** `settings/ai-providers/+page.svelte:33,39,106`. Ten Cancel/list-row controls have a dead `hover:bg-[var(--cs-bg-hover)]` with no other hover declaration (`agreements/+page.svelte:37`, `.../[uri]/edit:49`, `.../new:41`, `.../templates/new:70`, `.../templates/[id]:85`, `alignment/+page.svelte:66`, `governance/+page.svelte:105`, `governance/new:43`, `governance/[id]/edit:49`, `campaigns/+page.svelte:49`), and `me/matches/+page.svelte:92`'s "Acted on" badge renders as bare text next to a correctly-styled pill at `:87`.

*Not affected:* `explore/[handle]/+page.svelte:86` uses `hover:bg-[var(--cs-primary-soft-hover,var(--cs-primary-soft))]` — it has a fallback.

**N-15 · The auto-handle `$effect` reads and writes the same state, so the handle field cannot be cleared**
`apps/web/src/routes/register/+page.svelte:14-18` — `$effect(() => { if (displayName && !handle) { handle = toHandle(displayName); } })`. Compiling the real file with svelte 5.53.5 emits `$.user_effect(() => { if ($.get(displayName) && !$.get(handle)) { $.set(handle, …) } })`, so `handle` is a tracked dependency of the effect that writes it. Runtime trace: set `displayName='Alan Moore'` → `handle='alan-moore'`; set `handle=''` → effect re-runs and restores `'alan-moore'`.

The "appends" behaviour is in `svelte/src/internal/client/dom/elements/bindings/input.js:41-60`: after `set(value)` and `await tick()`, `value !== (value = get())` is true, so it force-writes `input.value` and hits the branch `if (start === end && end === length && new_length > length)` which sets `selectionStart/selectionEnd = new_length` — caret at the **end**, producing `acme-collectiveacme`.

Reachable at four fields on three pages: `register/+page.svelte:14-18` (bound `:76`), `setup/+page.svelte:30-34` (`:126`) and `:36-40` (`:171`), `invite/[token]/+page.svelte:14-18` (`:109`), plus `(public)/join/+page.svelte:24-28` (`:112`). **Not** `join`'s second effect at `:30-33` — `adminHandle` has only a hidden input at `:83`, no `bind:value`, so it's unreachable.

Mitigated by select-all-and-type (proved: a direct non-empty set sticks) and by the Step-3 review screen at `setup/+page.svelte:224-241`. Aggravated by there being **no handle-rename path anywhere** — no PATCH/PUT on handle in `apps/api/src/routes/*.ts`, no `updateHandle`/`changeHandle` service — and `/register` and `/invite/[token]` have no review step.

**N-16 · `api_token` bearer auth never re-checks membership or entity status**
`apps/api/src/mcp/server.ts:30-62` `resolveToken` checks only `token_hash` and `expires_at`. Compare `requireAuth` (`apps/api/src/auth/middleware.ts:79-82` entity `status='active'`, `:94-96` `getPrimaryActorMembershipResult`). With the member suspended **and** the cooperative suspended: `D3 initialize after suspension -> 200`. This also sidesteps the cooperative-status tightening from tranche-1 commit `255d751`, which lives on the session path only.

**N-17 · API tokens default to never expiring and a cooperative cannot revoke one it did not create**
`expiresInDays` is optional (`apps/api/src/routes/agents/tokens.ts:13`) so `expiresAt` is `null` (`:58-60`) and the expiry branch at `server.ts:44-49` is skipped: `D4 expires_at = null`. The only revocation route (`tokens.ts:88-105`) filters `.where('user_did','=', req.actor!.did)` (`:96`) — the token's own owner. No admin or cooperative-scoped revocation exists anywhere (`api_token` appears in `admin.ts` only inside a truncate list at `:123`): `D4 admin revoke deleted rows = 0`. Combined with N-16, a departed member keeps a permanent, unrevokable credential.

**N-18 · `apps/api/tsconfig.json` excludes `tests/` and `scripts/`, hiding 41 type errors, and the enforcement gap is wider than that**
`apps/api/tsconfig.json:7` is `"include": ["src"]`; `npx tsc --noEmit -p tsconfig.json --listFiles | grep -c "apps/api/tests/"` → **0**, tsc exits 0. `package.json` wires both `build: tsc` and `typecheck: tsc --noEmit` to it. Adding `tests/**` yields 41 errors across 17 files. Same `"include": ["src"]` in `packages/federation/tsconfig.json` and `packages/lexicons/tsconfig.json`.

The absence of enforcement is broader: there is **no `.github/` directory at all**, `turbo.json` defines no `typecheck` task, root `package.json` has no `typecheck` script (so `pnpm typecheck` is not a real command), `apps/api` has no `lint` script so `turbo lint` skips it, and `packages/config/eslint.config.mjs` uses bare `tseslint.configs.recommended` with no `parserOptions.project` — structurally incapable of type-aware checks.

*Honest scoping:* all 41 errors are strictness/narrowing/mock-shape artifacts and `scripts/` has **zero** errors (I confirmed all six scripts enter the program via `--listFiles`), so the alarm about `copy-tier2-governance.ts` being an unchecked Tier 2 mutation hazard is unsupported. No test is currently vacuous. One genuine masked defect: `tests/federation.test.ts:376/617/661` pass `agreementType: 'operating'`, absent from the enum at `packages/common/src/validation.ts:169-179`, and `agreement-service.ts:161` persists it unvalidated — so those tests use a value the HTTP route would 400.

**N-19 · The test harness hand-builds a parallel `Container`, omitting 20 fields and 19 route modules**
`apps/api/tests/helpers/test-app.ts:447` assigns an object literal to `Container` missing 20 required fields (computed: 87 interface fields vs 67 literal keys) — `taskService`, `expenseService`, `revenueService`, `commerceListingService`, `connectorRegistryService`, `webhookService`, `eventBusService`, `reportingService`, `dashboardService`, `mentionService`, `procurementService`, and 9 more. Root cause: `test-app.ts:32` imports only `type { Container }` instead of calling `createContainer()`. 69 unique route factories in `src/index.ts` vs 50 in the harness. Silent because of N-18.

*Do not overstate this:* production builds via `createContainer(config)` (`index.ts:167`), `taskService` is assigned at `container.ts:728`, and `src/` **is** typechecked — the "compiles and ships, throws in production" scenario is impossible via this mechanism. All 20 missing fields are consumed only by `index.ts` wiring or by route modules in the unmounted set, so no currently-mounted route reads an undefined service. And 67 of the 77 route paths in those unmounted modules **are** exercised at API level by Playwright specs that boot the real server (`apps/web/playwright.config.ts:27-40` runs `PORT=3002 pnpm --filter @coopsource/api dev`; e.g. `operations-phase8.spec.ts:38-70` is a full task CRUD lifecycle with status assertions). The real consequence is narrower: 10 endpoints have no coverage anywhere, and the harness can keep drifting with no build failure — concretely blocking a regression test for KNOWN **O-13** (`apps/api/src/routes/connectors/webhooks.ts:141`, unauthenticated inbound webhooks, and its `webhookService`/`eventBusService` are among the 20 missing).

**N-20 · Vitest's `exclude` override makes `pnpm test` collect and run stale compiled tests from `dist/`**
`apps/api/vitest.config.ts:15` sets `exclude: ['tests/federation-e2e/**','node_modules/**']`, replacing the default list (which contains `**/dist/**`), and sets no `include`. `npx vitest list --filesOnly` returns 114 files including `dist/services/matchmaking/score.test.js`, whose line 2 imports `./score.js` — so it exercises compiled output, never current source. `apps/api/.turbo/turbo-test.log` shows both the dist and src copies passing in one run. I proved the orphan case by writing `apps/api/dist/zz-stale-orphan.test.js` (a failing test with no source counterpart): collected and run, `Test Files 1 failed (1)`. `turbo.json`'s `test.dependsOn: ["^build"]` is topological, so `pnpm test` never rebuilds `apps/api`, and `Makefile:88-92` `test:all` omits a build.

*Blast radius is one file.* `packages/{spaces-consumer,coop-view,arbiter-client,governance-view}` each set `include: ['src/**/*.test.ts']`; `packages/{common,federation}` don't override `exclude`. `apps/api` is uniquely affected. Fix: add `include: ['tests/**/*.test.ts','src/**/*.test.ts']`, or restore `'**/dist/**'`.

---

### LOW

**N-21 · `ConfirmDialog` leaves dismissal-on-confirm entirely to the caller, and four call sites forgot**
`apps/web/src/lib/components/ui/ConfirmDialog.svelte:35-37` — `handleConfirm` calls `onconfirm?.()` and never sets `open = false`, unlike `handleCancel` at `:30-33`. `Modal.svelte:55` applies `use:focusTrap`. Genuinely affected: `expenses/+page.svelte:282`, `commerce/needs/+page.svelte:272`, `commerce/listings/+page.svelte:275`, `posts/[id]/+page.svelte:111`. **Not** the other six — `tasks/+page.svelte:16-22`, `admin/scripts/+page.svelte:106-108` and `admin/lexicons/+page.svelte:19-21` each clear the id in a `$effect` keyed on the result; `agreements/[uri]`, `governance/[id]` and `campaigns/[uri]` server actions `redirect(303,…)`, and SvelteKit's enhance calls `applyAction` on a redirect (`@sveltejs/kit/src/runtime/app/forms.js:113-116`), destroying the component. Also: backdrop click (`Modal.svelte:33-35`) and the X button (`:65-71`) both dismiss. Fix belongs in the component, not ten call sites.

**N-22 · The C-03 containment suite's catch-all accepts any exception as success**
`apps/api/tests/tier2-placement-containment.test.ts:65-79` — `resolvedKind()` catches *every* exception and returns `'refused'`, so 18 of the file's 25 tests would also pass on a DB failure or a refactor-introduced `TypeError`. Tighten to `catch (e) { expect(e).toBeInstanceOf(ValidationError); return 'refused'; }`. Introduced by this branch's C-03 fix. *Four parts of the original submission were wrong and should not be carried forward:* the file has 25 tests not 32; `throw new Error('boom')` in `resolveWritePlacement` does **not** leave it green (lines 100/112/129/142/154/198 assert concrete kinds); the file does verify permissioned-space resolution (`:91-101`, `:103-113`, `:132-143`, `:189-199`); and the loop **does** catch its named C-01/C-03 regression, since a collection leaving the confidential set returns `'public-repo'` at `governance-record-placement-port.ts:80` with no throw.

**N-23 · API token `scopes` are stored, returned, and resolved but never enforced.** Validated at `apps/api/src/routes/agents/tokens.ts:12`, persisted `:69`, carried into `TokenInfo` at `server.ts:60` — and `grep -n "\.scopes" apps/api/src/mcp/server.ts` returns exactly one hit, line 60. A `['read']` token is indistinguishable from any other.

**N-24 · `/mcp` sits outside both rate limiters.** Mounted bare at `apps/api/src/index.ts:365`; limiters are scoped to `/api/` (`:148`) and `/api/v1/auth/` (`:157`). Unauthenticated requests get an unthrottled sha256 + indexed DB lookup per request (`server.ts:34-40`).

---

### Unexamined by anyone, including me

`apps/api/src/ai/chat-engine.ts` (19 KB), `apps/api/src/ai/triggers/`, and `apps/api/src/routes/agents/{chat,triggers,model-config}.ts` — an LLM tool-execution surface sitting on the same unenforced token path as N-16/N-17/N-23. The only thing I know about it is that `action-executor.ts:117` is one of the two `validateWebhookUrl` call sites and, per S-08, is a working read-SSRF oracle. **This should be the next dimension reviewed.**

---

## 3. Regressions and incomplete remediations from the tranche-1 branch

**R-1 (HIGH, genuine regression) — the new `/members/:did/approve` route reverses suspensions, bypassing the `member.remove` gate.**
`apps/api/src/routes/org/memberships.ts:219-233`, added by commit `f811565` (`git show main:apps/api/src/routes/org/memberships.ts` has suspend and reinstate but **no** approve route; `approveInvitation` was previously unrouted dead code). Gated only by `requirePermission('member.approve')`. `MembershipService.approveMembership` (`membership-service.ts:171-214`) loads the row via `getProjectedMembershipStatus`, which filters only `invalidated_at is null` (`membership-read-model.ts:620-628`), and never asserts `status === 'pending'`; `buildMemberUpdate` then hardcodes `setIfChanged(update,'status',existing.status,'active')` (`packages/arbiter-client/src/group-mutation-port.ts:850`).

Executed as a `coordinator` (holds `member.invite`/`member.approve`/`member.roles.assign`, **not** `member.remove` — `packages/common/src/permissions.ts:65-96`):
```
PROBE M reinstate status: 403
PROBE M approve   status: 204
PROBE M status after approve: active
```
Suspension is load-bearing: while suspended the victim got 401 on `GET /api/v1/members` and `POST /api/v1/proposals`; after the coordinator's approve, authenticated again. The audit trail is *worse*, not better — `membership-service.ts:203-207` sets a `reason` only when the prior status was `'pending'`, so the un-suspension logs as a bare add-member with `reason: null`. Bounded to suspended memberships (a removed member has `invalidated_at` set → 404), and the role ceiling still blocks escalation. Fix: reject any membership whose status is not `'pending'`.

**R-2 (HIGH, incomplete) — C-03 left the two collections its own evidence block names still writing to public repos.**
C-03's evidence cites `agreement-service.ts:689-719` and `funding-service.ts:287-317`. `git diff main...HEAD -- apps/api/src/services/agreement-service.ts` is **empty**; the funding-service diff is confined to `findPledgeByPaymentSession` (the S-06 fix). `createPledge` writes at `funding-service.ts:307-318` and `addStakeholderTerms` at `agreement-service.ts:703-717`, both calling `memberWriteProxy`/`pdsService.createRecord` directly. `resolveWritePlacement` has exactly two production callers, `proposal-service.ts:281` and `:546`; `isConfidentialCsnCollection()` (`packages/lexicons/src/space-placement.ts:78-81`) has exactly one call site repo-wide. Both collections are memberClass-space in `packages/lexicons/src/space-types.ts:73-77`.

Proved with `governance_visibility = 'closed'` (the strictest setting) driving both real routes end to end:
```
TERMS public pds_record: {"uri":"at://did:plc:zs43…/network.coopsource.agreement.stakeholderTerms/3ms4v6o2p3cql",
  "content":{…"financialTerms":{"profitShare":10,…},"governanceRights":{"votingPower":1},…}}
PLEDGE public pds_record: {"uri":"at://did:plc:22vf…/network.coopsource.funding.pledge/3ms4v6nxdns2r"}
```
`local-pds-service.ts:409-411` then `pg_notify`s the full record body. In production it is worse — `member-write-proxy.ts:80-95` forces the real OAuth path and writes to the member's live PDS. Meanwhile `tier2-placement-containment.test.ts:47-89` asserts these nine collections are contained by exercising `CsnDbGovernanceRecordPlacementPort` **directly**, which no writer calls for any of them. The suite is green and the hole is open.

**R-3 (MEDIUM, incomplete) — the C-01 acceptance gate omits the proposal-status test C-01 names.**
C-01's text lists the missing gates as "active-membership, eligibility, **status**, deadline, or cooperative proposal-authority." The fix implements membership, cooperative and deadline; `apps/api/src/appview/indexers/proposal-indexer.ts:218` selects `status` and the gate at `:260-275` never reads it, with `:246-249` explicitly deferring it to Phase 4.

Proved through real routes: created a proposal via `POST /api/v1/proposals` (status `draft`, `closesAt` null), fed a public-firehose `network.coopsource.governance.vote` naming it → `indexVote` returned true, 1 vote row at weight 1. Drove open → close → resolve: outcome `passed`. Control with no injected ballot: `no_quorum`. The same vote through the API is refused 400 "Proposal is not open for voting" (`proposal-service.ts:504`). It also bypasses `assertExecutableVotingType` and the delegation-aware `CoopDelegatedVoteWeightReader` (`packages/coop-view/src/delegated-vote-weight-reader.ts:20-58`), using the flat class weight instead.

*Corrections to the obvious formulation:* the "resolved with `closes_at` NULL" half is **wrong** — `resolve` requires status `'closed'` (`packages/governance-view/src/proposal-lifecycle.ts:25`, asserted `proposal-service.ts:675`) and `closeProposal` always writes `closes_at: now` (`:474`); a post-resolution ballot is correctly discarded. And re-projecting on a resolved proposal is deliberate, covered by `apps/api/tests/public-governance-acceptance.test.ts:153-171` ("re-projects a vote after its proposal resolves, so a reindex is not lossy"). The correct fix preserves rebuildability: gate on `createdAt < proposal.opens_at` (time-invariant), noting `opens_at` is currently never populated by `indexProposal` (`:157` inserts null). Two adjacent gaps on the same path: `indexVote` inserts `choice` verbatim with no validation against the proposal's `votingType`/options (`:211`, `:313`), and firehose vs API ballots by the same member can carry different weights.

Reachable in shipped prod config: `infrastructure/docker-compose.prod.yml:78` sets `TAP_URL`; the tap service (`:98-107`) subscribes to the public relay with filters `network.coopsource.*`.

**R-4 (MEDIUM, incomplete) — S-03 redacts headers only; the same log line still records the OAuth code and the session-exchange token.**
`apps/api/src/middleware/logger.ts:33-36` builds `REDACT_PATHS` solely from `SECRET_HEADERS` (`:18-31`), all of form `req.headers[…]`/`res.headers[…]`. pino-std-serializers logs `_req.url = req.originalUrl` and `_req.query` untouched, and `_res.headers = res.getHeaders()` wholesale. Captured from the real exported `createHttpLogger`:
```
"req":{"url":"/api/v1/auth/oauth/callback?code=AUTHZCODESECRET&state=…","query":{"code":"AUTHZCODESECRET"},
       "headers":{"cookie":"[Redacted]"}},
"res":{"headers":{"location":"http://localhost:5173/auth/oauth/complete?token=ONETIMEXCHANGE-abc123"}}
```
The authorization code is already spent at log time (`auth.ts:322` redeems before pino serializes on response completion) and is PKCE+DPoP bound, so it has no residual value. The **exchange token** is the real leak: single-use, 60s TTL (`auth.ts:362`), consumed by `apps/web/src/routes/auth/oauth/complete/+page.server.ts:15-20` within milliseconds — but consumption is select-then-delete (`auth.ts:392-408`), non-atomic, so the race is winnable (KNOWN S-09). Root cause is the carrier: a session-bearing token in a query string (`auth.ts:375-377`) also lands in browser history, `Referer`, and the web tier's own logs. `app.use(httpLogger)` is `index.ts:179`. Existing test `apps/api/tests/request-log-redaction.test.ts` covers headers only.

**R-5 (LOW) — S-02's admission policy default flipped from `invite_only` to `open`, and the knob is unreachable from the product.** The enforcement is real, but nothing in the web UI or any API route sets `membership_policy`, so the shipped default is the operative value.

**R-6 (LOW) — the new containment test's catch-all (N-22).**

**Not regressions, checked and cleared:** the C-03 draft-placement change routing all proposals through `private_record` is a strict *narrowing* — pre-fix, `git show 9167b27^:…governance-record-placement-port.ts` returned `{kind:'public-repo'}` for `'open'|'mixed'|default` and `createProposal` passed no `lifecycleState`, so open-visibility coops published draft bodies and ballots to public repos. Nothing on this branch widened any audience. The C-01 gate does **not** break projection rebuildability (the reindex endpoint replays nothing — `admin.ts:290-310` only zeroes `pds_firehose_cursor.last_global_seq`, which the tap path never reads, and the local path's `pds_commit` table does not exist; and the Tier 2 rebuild path calls `indexProposal(…, { authorityVerified: true })` at `permissioned-governance-projector.ts:44`, short-circuiting the gate entirely).

---

## 4. 2026-07-30 UX audit — claims re-tested at `a81d46d`

| ID | Claim | Verdict at HEAD |
|---|---|---|
| **P0-01** | Fixed 224px sidebar, no responsive utilities | **CONFIRMED, one sub-claim retracted.** `AppShell.svelte:47-55`; `Sidebar.svelte:61-65` `class:w-56`/`class:w-14` with no breakpoint. `grep -cE '\b(sm\|md\|lg\|xl):'` over AppShell/Sidebar/Navbar → 0/0/0. Zero `drawer\|hamburger\|matchMedia\|innerWidth` anywhere in `apps/web/src`; the only `@media` in the app is `prefers-color-scheme` (`app.css:170,267`). Viewport meta is present (`app.html:5`), so 390px is real. Measured in headless Chromium: 390 → aside 224, content box 118 after `p-6`, governance tab strip 484.7px. **Retract** "not recoverable by page-level horizontal scrolling" — `AppShell.svelte:51` gives `<main>` `overflow-auto` (`mainHorizontallyScrollable: true`, `documentScrollWidth: 390`). Severity **medium**, not high: degraded-but-reachable, no security dimension, and 33 of 128 `.svelte` files already use responsive utilities — the shell is the single component defeating them, so it's a narrow high-leverage fix. `playwright.config.ts` still has one `chromium`/Desktop Chrome project; the 390/768/1280 projects were never added. |
| **P0-02** | Commerce collection key mismatch | **RESOLVED** on all five collections plus the `q`/`query` search-param mapping. But the accompanying remedy ("collection failures no longer converted to false empty states") was applied to **commerce only** — governance and members still silently render empty rosters, delegations, agreements and legal documents on API failure. |
| **P0-03** | "The canonical route requires verified membership by the active cooperative" | **REFUTED.** `docs/plans/2026-07-30-v12-phase-7-ux-overhaul-audit.md:212` overclaims. No such check exists in `apps/api/src/routes/org/cooperatives.ts:53-87` or in `(authed)/coop/[handle]/+layout.server.ts:10-24` — only the network-handle rejection (`:11-13`) was implemented. See N-9. |
| **P1-03** | Orphan hubs | **UNRESOLVED.** Sixteen implemented routes, including the entire commerce subtree, have zero inbound links. |
| **P1-04** | Proposal metadata | **RESOLVED.** Shared `ProposalResponseSchema` parsed on both sides. |
| **P1-06** | 62 `state_referenced_locally` warnings / 14 files | **CONFIRMED UNCHANGED** — `npx vite build` emits exactly 62 (31 unique positions × SSR+client) across 14 files. Compiling with svelte 5.53.5 shows `admin/+page.svelte` generates `const tabs = [{ …, count: $$props.data.officers.length }]` while `members/+page.svelte:24` correctly generates `$.derived`. Six pages genuinely go stale (admin, governance, partners, admin/pipeline, finance/patronage, onboarding). **Severity low**: the only consequence is a wrong integer in a tab badge; the panels read `data.*` inside the template and render correctly. Two corrections — `finance/+page.svelte:11` cannot go stale (no actions, no enhance, no query links), and patronage's fiscal-period selector at `:91` uses `window.location.href`, a full document load, so only the form-action path (`:169`, `:186`) diverges there. |
| **P1-07 / P2-03** | (per dimension review) | P1-07 **confirmed in full**; P2-03 **confirmed and worse than reported**. |

Structural accessibility state, independently measured: zero `aria-live` regions, zero `aria-current`, zero `role="tabpanel"`/`aria-controls`, one real `role="alert"` in application code, no `$navigating` signal, and 25 of 26 files with raw `<table>` markup lack a horizontal-scroll container. Modals now have a working focus trap — a genuine improvement over the older baseline — but no vertical overflow handling, no background inerting, and no body scroll lock. Runes compliance is complete: zero `export let`, zero `on:` directives, zero `$:`, zero `createEventDispatcher`, zero `<slot>`, zero `<svelte:component>`. `apps/web` contains **zero** `invalidate`/`invalidateAll` calls, and 12 client-side mutation handlers swallow errors with `// silently fail`.

---

## 5. Ecosystem delta since 2026-08-01, and what it changes

**PR #5187: zero delta, and the pin bump is far cheaper than assumed.** `https://api.github.com/repos/bluesky-social/atproto/pulls/5187` — open, draft, `mergeable_state: dirty`, 84 commits, 167 files, head `c5962d7ab23d0f42ccb835e7014a9d38f24ad002`, `updated_at 2026-07-31T23:27:13Z`. Identical to the baseline; no force-push (parent chain intact through `b76a4cf`). The one commit that moved it on 07-31 (`tighten space scope validation`, 16 files) makes space keys conform to record-key syntax (≤512 chars, restricted charset) and makes unresolvable space-scope declarations **throw** instead of silently passing.

**The important new fact:** directory listings at CSN's pin `3f6c96d5d2d25438bd40fa89d6ecc37865f8e354` versus `permissioned-data` return **identical file sets and identical blob SHAs** for every file in both `com/atproto/space` and `com/atproto/simplespace` (e.g. `getRepo.json` = `6cd685a4…` at both refs; `simplespace/createSpace.json` = `b447265f…` at both). The ~10 commits of churn are entirely TypeScript implementation. **The pin bump 3f6c96d5 → c5962d7 is a metadata change plus a behavioural review, not a schema regeneration.** It also corrects the repo's note that "CSN's pin says PR #5187 lacks getRepo" — `getRepo.json` existed unchanged at the pin; what landed later was the provider implementation.

**A-06 is not forward-compat work — it is a live break against a released PDS, and the fix is available on npm today.** I downloaded `https://registry.npmjs.org/@atproto/oauth-scopes/-/oauth-scopes-0.5.7.tgz`: it ships `dist/scopes/repo-permission.js`, `REPO_ACTIONS = ['create','update','delete']`, `class RepoPermission`, and `scopeNeededFor()`. And `packages/pds/src/api/com/atproto/repo/createRecord.ts:65` on atproto main is:
```ts
if (auth.credentials.type === 'oauth') {
  auth.credentials.permissions.assertRepo({ action: 'create', collection })
}
```
`ScopePermissionsTransition.allowsRepo()` short-circuits true **only** when `transition:generic` is present. CSN's `BASE_OAUTH_SCOPES` (`apps/api/src/auth/oauth-client.ts:36-44`) is `['atproto', 'rpc:network.coopsource.…' ×6]` — no `repo:` token, no `transition:generic`. **Every member record write through `com.atproto.repo.*` will be rejected by a released PDS 0.5.23.** The comment at `oauth-client.ts:31-34` ("The PDS does not enforce per-namespace scopes yet (as of @atproto 0.6.x / PDS 0.4)") is factually stale. CSN does not currently depend on `@atproto/oauth-scopes` at all. Recommend **re-grading A-06 upward and pulling it before Phase 2**, since it gates any real-PDS exercise. Note the `space:` scope class is still PR-only (absent from main and from the release), so the two halves cleanly separate.

**`@atproto/space` still 404s** (`https://registry.npmjs.org/@atproto/space`). Nothing from #5187 has merged to main (`lexicons/com/atproto` on main has no `space` or `simplespace`). The only formal review on the PR remains matthieusieben's 2026-07-03 comment arguing for unified `com.atproto.space.createSpace` with a required policy parameter — unresolved after 30 days, and the branch still ships the split shape. **`com.atproto.simplespace.createSpace` is the highest-churn-risk pinned method; keep creation behind `GroupMutationPort` with no NSID leakage into services.**

**CLAUDE.md's watch values are wrong.** It records `@atproto/oauth-scopes` 0.5.3 and `@atproto/pds` 0.5.14; actual latest are **0.5.7** and **0.5.23** (both published 2026-07-30/31, nothing since). Also unpinned but actually depended on: `@atproto/crypto` 0.5.4, `@atproto/xrpc` 0.8.8, `@atproto/tap` 0.3.12, `@atproto/lexicon` 0.7.9, `@atproto/lex-cbor` 0.1.5, `@atproto/lex-cli` 0.10.8. CSN's caret ranges (`^0.19.0`, `^0.4.5`, `^0.0.15`) all cap below **one shared 0.x-minor boundary** — PR #4929 (Node 22 min), #4943 (pure ESM), #4930 (TypeScript 6.0). CSN already satisfies both breaking changes (`engines: node >=24`; all four packages declare `"type": "module"` with `NodeNext`). The only API-shape break in the whole gap is `@atproto/oauth-client-node` 0.5.0's `onUpdate`→`onSessionUpdated` rename — and `apps/api/src/auth/oauth-client.ts:101-122` passes neither hook. **The dependency refresh is mechanically low-risk and is currently absent from Gate 0 and Phases 1–8.**

**The Lexicon Community process inverted five days before the baseline, and nobody caught it.** `https://lexicon.community/governance/model/` was amended effective 2026-07-26: *"Working groups are self-formed: anyone may form one, TSC members and the community at large alike. No TSC vote or blessing is required to begin."* TSC authority moves to PR-approval time; the bar is "real-world use." This **directly obsoletes ARCHITECTURE-V12.md §12 watchlist item 2** ("the process is TSC-sponsored (gated, slow). Start sponsorship outreach early"). Separately, `lexicon-community/lexicon` on GitHub is now `"archived": true` (last commit `b4a2b19`, 2026-07-27); the canonical repo is `https://tangled.org/lexicon.community/lexicons` and NSIDs resolve through `did:plc:mtr7qrqtcyseedx3jyr5o7db`. **No governance/group/membership namespace exists** in `community.lexicon.*` (published: app, bookmarks, calendar, interaction, location, payments, preference) and no competing proposal has appeared. The August monthly meeting is **2026-08-06, 17:00 UTC** (Discourse topic 1013), agenda: working group formation and TSC approval processes.

**Proposal 0016 text is frozen** at `1caad93` since 2026-07-03 (the entire proposals repo has had no commit in 30 days), while the implementation keeps moving — so the `read_self` and DAG-CBOR-ordering divergences will not be closed from the proposal side. Issues #97 (make `getSpaceCredential` more generic — an optional freeform-claims component that would let identity be omitted, which would weaken CSN's "DIDs are authoritative" assumption on the Axis-2 gate) and #98 (blob uploads when space host ≠ repo host) both have **zero maintainer comments** two days on.

**Independent implementations, briefly:** the dominant pattern is now **vendor-namespaced mirroring** — Habitat ships `network.habitat.space.*`/`network.habitat.simplespace.*` (its `com/atproto/` tree has only repo and server), and Northsky Stratos ships `zone.stratos.space.*` mirrors while documenting that "the proposal still describes itself as not final." HappyView is the exception (real `com.atproto.*` NSIDs) but is stable only at v2.11.8 with spaces under an "Experimental" heading, and calls the config method `com.atproto.simplespace.updateConfig` while upstream defines `updateSpace.json` — another reason it cannot be a conformance oracle. The only post-Aug-1 spaces advance anywhere is ngerakines' `c2e9e08` (2026-08-01), *"verify space credentials from remote authorities"*: resolve the authority's DID document, prefer verification method `#atproto_space`, fall back to `#atproto`, exact-fragment match, surface deployment errors rather than silently failing — worth recording as a watch item since it is not in the proposal text. **Interop across implementations is currently zero by construction; any CSN interop claim would be false.**

---

## 6. What I would do next, in order

**Gate 0-bis — make the project buildable and the signal trustworthy. Nothing else is worth doing first, because you currently cannot verify any fix in the shape it ships.**

1. **Fix the test harness isolation (N-7).** Derive `TEST_DB_NAME` and `ADMIN_URL` from `getTestConnectionString()` the way `apps/web/tests/e2e/global-setup.ts:11-14` already does, and default to `coopsource_test_${process.pid}`. *Rationale: until this lands, every "the tests pass" statement in this program is unfalsifiable — I measured 287 and 456 phantom failures on this exact commit.* Then N-20 (one line in `vitest.config.ts`) and N-18 (a typecheck-only tsconfig plus a `turbo.json` typecheck task).
2. **Fix both Dockerfiles and the migrator (O-01, N-8, O-02).** Six `COPY` lines for governance-view/coop-view in build *and* runtime stages; `--ignore-scripts` (or `pnpm prune --prod`) on `apps/web/Dockerfile:17`; a `cp` of `schema.sql` into `packages/db` build output. Also un-anchor the `.dockerignore` patterns so the host `dist/` stops masking the fact that neither Dockerfile builds workspace deps. *Rationale: three loud, mechanical, ~30-minute fixes that convert "no deployment path exists" into "a deployment path exists," which is a precondition for validating anything else in ops.*
3. **Commit the audit plan.** It is untracked (`?? docs/plans/2026-07-31-…`), and the 2026-08-01 assessment does not exist in the tree at all. Reconcile before anyone acts on amendment IDs.

**Tranche 1-bis — finish what tranche 1 started, before starting tranche 2.**

4. **R-1**, then **R-2**, then **R-3**, then **R-4.** *Rationale: R-1 is a privilege bypass this branch created — it must not survive a merge. R-2 and R-3 matter more than their severity suggests because their green test suites are actively misleading: `tier2-placement-containment.test.ts` will keep passing while pledges and stakeholder terms hit the public firehose. For R-2, put the containment at the write boundary (`MemberWriteProxy.writeRecord` and `IPdsService.createRecord`) rather than adding a third and fourth `resolveWritePlacement` call site, and re-point the containment test at the real routes (`POST /api/v1/campaigns/:uri/pledge`, `POST /api/v1/agreements/:uri/terms`) asserting no `pds_record` row exists.*

**Then the criticals, in this order:**

5. **C-04** (`federation-auth.ts:19-21` session short-circuit + five agreement handlers that never call `federationCallerDid`). *Rationale: it is the only confirmed unprivileged forgery — a plain `member`, or even an unapproved pending applicant, mints and retracts legal signatures for arbitrary DIDs, and the unique partial index at `schema.sql:3397` means a forged row also blocks the real signer.* Fix A-07's minimal containment in the same change: assert `@method` and `@target-uri` coverage, and require `content-digest` coverage plus a matching header whenever a body is present (drop the `body &&` short-circuit, which currently lets a with-body signature verify against a stripped body).
6. **C-06** — one `db.transaction()` plus conditional single-statement UPDATEs across `capital-account-service.ts` (`:70-99`, `:104-183`, `:214-258`), plus **N-3** (status CAS on both expense UPDATEs, `numUpdatedRows === 1`, 409 on miss) and **N-4** (`NULLS NOT DISTINCT` + a period-level guard). Add `CHECK (balance >= 0)` to `packages/db/src/schema.ts` and regenerate `schema.sql` — do not add a migration file. *Rationale: these are the only findings that create or destroy money under ordinary single-user operation. Two concurrent $100 redemptions against a $100 balance both succeed today (`balance=0, total_redeemed=100, ledger=-100`), and three identical patronage POSTs yield a 240 balance for an $100 surplus.*
7. **C-05**, at `pipeline.ts` not `loop.ts`. *Rationale: `loop.ts:127` is not the load-bearing swallow — `processFirehoseEvent` absorbs everything internally at `pipeline.ts:130-134`, `:88-97` and `:147-160`, so a fix confined to `loop.ts` changes nothing. And in the Postgres-down case `recordDeadLetter` itself fails, its own `.catch()` swallows that, and the event is acked with no `pds_record`, no projection, and no dead-letter row — zero forensic trace.* Bundle O-12's missing retry endpoint: `dead-letter.ts:9` documents retry, `hook_dead_letter.retry_count` has no writer, and no retry route exists.
8. **S-08**, treating `packages/common/src/did-web.ts:21-30,68,71` as the root (the `http://` downgrade for every dotted-quad plus honoured `%3A` ports) and wiring the *existing* `apps/api/src/utils/url-validation.ts` into DID resolution — with `redirect: 'manual'` plus post-resolution IP checks, since an allowlisted https host can 302 to `http://169.254.169.254`. Fix `validateWebhookUrl`'s eleven bypasses in the same pass, including the dead `hostname === '::1'` branch (Node returns IPv6 literals **bracketed**, so no IPv6 literal can ever match it).

**Then the new surface:**

9. **N-1** (thread `system_config.cooperative_did` or `req.actor.cooperativeDid` into `getCooperative()`), **N-2** (fix the MCP transport and the four unscoped tools **in one commit**), **N-16/N-17** (re-check membership in `resolveToken`; add a cooperative-scoped revocation route; default a TTL).
10. **Review `apps/api/src/ai/`** — the last unexamined surface, sitting on the same token path.
11. **A-06 as a released-dependency fix**, ahead of its current Phase 2 slot: add `@atproto/oauth-scopes` 0.5.7, emit `repo:<nsid>?action=…` via `RepoPermission.scopeNeededFor`, and correct the stale comment at `oauth-client.ts:31-34`. Then bump the #5187 pin `3f6c96d5 → c5962d7` — now a review-only change, since no lexicon byte moved.
12. **Reply to Discourse topic 1013 before 2026-08-06** to put a `community.lexicon.governance.*` working group on the agenda. *Rationale: the namespace is uncontested, the TSC gate has moved to the end of the process, and the acceptance bar is demonstrated real-world use — which the `GovernanceView` plugin set and running records already satisfy. This is the cheapest available de-risking of Phase 5's lexicon dependency, and it expires in four days.* Outward-facing, so it needs your review before posting.

**Deliberately deprioritized:** P0-01's responsive shell (real, but medium, and one aside + one wrapper whenever you get to it), the WCAG token fix (N-6, three lines but no security dimension), and every "test harness could be better" item beyond step 1. **Do not** act on the fiscal-period `text`-vs-`uuid` framing as originally submitted — changing that column fixes nothing; N-4's `NULLS DISTINCT` root cause is the money bug.