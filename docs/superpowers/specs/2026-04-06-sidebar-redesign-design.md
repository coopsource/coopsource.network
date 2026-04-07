# Sidebar Redesign — Three-Section Navigation

**Date:** 2026-04-06
**Status:** Approved

## Problem

The cooperative workspace sidebar has 19+ items in a flat list, making it hard to scan and overwhelming for regular members who don't need admin-level items. User-scoped concerns (Dashboard, Notifications) are mixed with cooperative-scoped concerns. There's no profile management surface. No role-based visibility exists.

## Design

### Three-Section Sidebar

The sidebar is reorganized into three semantic sections separated by headers and dividers:

**1. Cooperative** (internal to this co-op)

| Item | Tabs on page | Visible to |
|------|-------------|------------|
| Members | Members, Invitations, Onboarding | all |
| Governance | Proposals, Agreements, Legal | all |
| Posts | — | all |
| Finance | Overview, Patronage, Capital Accounts, Tax Forms | admin/officer |
| Admin | Agents, Pipeline, Lexicons, Scripts, Labels | admin/officer |

**2. Network** (ecosystem, inter-coop, discovery)

| Item | Visible to |
|------|------------|
| Networks | all |
| Partners | all |
| Alignment | all |
| Campaigns | all |

**3. You** (user-scoped, not cooperative-scoped)

| Item | Tabs on page | Visible to |
|------|-------------|------------|
| Profile | My Activity, My Profiles, My Cooperatives | all |
| Settings | Notifications, Connections, Payments, + existing settings content | all |

**Item counts:** Members see 9 items across 3 sections. Admins see 11.

### What Moves Where

| Current sidebar item | New location |
|---------------------|-------------|
| Dashboard | Removed — becomes "My Activity" tab under Profile |
| Notifications | Tab under Settings |
| Members | Stays (absorbs Invitations + Onboarding as tabs) |
| Invitations | Tab under Members |
| Onboarding | Tab under Members |
| Governance | Stays (absorbs Agreements + Legal as tabs) |
| Agreements | Tab under Governance |
| Legal | Tab under Governance |
| Alignment | Promoted to Network section |
| Campaigns | Promoted to Network section |
| Finance | Stays (admin-only) |
| Posts | Stays |
| Networks | Promoted to Network section |
| Partners | Promoted to Network section |
| Agents | Tab under Admin |
| Admin | Stays (admin-only, absorbs Agents) |
| Payments | Tab under Settings |
| Connections | Tab under Settings |
| Settings | Moves to "You" section |
| Profile (NEW) | New page in "You" section |

### Implementation Approach: Tab-First

Each merged page (Members, Governance, Profile, Settings) gets a top-level layout with the existing `Tabs` component (`apps/web/src/lib/components/ui/Tabs.svelte`). Tabs switch content by rendering the appropriate existing page component inline. This matches the pattern already used by Finance and Admin pages.

### URL Routing

**Existing routes are preserved.** Sub-routes like `/coop/[handle]/agreements/[uri]` stay at their current URLs. The sidebar highlights the correct parent item (e.g., clicking Governance highlights "Governance" even when viewing an agreement detail page at `/agreements/[uri]`).

**Known trade-off:** There will be a mismatch between sidebar item grouping (Agreements under Governance) and URL paths (`/agreements/...` not `/governance/agreements/...`). This is intentional — route migration is deferred to avoid breaking bookmarks and to reduce scope.

**New routes needed:**
- `/coop/[handle]/profile` — Profile page (My Activity, My Profiles, My Cooperatives)
- No route changes for existing pages

### Role-Based Visibility

Finance and Admin items are only shown when the user has an admin or officer role in the current cooperative. The role data is already available from `memberApproval` records.

**Implementation:** The cooperative layout server (`apps/web/src/routes/(authed)/coop/[handle]/+layout.server.ts`) needs to load the current user's membership roles for the cooperative. The sidebar component checks roles to conditionally render admin-only items.

### Sidebar Component Changes

**`apps/web/src/lib/components/layout/Sidebar.svelte`:**

- Add a `NavSection` concept with a `header` string and `items` array
- Replace the flat `mainNav` array with three sections: `cooperativeNav`, `networkNav`, `youNav`
- Section headers rendered as small uppercase labels (matching the mockup)
- Dividers between sections
- `isActive()` updated with a route-to-parent mapping so sub-routes highlight the correct parent:
  - `/invitations`, `/onboarding` → highlights Members
  - `/agreements`, `/legal` → highlights Governance
  - `/agents` → highlights Admin
  - `/notifications`, `/connections`, `/payments` → highlights Settings
- Role check: `workspace.userRoles?.includes('admin')` or similar to gate Finance/Admin

**Props change:** `workspace` context needs to include `userRoles: string[]` so the sidebar can check visibility.

### Pages That Gain Tabs

**Members page** (`apps/web/src/routes/(authed)/coop/[handle]/members/+page.svelte`):
- Add `Tabs` component with: Members, Invitations, Onboarding
- Default tab: Members (existing content)
- Invitations tab: renders existing invitations page content
- Onboarding tab: renders existing onboarding page content

**Governance page** (`apps/web/src/routes/(authed)/coop/[handle]/governance/+page.svelte`):
- Already has tabs. Add: Agreements, Legal
- Agreements tab: renders existing agreements page content
- Legal tab: renders existing legal page content

**Admin page** (`apps/web/src/routes/(authed)/coop/[handle]/admin/+page.svelte`):
- Already has tabs. Add: Agents
- Agents tab: renders existing agents page content

**Settings page** (`apps/web/src/routes/(authed)/coop/[handle]/settings/+page.svelte`):
- Add `Tabs` component with: Settings (existing content), Notifications, Connections, Payments
- Each tab renders existing page content

**Profile page** (NEW — `apps/web/src/routes/(authed)/coop/[handle]/profile/+page.svelte`):
- New page with tabs: My Activity, My Profiles, My Cooperatives
- My Activity: relocated Dashboard content
- My Profiles: profile management (display name, avatar, bio)
- My Cooperatives: list of co-ops the user belongs to

### Data Loading

Each tab loads its own data. When a tab is selected, it fetches data for that tab only (not all tabs at once). This follows the existing Finance page pattern where each tab makes its own API calls.

The page server loads data for the default tab. Switching tabs triggers client-side fetches to the relevant API endpoints.

### Network Type Workspace

The network workspace sidebar (used when `workspace.type === 'network'`) currently has 4 items: Dashboard, Cooperatives, Governance, Agreements. This sidebar should follow the same three-section pattern but is **out of scope for this implementation** — it can be updated in a follow-up.

### Existing Reusable Components

- `Tabs` component: `apps/web/src/lib/components/ui/Tabs.svelte` — supports `id`, `label`, `count` per tab
- `Avatar` component: `apps/web/src/lib/components/ui/Avatar.svelte`
- `ThemeToggle`: already in sidebar footer
- Finance page tab pattern: `apps/web/src/routes/(authed)/coop/[handle]/finance/+page.svelte` — reference implementation
- Admin page tab pattern: `apps/web/src/routes/(authed)/coop/[handle]/admin/+page.svelte`

### Key Files to Modify

- `apps/web/src/lib/components/layout/Sidebar.svelte` — three-section nav, role-based visibility
- `apps/web/src/lib/api/types.ts` — add `userRoles` to `WorkspaceContext`
- `apps/web/src/routes/(authed)/coop/[handle]/+layout.server.ts` — load user's membership roles
- `apps/web/src/routes/(authed)/coop/[handle]/members/+page.svelte` — add tabs
- `apps/web/src/routes/(authed)/coop/[handle]/members/+page.server.ts` — load invitations + onboarding data
- `apps/web/src/routes/(authed)/coop/[handle]/governance/+page.svelte` — add Agreements + Legal tabs
- `apps/web/src/routes/(authed)/coop/[handle]/governance/+page.server.ts` — load agreements + legal data
- `apps/web/src/routes/(authed)/coop/[handle]/admin/+page.svelte` — add Agents tab
- `apps/web/src/routes/(authed)/coop/[handle]/admin/+page.server.ts` — load agents data
- `apps/web/src/routes/(authed)/coop/[handle]/settings/+page.svelte` — add tabs
- `apps/web/src/routes/(authed)/coop/[handle]/settings/+page.server.ts` — load notifications + connections + payments data
- NEW: `apps/web/src/routes/(authed)/coop/[handle]/profile/+page.svelte` — new Profile page
- NEW: `apps/web/src/routes/(authed)/coop/[handle]/profile/+page.server.ts` — load user profile data

### Verification

1. Start dev servers: `make dev`
2. Log in as a regular member — verify sidebar shows 9 items across 3 sections (Cooperative: 3, Network: 4, You: 2)
3. Log in as an admin — verify sidebar shows 11 items (Cooperative gains Finance + Admin)
4. Click Members → verify tabs (Members, Invitations, Onboarding) and each tab loads correct content
5. Click Governance → verify tabs include Agreements and Legal
6. Click Admin → verify Agents tab present
7. Click Settings → verify tabs include Notifications, Connections, Payments
8. Click Profile → verify My Activity, My Profiles, My Cooperatives tabs
9. Navigate to a sub-route (e.g., `/agreements/new`) → verify Governance is highlighted in sidebar
10. Verify existing direct URLs still work (e.g., `/coop/[handle]/invitations` still loads)
11. Run `pnpm test` — all existing tests pass
