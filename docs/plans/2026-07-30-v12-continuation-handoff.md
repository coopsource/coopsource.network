# V12 Continuation Handoff

- **Date:** 2026-07-30
- **Status:** Active handoff
- **Implementation baseline:** `main` at `b88ed06`
- **Next phase:** Phase 7, Wave 0 baseline integrity

## Recovery Point

The implementation work is complete through the network-navigation repair and
its Home-card follow-up. `main` at `b88ed06` is clean, pushed, and includes all
feature checkpoints listed below. The handoff document is a later docs-only
checkpoint; use the current clean `main` rather than resetting to the
implementation baseline.

Docker is running. Web E2E tests use the Docker PostgreSQL service at
`localhost:5433` by default:

```text
postgresql://coopsource:dev_password@localhost:5433/coopsource_test
```

`E2E_DATABASE_URL` and `E2E_DATABASE_ADMIN_URL` can override those defaults.
The E2E setup derives the admin database URL from the test URL, recreates
`coopsource_test`, and runs migrations. On this machine, prepend the bundled
Node 24 runtime when invoking Playwright:

```bash
PATH=/Users/alan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  pnpm --filter @coopsource/web exec playwright test tests/e2e/auth.spec.ts
```

Push authentication now works. Continue to push feature branches and `main`
after successful no-fast-forward checkpoint merges. Do not publish ecosystem
proposals, forum posts, TSC material, or other outward-facing communication
without explicit user approval.

## Read First

1. `AGENTS.md`
2. `ARCHITECTURE-V12.md`
3. `CLAUDE.md`
4. `docs/plans/2026-07-04-v12-program-plan.md`
5. `docs/plans/2026-07-29-atproto-permissioned-spaces-research-report.md`
6. `docs/plans/2026-07-29-v12-permissioned-spaces-gap-analysis.md`
7. `docs/plans/2026-07-30-v12-phase-7-ux-overhaul-audit.md`
8. `docs/plans/2026-07-30-v12-signoff-register.md`
9. this handoff

The user explicitly retired the custom "The Loop" directive. Use normal
engineering judgment and the repository's feature-branch, review, test, and
no-fast-forward checkpoint discipline.

## Completed Work

The requested continuation began from `f87dae6`. First-parent checkpoints now
on `main` are:

| Merge     | Checkpoint                                        |
| --------- | ------------------------------------------------- |
| `319b390` | Phase 5 generic proposal/vote extraction          |
| `25b2895` | Permissioned-spaces research and gap analysis     |
| `f7335b1` | Proposal 0016 conformance baseline                |
| `6cbf2bc` | Permissioned proposal/vote ingestion              |
| `e72efef` | Public repository lifecycle events                |
| `cfda68c` | Permissioned target differential runner           |
| `cf02f29` | Generic governance record placement port          |
| `a145514` | Managing-app access policy                        |
| `bb76676` | Tier 2 migration-readiness audit                  |
| `8971812` | Disabled Tier 2 copy/verification ledger          |
| `b00a460` | Dormant outbound HTTP federation retirement       |
| `90ef740` | Federation-outbox residue retirement              |
| `b104274` | Deprecated hub-route retirement                   |
| `88b9eb2` | Production ATProto substrate guard                |
| `752fefe` | Phase 7 UX audit                                  |
| `71d10af` | Commerce API/web contract repair                  |
| `3d1134f` | Network workspace navigation and authority repair |
| `b88ed06` | Home network-card route correction                |

### Phase 5

`GovernanceView` owns generic tally/outcome, proposal lifecycle, and the
unweighted vote-summary projection used by `ProposalService`. Focused
GovernanceView and API tests preserve the existing proposal response. Broader
cooperative policy remains in `CoopView`. Community governance drafts remain
non-canonical and outward publication remains gated.

### Research And Phase 4

The July 29 research covered Proposal 0016, atproto PR `#5187`, HappyView
through `2.12.0-dev.2`, the Atmosphere forums, Bluesky posts, Roomy, Arbiter,
Blacksky, Habitat, and related permissioned-space experiments. The durable
conclusions are:

- Proposal 0016 is the serious target but remains an unstable draft.
- Protocol repository discovery/verification and application membership
  acceptance are separate layers.
- Roomy is a useful product and architecture peer, but its deployed private
  storage is not Proposal 0016 conformance.
- Multiple custody models remain active; CSN must not choose cooperative
  retention and authority policy accidentally through an adapter.
- HappyView is a compatibility/differential harness, not CSN's protocol oracle
  or application query layer.
- Keep `apps/api` as CSN's AppView.

The first real permissioned governance read/recovery path, lifecycle handling,
conformance differential, generic placement port, and managing-app policy are
implemented. Risky capabilities remain disabled by default. Tier 2 migration
has audit and copy-ledger tooling but no approved live copy, authority flip,
source deletion, or remote rollback.

### Phase 6

Dormant outbound federation code, stale outbox residue, and unimplemented hub
stubs are retired. Active signed inbound federation workflows remain until
their replacements are proven. Production now fails closed unless configured
with real PDS/PLC endpoints and a non-default PDS admin credential. Local
substrates remain valid development/test infrastructure.

### Phase 7

The audit found 88 rendered pages, a broad route alias surface, six disabled
Playwright scenarios, no mobile regression boundary, incomplete navigation,
API/web collection-shape drift, and stale-state warnings. Wave 0 progress:

1. Commerce collection/search/archive contracts are repaired. Existing client
   response behavior is covered by API, client, browser, and E2E tests.
2. Network workspaces now use an explicit `network` context, expose only their
   valid cooperative roster, route all switcher/sidebar/Home entries through
   `/net`, reject network handles under `/coop`, require verified membership by
   the active cooperative, and fail closed on degraded membership authority.
   Misleading network Governance and Agreements pages were removed because
   they loaded cooperative-scoped records without a target-network contract.

Network Governance and Agreements must remain absent until V12-S13 is signed
off and a target-scoped authority seam exists.

## Verification At Handoff

The network checkpoint and follow-up passed:

- web unit tests: 3 files, 61 tests;
- Svelte check: 0 errors, 31 known warnings in 14 files;
- lint: 4 tasks;
- API tests: 107 files, 1,020 tests;
- network Playwright: 5 tests, including join, Home card, switcher,
  roster-only navigation, retired-route 404s, `/coop` alias rejection, and
  non-member 403;
- repository build: 10/10 tasks; and
- repository test: 17/17 tasks.

The repository-wide gate is:

```bash
pnpm build && pnpm test
```

## Open Decisions

The authoritative list is
`docs/plans/2026-07-30-v12-signoff-register.md`. V12-S01 through V12-S13 are
open. Of immediate Phase 7 relevance:

- V12-S11 keeps cooperative acquisition invite/read-only until admission
  policy, privacy, review, appeal, and legal safeguards are approved.
- V12-S12 allows defect/accessibility/responsive work but gates a new default
  information architecture or visual direction on user review.
- V12-S13 keeps networks roster-only until representation, delegation,
  revocation, visibility, correction, appeal, and governance authority are
  approved.

When an individual/cooperative tradeoff is unavoidable, favor legitimate
cooperative governance, continuity, and audit interests without overriding
human rights, privacy, due process, anti-discrimination, correction/deletion,
or other legal protections.

## Next Executable Slice

Create:

```text
feature/v12-phase-7-registration-handle-repair
```

The registration UI requires and submits `handle`, and both
`AuthService.register` and entity persistence already support it. The route
parses `RegisterSchema`, which currently omits `handle`, then destructures and
forwards only email, password, display name, and invitation token. The result
is a successful account with a null handle and a disabled E2E scenario whose
old 500-error explanation is obsolete.

Smallest coherent repair:

1. Add the canonical handle field and existing handle constraints to
   `RegisterSchema`; do not introduce a compatibility schema.
2. Forward the parsed handle through `POST /api/v1/auth/register` to
   `AuthService.register`.
3. Cover HTTP registration response, persisted entity handle, and
   `/api/v1/auth/me` behavior. Include invitation registration if the shared
   route/schema contract makes that materially different.
4. Re-enable
   `apps/web/tests/e2e/auth.spec.ts` registration success and assert that the
   registered profile exposes the chosen handle.
5. Preserve current cooperative admission behavior. This is identity contract
   repair, not approval of unilateral cooperative joining.
6. Review the diff, run focused common/API/web/E2E tests, then
   `pnpm build && pnpm test`, commit, push, no-fast-forward merge to `main`,
   and push `main`.

After registration, continue Wave 0 in this order:

1. align proposal detail metadata with the API response;
2. repair the remaining proposal-delete and expense-delete Playwright fixmes
   and remove obsolete explanations;
3. add API-to-web response contract tests; and
4. remove Svelte stale-state warnings in core journeys.

Do not begin the signed-off information-architecture default switch while
V12-S12 remains open.

## Next-Session Prompt

```text
Continue V12 in:

/Users/alan/projects/utm/vmshared/coopsource.network

Start from clean, synchronized main. Confirm it contains implementation
baseline b88ed06 and read:
- AGENTS.md
- ARCHITECTURE-V12.md
- CLAUDE.md
- docs/plans/2026-07-04-v12-program-plan.md
- docs/plans/2026-07-29-atproto-permissioned-spaces-research-report.md
- docs/plans/2026-07-29-v12-permissioned-spaces-gap-analysis.md
- docs/plans/2026-07-30-v12-phase-7-ux-overhaul-audit.md
- docs/plans/2026-07-30-v12-signoff-register.md
- docs/plans/2026-07-30-v12-continuation-handoff.md

Create feature/v12-phase-7-registration-handle-repair and execute the
"Next Executable Slice" from the handoff. Preserve the UI-submitted handle
through RegisterSchema, the auth route, AuthService, persistence, response,
and /auth/me; add focused common/API/web tests; re-enable and strengthen the
registration Playwright scenario.

Do not change cooperative admission policy, activate signoff-gated defaults,
replace apps/api with HappyView, migrate persistence/transport, or publish
outward-facing material. Favor legitimate cooperative interests subject to
human rights and legal protections.

Docker is running. E2E PostgreSQL defaults to localhost:5433 with
coopsource/dev_password. Use the bundled Node 24 PATH documented in the
handoff for Playwright. Review and address findings before commit. Use feature
branches and no-ff checkpoint merges. Run focused tests and
pnpm build && pnpm test before merging; push the feature branch and main when
successful.
```
