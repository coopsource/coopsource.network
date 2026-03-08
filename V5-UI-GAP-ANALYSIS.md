# V5 UI Gap Analysis

**Date**: 2026-03-08
**Scope**: All V5 roadmap features (Phases 0-7) — backend API vs frontend UI coverage
**Branch**: `main` (tag: `V5-Plan-Completed`)

---

## Executive Summary

The V5 backend is **fully implemented** with ~180 API endpoints across 44 route files, 22+ services, 37 database migrations, and 653 passing tests. The SvelteKit frontend covers **13 of 20 feature areas** with 95 API client methods and ~50 interactive pages. **7 feature areas** introduced in V5 Phases 2-7 have complete backend APIs but **zero frontend UI**.

| Metric | Count |
|--------|-------|
| Total API endpoints | ~180 |
| Frontend API client methods | 95 |
| Feature areas with full UI | 13 |
| Feature areas with NO UI | 7 |
| Estimated missing pages | 25-35 |

---

## Features WITH Frontend UI (Complete)

| Feature | Phase | Pages | Key Capabilities |
|---------|-------|-------|-----------------|
| **Auth & Setup** | Pre-V5 | 7 | Login, register, OAuth, invitation acceptance, cooperative setup |
| **Cooperative Workspace** | Pre-V5 | 6 | Member list, role management, invitations, profile settings |
| **Governance (Proposals/Voting)** | Pre-V5 | 3 | Create/edit proposals, vote, view tallies, resolve outcomes |
| **Agreements** | Pre-V5 | 6 | Full lifecycle (draft→open→active→terminated), signatures, stakeholder terms, templates |
| **Discussions (Posts)** | Pre-V5 | 3 | Threaded discussions, create/edit/delete posts |
| **Funding Campaigns** | Stage 3 | 3 | Campaign creation, Stripe checkout, pledge tracking, progress bars |
| **Payment Config** | Stage 3 | 1 | Add/configure payment providers (Stripe) |
| **Networks** | Pre-V5 | 8 | Create/join networks, network-level governance and agreements |
| **Alignment** | Stage 3 | 6 | Stakeholder interests, desired outcomes, interest map visualization |
| **AI Agents** | Stage 3 | 4 | Agent config, chat sessions, trigger automation, model provider setup |
| **Connections** | Stage 3 | 1 | External service OAuth (GitHub, etc.), resource bindings |
| **Notifications** | Stage 3 | 1 | Notification center, SSE real-time updates, unread counts |
| **Public Discovery** | Stage 2 | 3 | Explore cooperatives, public profiles, network directory |

---

## Features WITHOUT Frontend UI (Gap)

### 1. Legal Documents & Meeting Records (Phase 4)

**Backend**: 4 endpoints for legal documents, 3 for meetings
**Frontend**: None
**Priority**: High — core cooperative compliance requirement

| Endpoint | Purpose |
|----------|---------|
| `GET/POST /legal/documents` | List/create foundational documents (bylaws, articles of incorporation) |
| `GET/PUT /legal/documents/:id` | View/update with versioning |
| `GET/POST /legal/meetings` | List/create meeting records (board, member, committee) |
| `POST /legal/meetings/:id/certify` | Certify meeting minutes |

**Suggested UI**: 2 pages under `/coop/[handle]/legal/` — document library + meeting records

---

### 2. Officers & Compliance (Phase 4)

**Backend**: 3 officer endpoints, 3 compliance endpoints, 2 notice endpoints, 3 fiscal period endpoints
**Frontend**: None
**Priority**: High — governance accountability

| Endpoint Group | Purpose |
|---------------|---------|
| `/admin/officers` | Appoint officers, track terms, end terms |
| `/admin/compliance` | Track compliance items (annual filings, audits), mark complete |
| `/admin/notices` | Send formal member notices |
| `/admin/fiscal-periods` | Create/close fiscal periods |

**Suggested UI**: 3-4 pages under `/coop/[handle]/admin/` — officers, compliance calendar, notices, fiscal periods

---

### 3. Onboarding Workflows (Phase 7, Task 1)

**Backend**: 13 endpoints covering full onboarding lifecycle
**Frontend**: None
**Priority**: High — member experience

| Endpoint Group | Purpose |
|---------------|---------|
| `/onboarding/config` | Configure probation period, training, buy-in, milestones |
| `/onboarding/start` | Start member's onboarding journey |
| `/onboarding/progress` | Track progress (training, buy-in, milestones) |
| `/onboarding/buddy/assign` | Assign buddy mentors |
| `/onboarding/review` | Periodic/milestone/final reviews |
| `/onboarding/complete` | Complete onboarding |

**Suggested UI**: 3 pages — config page (admin), progress dashboard (member), review form (reviewer)

---

### 4. Delegation Voting & Governance Feed (Phase 7, Tasks 2-3)

**Backend**: 5 delegation endpoints, 3 governance feed endpoints
**Frontend**: None
**Priority**: Medium — enhances governance participation

| Endpoint Group | Purpose |
|---------------|---------|
| `/governance/delegations` | Create/revoke vote delegations, view chains |
| `/governance/vote-weight/:memberDid` | Calculate delegation-augmented vote weight |
| `/governance/feed/action-items` | Proposals needing your vote |
| `/governance/feed/outcomes` | Recent resolved proposals |
| `/governance/feed/meetings` | Upcoming meetings |

**Suggested UI**: Delegation panel on governance page + feed widget on dashboard

---

### 5. Member Classes & Weighted Voting (Phase 7, Task 4)

**Backend**: 7 endpoints for class CRUD + member assignment
**Frontend**: None
**Priority**: Medium — multi-stakeholder cooperatives need this

| Endpoint Group | Purpose |
|---------------|---------|
| `/member-classes` | Create/update/delete member classes (worker, investor, etc.) |
| `/member-classes/assign` | Assign/remove members from classes |
| Vote weight in proposals | Automatic — votes carry class weight (already in vote API response as `voteWeight`) |
| Weighted tally | Automatic — `GET /proposals/:id/votes` returns `weightedTally` |

**Suggested UI**: Settings page for class management + class badge on member list + weighted tally display on vote results

---

### 6. Cooperative Links (Phase 7, Task 5)

**Backend**: 6 endpoints for inter-cooperative connections
**Frontend**: None
**Priority**: Medium — federation/partnership discovery

| Endpoint Group | Purpose |
|---------------|---------|
| `/cooperative-links` | Create/list/filter links between cooperatives |
| `/cooperative-links/:id/respond` | Accept/decline link requests |
| `/cooperative-links/partners` | List linked cooperatives with display names |

**Suggested UI**: 1-2 pages under `/coop/[handle]/partners/` — partner list + incoming requests

---

### 7. Financial Tools (Phase 6)

**Backend**: 18 endpoints across patronage, capital accounts, and tax forms
**Frontend**: None
**Priority**: Medium-High — critical for worker cooperatives distributing surplus

| Endpoint Group | Purpose |
|---------------|---------|
| `/financial/patronage/config` | Configure patronage allocation rules |
| `/financial/patronage/calculate` | Run patronage calculations for fiscal period |
| `/financial/patronage/records` | View/approve patronage records |
| `/financial/capital-accounts` | Member equity accounts (contribute, allocate, redeem) |
| `/financial/capital-accounts/summary` | Cooperative-wide financial summary |
| `/financial/tax-forms/1099-patr` | Generate/track 1099-PATR tax forms |

**Suggested UI**: 4-5 pages under `/coop/[handle]/finance/` — patronage config, calculation results, capital accounts dashboard, member account view, tax forms

---

## Additional Backend-Only Features (Infrastructure)

These have backend support but are **intentionally infrastructure-only** (no direct UI needed):

| Feature | Phase | Purpose | UI Needed? |
|---------|-------|---------|------------|
| **Governance Labels** | Phase 3 | Ozone labeler for ATProto ecosystem | No — consumed by external tools |
| **Private Records** | Phase 5 | Tier 2 data storage (closed cooperatives) | Maybe — admin visibility tool |
| **Tap/Relay Consumer** | Phase 2 | Firehose consumption from ATProto relay | No — background service |
| **Commit Verifier** | Phase 2 | Cryptographic record verification | No — background validation |
| **Visibility Router** | Phase 5 | Routes writes to public/private storage | No — transparent to users |
| **Starter Pack Service** | Phase 3 | ATProto Starter Pack generation | Maybe — admin tool |

---

## Gap Summary by Priority

### High Priority (Core cooperative operations)
1. **Legal Documents & Meetings** — ~2 pages, cooperatives need bylaws/minutes management
2. **Officers & Compliance** — ~4 pages, governance accountability and regulatory tracking
3. **Onboarding Workflows** — ~3 pages, critical for new member experience

### Medium-High Priority (Financial operations)
4. **Financial Tools** — ~5 pages, patronage distribution is a defining cooperative feature

### Medium Priority (Enhanced governance)
5. **Delegation Voting & Feed** — ~2 components, improves governance participation
6. **Member Classes & Weighted Voting** — ~2 pages, needed for multi-stakeholder coops
7. **Cooperative Links** — ~2 pages, enables inter-cooperative discovery

---

## Estimated Effort

| Priority | Pages/Components | Estimated New API Client Methods |
|----------|-----------------|--------------------------------|
| High | 9 pages | 20 methods |
| Medium-High | 5 pages | 15 methods |
| Medium | 6 pages + 2 components | 15 methods |
| **Total** | **~22 pages, 2 components** | **~50 methods** |

The frontend API client (`apps/web/src/lib/api/client.ts`) currently has 95 methods. Adding the missing 50 would bring it to ~145, covering the full backend API surface.

---

## Appendix: Current Test Coverage

| Package | Tests | Status |
|---------|-------|--------|
| `@coopsource/common` | 101 | All pass |
| `@coopsource/federation` | 55 | All pass |
| `@coopsource/api` | 497 | All pass |
| **Total** | **653** | **All pass** |
| E2E (Playwright) | 16 spec files | Not verified in this analysis |
