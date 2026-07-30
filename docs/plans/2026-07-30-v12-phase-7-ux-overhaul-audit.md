# V12 Phase 7.1 UX Overhaul Audit

- **Date:** 2026-07-30
- **Status:** Complete; remediation not started
- **Code baseline:** `main` at `88b9eb2`
- **Scope:** all current web routes, the six program journeys, shared shell
  and UI components, and the Playwright regression suite

## Purpose

This audit establishes the behavioral and information-architecture baseline
for Phase 7. It does not select a visual direction or authorize a production
membership policy. Defect repair, accessibility, responsive behavior, and test
integrity can proceed without visual-direction signoff. The information
architecture and visual system remain review checkpoints.

The interim product posture favors legitimate cooperative authority:

- joining a cooperative is invite- or request-based unless the cooperative
  explicitly adopts an open-admission policy;
- joining a network is a cooperative action, not an individual account action;
- public discovery must not imply access to private membership or governance;
  and
- cooperative control does not displace privacy, due process,
  anti-discrimination, correction, deletion, or other legal rights.

## Method

The audit combined:

1. static inventory of route files, layouts, navigation, page actions, shared
   components, and direct links;
2. inspection of all six core journey implementations and their API client
   contracts;
3. build diagnostics and test-suite structure;
4. runtime checks against a disposable seeded test database at 1280x720 and
   390x844; and
5. focused checks of all six disabled Playwright scenarios.

This is an engineering UX audit, not user research. It does not replace
interviews with members, officers, bookkeepers, facilitators, or network
operators.

## Inventory

| Measure | Current result | Interpretation |
| --- | ---: | --- |
| Rendered `+page.svelte` views | 88 | Confirms the program-plan page count |
| `+page.server.ts` files | 117 | Includes actions, loads, and redirects |
| Server-only redirect/alias pages | 30 | Old global paths and workspace roots remain |
| Rendered-page source | 15,196 lines | Broad, unevenly componentized surface |
| Playwright spec files | 43 | Broad feature naming coverage |
| Playwright tests | 340 | Almost entirely desktop and route-local |
| Disabled Playwright tests | 6 | Two live defects; four stale fixtures/reasons |
| Direct `page.goto` calls | 236 | Tests often bypass real navigation |
| Direct workspace `page.goto(wp(...))` calls | 178 | Orphan routes can still appear covered |
| Mobile, screenshot, or visual assertions | 0 | No responsive regression boundary |
| Pages containing tables | 21 | Dense operational surface |
| Table pages without horizontal containment | 19 | High mobile clipping risk |
| Svelte stale-state build warnings | 62 in 14 files | Navigation/action invalidation risk |
| Pages with submitting/loading/saving state | 58 | Action progress is locally implemented |
| Pages rendering form error/message state | 52 | Only one route marks it as an alert |

There is no application-wide navigation progress indicator or busy
announcement. Loading feedback exists only in isolated widgets and load-more
actions.

## Current Information Architecture

```text
Public
  home / explore / cooperative profile / person profile
  setup / register / login / invitation acceptance

Personal workspace
  Activity / Explore / Matches
  My Coops
  Profile / Settings

Cooperative workspace
  Members / Governance / Posts / Finance / Admin
  Networks / Partners / Alignment / Campaigns
  Profile / Settings

Network workspace
  Cooperatives / Governance / Agreements
```

The visible structure is much smaller than the implemented product. The
cooperative has routes for dashboard, commerce, tasks, time, schedule,
reports, expenses, revenue, and integrations without an inbound application
link. Their E2E tests navigate directly to those URLs.

The cooperative root redirects to Members even though a cooperative dashboard
exists. The dashboard itself has no inbound link and converts reporting
failures into plausible zero values, so it is both orphaned and potentially
misleading.

The Network line above describes the implemented route tree, not the rendered
sidebar. The network layout identifies itself as a cooperative workspace and
therefore receives cooperative navigation links that do not exist under
`/net/:handle`.

## Severity

| Severity | Meaning |
| --- | --- |
| P0 | A supported surface is unavailable or the primary interface is unusable |
| P1 | A core journey is broken, misleading, inaccessible, or difficult to discover |
| P2 | Material consistency, maintainability, or secondary-flow debt |
| P3 | Polish that can follow structural remediation |

## Findings

### P0-01: Authenticated application is unusable on mobile

At 390x844, the fixed 224 px sidebar remains in normal desktop mode. The
content column receives 166 px. The shell also applies overflow clipping, so
content that extends beyond that column is not recoverable by page-level
horizontal scrolling.

Measured on the Members page:

- sidebar: 224 px;
- main content: 166 px;
- members table: approximately 430 px; and
- visible document width: 390 px with the overflow clipped.

Governance tabs and the New Proposal action also extend outside the viewport.
This affects every authenticated page, not only table views.

**Required response**

- replace the fixed mobile sidebar with a drawer or compact navigation mode;
- give the top bar and breadcrumbs narrow-screen behavior;
- make tabs scrollable or use an appropriate compact selector;
- define table-specific mobile behavior instead of relying on page clipping;
  and
- add 390 px, 768 px, and 1280 px Playwright projects with screenshots for
  each core journey.

### P0-02: Commerce collection pages render a 500

`apps/api/src/routes/commerce/listings.ts` returns:

```text
{ listings, cursor }
```

`apps/web/src/lib/api/client.ts` declares:

```text
{ items, cursor }
```

The page load assigns `result.items` to `data.listings`, then
`+page.svelte` reads `data.listings.length`. Runtime result: an internal error
on `/coop/:handle/commerce/listings`, including the empty state.

Implementation review found the same mismatch for the named `needs`,
`agreements`, `projects`, and `resources` collections. Their pages fail the
same way, while the Commerce overview catches the mismatches and reports
plausible zero counts. Public listing search also sends `query` while the API
accepts `q`. The two commerce edit/archive fixmes are live manifestations of
the listing defect.

**Required response**

- normalize the API/client contract in one place;
- add empty, populated, filtered, and search route tests; and
- re-enable the commerce edit and archive tests.

**Resolved 2026-07-30:** the typed client and all collection loaders now use
the API's named response keys, marketplace search sends `q`, collection
failures are no longer converted to false empty states, and archived listings
are excluded by default but remain available through an explicit filter.
Focused client, API, empty-page, search, edit, and archive regressions cover
the repaired boundary.

### P0-03: Network workspace navigation targets nonexistent routes

The network route tree implements:

- `/cooperatives`;
- `/governance`; and
- `/agreements`.

The shared sidebar treats a network as a cooperative with an `isNetwork`
label. It renders “Cooperatives” with an `/members` href and also renders
Posts, Networks, Partners, Alignment, Campaigns, Profile, and a
network-prefixed Settings link. Except for Governance and the globally scoped
Profile link, those destinations do not exist under `/net/:handle`.

The network root redirects to the real `/cooperatives` page, but the sidebar
cannot return there and does not mark it active.

**Required response**

- define a dedicated network navigation section from the actual route tree;
- add Agreements to that navigation;
- keep person-scoped Profile global and suppress nonexistent network Settings;
- test every rendered network navigation href; and
- add a network-workspace journey beginning at the workspace switcher.

### P1-01: Cooperative acquisition journey promises an action that does not exist

The Home guide says “Create or join” and links to Explore. Explore requires a
search term, results lead to a read-only public cooperative profile, and the
profile offers no invitation request, membership request, or creation action.

This is more than missing copy. The system has no reviewed cooperative
acquisition policy for this surface.

**Required response**

- keep current admission invite-only until a policy is reviewed;
- replace the misleading CTA immediately;
- design an explicit “Request membership” contract with cooperative review,
  status, expiry, denial reason, correction, and appeal handling before
  enabling it; and
- keep open admission as a cooperative-level opt-in rather than a platform
  default.

### P1-02: Registration collects and discards the handle

The registration form requires a handle and the SvelteKit action sends it.
`RegisterSchema` omits the field and the API route does not pass it to
`AuthService.register`, so Zod strips it. A runtime registration succeeded
with the returned handle set to `null`.

The disabled “valid registration” test is stale: registration no longer
returns 500, but it does not assert the identity field the form promises to
save.

**Required response**

- add the validated handle to the API contract or remove it from this step;
- reject duplicate/invalid handles with field-level feedback; and
- re-enable the E2E test with a post-registration `/auth/me` handle
  assertion.

### P1-03: Cooperative operations are deep-link-only

The following implemented hubs or tools have no inbound application link:

- dashboard;
- commerce;
- tasks;
- time;
- schedule;
- reports;
- expenses;
- revenue; and
- integrations.

Finance exposes patronage, capital accounts, and tax forms but not expenses or
revenue. Admin exposes a different subset. E2E tests mask this because they
open most feature URLs directly.

**Required response**

- organize cooperative work under stable Overview, People, Governance,
  Operations, Finance, Network, and Settings destinations;
- make role restrictions visible without making legitimate tools
  undiscoverable;
- give every retained page an inbound route or explicitly classify it as
  internal/deprecated; and
- make a real cooperative overview the workspace root.

### P1-04: Proposal detail displays blank governance metadata

The API returns `votingType`. The web `Proposal` type and detail view expect
`proposalType` and `votingMethod`. Runtime output shows blank values after
“Type:” and “Voting:” on a valid proposal.

This is a trust problem on a governance record, even though proposal creation,
listing, and lifecycle controls otherwise render.

**Required response**

- define one proposal response contract and validate it at the client
  boundary;
- render explicit labels for every supported voting/quorum mode; and
- add API-to-page contract tests, not only isolated API tests.

### P1-05: Responsive and journey coverage are absent

The 340-test suite has no mobile project, screenshots, or visual assertions.
It contains 236 direct navigations and 178 direct workspace navigations.
These prove a route in isolation but not that a user can find or traverse it.

Of six fixmes:

- commerce edit and archive remain blocked by the live listings 500;
- network joining works in the current runtime;
- registration succeeds but loses the handle;
- proposal deletion is seeded with an obsolete proposal payload; and
- expense deletion is seeded with an obsolete expense payload.

**Required response**

- repair or remove stale fixmes before treating the suite as a regression
  baseline;
- add link-driven journey tests that begin at Home or the workspace root;
- reserve direct route navigation for focused route tests; and
- add screenshot and overflow assertions at the three target widths.

### P1-06: Stale-state warnings affect core action surfaces

The web build emits 62 `state_referenced_locally` warnings across 14 files,
including Members, Governance, Finance, Patronage, Admin, Onboarding,
Notifications, Partners, Settings, and agreement templates.

These pages initialize tabs, counts, or editable state from the first load and
may not follow SvelteKit invalidation or workspace changes. This is consistent
with the historical disabled-test explanations even where the underlying
server behavior now works.

**Required response**

- use `$derived` for server-owned display state;
- intentionally copy only draft/editor state into `$state`;
- test same-layout workspace switching and post-action invalidation; and
- make a warning-free production build a migration gate.

### P1-07: Async and error feedback is not a coherent accessibility contract

The application has no global navigation-pending signal. Fifty-two routes
render action feedback, but only the personal Settings route marks an error
with `role="alert"`. The shared Tabs component exposes `tab` roles but has no
arrow-key behavior, tab/panel relationship, or narrow-screen overflow policy.

The global error page provides only a status, message, and Home/Explore link.
The commerce failure therefore discards workspace context and offers no retry.

**Required response**

- add a route-change progress and `aria-live` contract;
- standardize inline field, form, toast, and page error semantics;
- complete Tabs keyboard and panel semantics;
- preserve a safe workspace return path and retry for recoverable reads; and
- add automated accessibility checks plus manual keyboard review.

### P2-01: Hub duplication obscures ownership

Governance combines Proposals, Delegations, Feed, Agreements, and Legal while
Agreements and Legal also have dedicated route families. Members combines
Members, Invitations, and Onboarding while dedicated invitation/onboarding
routes remain. Finance tabs sometimes show data and sometimes only hand off to
another page.

The result is inconsistent history, breadcrumbs, reload state, and linkability.
Tabs used as navigation should be URL-backed; local tabs should remain within
one task.

### P2-02: Several pages are monoliths

The largest views are Members (590 lines), Settings (540), Governance (455),
Admin Scripts (400), and Tasks (398). They mix table rendering, modal state,
permissions, filtering, and multiple actions.

Split by workflow ownership after the IA is chosen. Do not create nested
cards or generic wrappers merely to reduce line count.

### P2-03: Breadcrumbs expose storage identifiers

Dynamic proposal and record routes render UUIDs or encoded identifiers as the
final breadcrumb. Runtime proposal detail showed the raw proposal UUID instead
of its title.

Use load data for human labels and keep identifiers available in inspectable
record metadata, not primary navigation.

### P2-04: Visual system is intentionally generic

The CSS describes itself as Linear-inspired and relies on slate/blue/violet,
10-13 px interface text, and repeated bordered panels. Desktop pages are quiet
and usable, but hierarchy is weak and the cooperative itself is not a strong
context signal.

This finding supports the planned visual-direction exercise. It is not
authorization to restyle the application before review.

## Journey Maps

### 1. Account, onboarding, and cooperative admission

```text
unconfigured instance -> Setup -> admin Home
configured instance -> Register/Login -> Home
invited person -> invitation preview -> accept -> Home/cooperative
Home guide -> Explore -> search -> public cooperative profile -> dead end
```

Target:

```text
identity -> Home -> cooperative discovery
  -> invitation acceptance
  -> membership request (only after policy approval)
  -> create cooperative (separate operator flow)
  -> visible pending/approved/denied status
```

The cooperative owns admission criteria and review. The applicant retains
privacy, correction, explanation, and appeal protections.

### 2. Proposal and voting

```text
cooperative -> Governance -> proposal list -> draft/create
  -> detail -> open -> eligible member vote -> close -> resolve/outcome
```

Current breaks: blank metadata, mobile clipping, unannounced action results,
raw-ID breadcrumbs, and stale action coverage.

Target: one URL-backed proposal workspace with clear phase, eligibility,
deadline, quorum basis, private/public placement, and immutable outcome
evidence. Cooperative lifecycle authority remains separate from generic tally
logic.

### 3. Membership administration

```text
cooperative -> Members
  -> member roster / edit roles / suspend-remove
  -> invitations / issue-revoke
  -> onboarding / configuration-progress-detail
```

Current breaks: a 590-line multi-workflow page, non-responsive tables, local
tab state, and fragmented dedicated routes.

Target: People overview with URL-backed Members, Invitations, and Onboarding
views. Destructive actions require clear impact, authority, confirmation, and
post-action status. Suspension/removal must not erase audit or appeal context.

### 4. Agreements and signatures

```text
cooperative -> Governance/Agreements -> list
  -> template or new agreement -> detail -> sign/activate/terminate
```

Current breaks: duplicate entry ownership, local tab state, dense detail
actions, and weak async/error announcement.

Target: Agreements as a first-class governance destination with templates as a
secondary tool, explicit signer capacity, signature status, version lineage,
and cooperative ratification state.

### 5. Finance and patronage

```text
cooperative -> Finance -> overview
  -> patronage / capital accounts / tax forms
deep link only -> expenses / revenue
Admin -> fiscal periods
```

Current breaks: incomplete navigation, tabs that only reveal another link,
non-responsive tables, and financial zeros that can represent unavailable
dashboard data.

Target: Finance overview with fiscal-period context and direct routes to
Revenue, Expenses, Capital, Patronage, Tax, and configuration. Never substitute
zero for unavailable financial data.

### 6. Cooperative and network directory

```text
Home -> Explore search -> public cooperative profile
cooperative -> Networks -> network detail -> cooperative joins/leaves
network workspace -> Cooperatives / Governance / Agreements
```

Network joining works in the current runtime. Cooperative membership
acquisition does not exist from discovery. The redesigned flow must keep these
actions distinct:

- a person requests or accepts membership in a cooperative; and
- an authorized cooperative actor commits the cooperative to a network.

## Remediation Sequence

### Wave 0: Baseline integrity

1. [x] Fix commerce list/search contracts.
2. Correct network workspace navigation.
3. Preserve or remove registration handle input.
4. Align proposal detail metadata.
5. Repair all six fixmes and obsolete fixtures.
6. Add API-to-web response contract tests.
7. Remove all Svelte stale-state warnings in core journeys.

### Wave 1: Responsive and accessible shell

1. Implement mobile navigation and narrow top-bar behavior.
2. Add responsive Tabs and table patterns.
3. Add navigation pending, form feedback, and page error contracts.
4. Add desktop/tablet/mobile Playwright projects, screenshots, overflow
   checks, keyboard tests, and automated accessibility checks.

### Wave 2: Information architecture

1. Make cooperative Overview the workspace root.
2. Connect People, Governance, Operations, Finance, Network, and Settings.
3. Classify every route as navigable, internal, or retired.
4. Convert navigation tabs to URL-backed views.
5. Preserve old aliases only until links/tests migrate, then remove them.

This wave requires user review of the proposed route map before it becomes the
default. A disabled parallel shell is acceptable while review is pending.

### Waves 3-5: Core journeys

- Wave 3: admission, Members, Invitations, and Onboarding;
- Wave 4: Proposals, Voting, Agreements, and Legal; and
- Wave 5: Finance, Operations, Commerce, and Network workflows.

Each wave ships responsive, empty, loading, error, permission-denied, and
keyboard states with its routes.

### Wave 6: Visual direction and tail migration

Prepare three cooperative-specific visual directions and two representative
screens per direction. User review selects the direction before the default
theme or component migration. Then migrate remaining pages and remove the
temporary old shell.

## Signoff Partitions

Engineering may proceed without further signoff on:

- confirmed P0/P1 defect repair;
- responsive and accessibility corrections;
- test integrity and contract validation;
- removal of build warnings;
- human-readable breadcrumbs; and
- a disabled parallel IA/theme implementation.

User signoff is required before:

- changing the default route hierarchy or primary navigation;
- selecting and activating a visual direction;
- enabling membership-request or open-admission behavior;
- changing public cooperative/member/governance visibility; or
- removing a live workflow rather than reconnecting it.

## Completion Gates

Phase 7 implementation is not complete until:

- every retained page has an inbound route or an explicit internal status;
- all six journeys can start from Home and proceed without a direct URL;
- no core journey test is disabled;
- 390 px, 768 px, and 1280 px journey screenshots have no clipping or
  incoherent overlap;
- keyboard-only operation covers shell, tabs, dialogs, forms, and destructive
  actions;
- action and navigation status is announced accessibly;
- production web build has no stale-state warnings;
- API/web response contracts prevent blank governance or financial fields;
  and
- user-approved IA and visual direction are recorded before activation.
