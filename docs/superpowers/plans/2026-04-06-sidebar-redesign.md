# Sidebar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the sidebar from a flat 19-item list into a three-section layout (Cooperative, Network, You) with role-based visibility and tabbed page consolidation.

**Architecture:** Replace the flat `mainNav`/`bottomNav` arrays in `Sidebar.svelte` with three `NavSection` groups. Pages that absorb sub-pages (Members, Governance, Admin, Settings) gain tabs using the existing `Tabs` component. A new Profile page replaces Dashboard. Existing URL routes are preserved — sub-routes map to parent sidebar items via a `routeParentMap`. User roles are fetched per-cooperative (not from `locals.user` which is scoped to first membership).

**Tech Stack:** SvelteKit 2, Svelte 5 runes, existing `Tabs` component, existing API client

**Spec:** `docs/superpowers/specs/2026-04-06-sidebar-redesign-design.md`

---

## Task Dependency Graph

```
Task 1 (WorkspaceContext + userRoles)
  └── Task 2 (Sidebar component redesign)
       └── Tasks 3-7 (independent, can run in parallel)
            ├── Task 3 (Members + Invitations + Onboarding tabs)
            ├── Task 4 (Governance + Agreements + Legal tabs)
            ├── Task 5 (Admin + Agents tab)
            ├── Task 6 (Settings + Notifications + Connections + Payments tabs)
            └── Task 7 (Profile page — NEW)
```

---

## Files Inventory

### Modified

| File | Task |
| ---- | ---- |
| `apps/web/src/lib/api/types.ts` | 1 |
| `apps/web/src/routes/(authed)/coop/[handle]/+layout.server.ts` | 1 |
| `apps/web/src/lib/components/layout/Sidebar.svelte` | 2 |
| `apps/web/src/routes/(authed)/coop/[handle]/members/+page.server.ts` | 3 |
| `apps/web/src/routes/(authed)/coop/[handle]/members/+page.svelte` | 3 |
| `apps/web/src/routes/(authed)/coop/[handle]/governance/+page.server.ts` | 4 |
| `apps/web/src/routes/(authed)/coop/[handle]/governance/+page.svelte` | 4 |
| `apps/web/src/routes/(authed)/coop/[handle]/admin/+page.server.ts` | 5 |
| `apps/web/src/routes/(authed)/coop/[handle]/admin/+page.svelte` | 5 |
| `apps/web/src/routes/(authed)/coop/[handle]/settings/+page.server.ts` | 6 |
| `apps/web/src/routes/(authed)/coop/[handle]/settings/+page.svelte` | 6 |

### Created

| File | Task |
| ---- | ---- |
| `apps/web/src/routes/(authed)/coop/[handle]/profile/+page.server.ts` | 7 |
| `apps/web/src/routes/(authed)/coop/[handle]/profile/+page.svelte` | 7 |

### NOT deleted (URL compatibility)

All existing standalone pages (`/invitations`, `/onboarding`, `/agreements`, `/legal`, `/agents`, `/notifications`, `/settings/connections`, `/settings/payments`, `/dashboard`) remain in place. There will be a mismatch between sidebar item grouping and URL paths — this is intentional, route migration is deferred.

---

### Task 1: WorkspaceContext + Layout Server — Add `userRoles`

**Files:**

- Modify: `apps/web/src/lib/api/types.ts`
- Modify: `apps/web/src/routes/(authed)/coop/[handle]/+layout.server.ts`

- [ ] **Step 1: Add `userRoles` to `WorkspaceContext`**

In `apps/web/src/lib/api/types.ts`, add `userRoles` to the interface:

```typescript
export interface WorkspaceContext {
  type: 'coop' | 'network';
  handle: string;
  prefix: string;
  cooperative: CoopEntity;
  userRoles?: string[];
}
```

- [ ] **Step 2: Populate `userRoles` in coop layout server**

In `apps/web/src/routes/(authed)/coop/[handle]/+layout.server.ts`, fetch the user's membership for this specific cooperative. The `locals.user.roles` is scoped to the user's first active membership (not necessarily this coop), so we need to call `getMember(did)` which is cooperative-scoped via the session:

```typescript
import { error } from '@sveltejs/kit';
import { createApiClient } from '$lib/api/client.js';
import type { LayoutServerLoad } from './$types.js';

export const load: LayoutServerLoad = async ({ params, fetch, request, locals }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  try {
    const cooperative = await api.getCooperativeByHandle(params.handle);

    // Fetch user's roles for THIS cooperative (not from locals.user which may be a different coop)
    let userRoles: string[] = [];
    if (locals.user) {
      try {
        const member = await api.getMember(locals.user.did);
        userRoles = member.roles;
      } catch {
        // User may not be a member of this cooperative
      }
    }

    return {
      workspace: {
        type: 'coop' as const,
        handle: params.handle,
        prefix: `/coop/${params.handle}`,
        cooperative,
        userRoles,
      },
    };
  } catch {
    error(404, 'Cooperative not found');
  }
};
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @coopsource/web dev`

Navigate to a cooperative page. In browser devtools, check `$page.data.workspace.userRoles` contains the expected roles for the current cooperative.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api/types.ts apps/web/src/routes/\(authed\)/coop/\[handle\]/+layout.server.ts
git commit -m "feat: add userRoles to WorkspaceContext for role-based sidebar visibility"
```

---

### Task 2: Sidebar Component — Three-Section Layout

**Files:**

- Modify: `apps/web/src/lib/components/layout/Sidebar.svelte`

- [ ] **Step 1: Add NavSection interface and new icon import**

Add to the script block:

```typescript
import CircleUser from '@lucide/svelte/icons/circle-user';

interface NavSection {
  label: string;
  items: NavItem[];
}
```

- [ ] **Step 2: Replace `mainNav`/`bottomNav` with three section computed values**

Remove the existing `mainNav` and `bottomNav` `$derived.by()` blocks. Replace with:

```typescript
const isAdmin = $derived(
  workspace?.userRoles?.some((r) => ['admin', 'owner', 'officer'].includes(r)) ?? false
);

const cooperativeNav: NavSection = $derived.by(() => {
  const prefix = workspace?.prefix ?? '';
  if (workspace?.type === 'network') {
    return {
      label: 'Network',
      items: [
        { href: `${prefix}/cooperatives`, label: 'Cooperatives', icon: Users },
        { href: `${prefix}/governance`, label: 'Governance', icon: Vote },
        { href: `${prefix}/agreements`, label: 'Agreements', icon: FileSignature },
      ],
    };
  }
  if (!prefix) return { label: 'Cooperative', items: [] };

  const items: NavItem[] = [
    { href: `${prefix}/members`, label: 'Members', icon: Users },
    { href: `${prefix}/governance`, label: 'Governance', icon: Vote },
    { href: `${prefix}/posts`, label: 'Posts', icon: MessageSquare },
  ];

  if (isAdmin) {
    items.push({ href: `${prefix}/finance`, label: 'Finance', icon: DollarSign });
    items.push({ href: `${prefix}/admin`, label: 'Admin', icon: Shield });
  }

  return { label: 'Cooperative', items };
});

const networkNav: NavSection = $derived.by(() => {
  const prefix = workspace?.prefix ?? '';
  if (!prefix || workspace?.type === 'network') return { label: 'Network', items: [] };

  return {
    label: 'Network',
    items: [
      { href: `${prefix}/networks`, label: 'Networks', icon: Globe },
      { href: `${prefix}/partners`, label: 'Partners', icon: Handshake },
      { href: `${prefix}/alignment`, label: 'Alignment', icon: Compass },
      { href: `${prefix}/campaigns`, label: 'Campaigns', icon: Banknote },
    ],
  };
});

const youNav: NavSection = $derived.by(() => {
  const prefix = workspace?.prefix ?? '';
  if (!prefix) return { label: 'You', items: [] };

  return {
    label: 'You',
    items: [
      { href: `${prefix}/profile`, label: 'Profile', icon: CircleUser },
      { href: `${prefix}/settings`, label: 'Settings', icon: Settings },
    ],
  };
});

const sections: NavSection[] = $derived(
  [cooperativeNav, networkNav, youNav].filter((s) => s.items.length > 0)
);
```

- [ ] **Step 3: Update `isActive()` with route-to-parent mapping**

Replace the existing `isActive` function:

```typescript
const routeParentMap: Record<string, string> = {
  '/invitations': '/members',
  '/onboarding': '/members',
  '/agreements': '/governance',
  '/legal': '/governance',
  '/agents': '/admin',
  '/notifications': '/settings',
  '/settings/connections': '/settings',
  '/settings/payments': '/settings',
};

function isActive(href: string): boolean {
  const pathname = $page.url.pathname;
  const prefix = workspace?.prefix ?? '';

  // Exact match or child route
  if (pathname === href || pathname.startsWith(href + '/')) return true;

  // Check route-to-parent mapping
  if (prefix) {
    for (const [subRoute, parentRoute] of Object.entries(routeParentMap)) {
      const fullSub = prefix + subRoute;
      const fullParent = prefix + parentRoute;
      if (href === fullParent && (pathname === fullSub || pathname.startsWith(fullSub + '/'))) {
        return true;
      }
    }
  }

  return false;
}
```

- [ ] **Step 4: Update the template markup**

Replace the existing `{#each mainNav ...}` nav loop and `{#each bottomNav ...}` loop with sections-based rendering:

```svelte
<nav class="flex flex-1 flex-col px-2 py-2 overflow-y-auto">
  {#each sections as section, si}
    {#if si > 0}
      <div class="my-2 border-t border-[var(--cs-sidebar-border)]"></div>
    {/if}
    {#if !collapsed}
      <span class="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--cs-sidebar-text)] opacity-50">
        {section.label}
      </span>
    {/if}
    {#each section.items as item}
      {@const active = isActive(item.href)}
      <!-- Keep existing nav item markup (the <a> with active indicator, icon, label) -->
    {/each}
  {/each}
</nav>
```

Move the theme toggle and user info to remain at the bottom (after the sections loop, in a `mt-auto` container). Remove the old `bottomNav` rendering entirely.

- [ ] **Step 5: Remove unused icon imports**

Remove imports no longer needed in the sidebar: `Mail`, `UserPlus`, `Scale`, `Bell`, `Activity`, `BookOpenIcon`, `CodeIcon`, `TagIcon`, `CreditCard`, `Link2`, `FileSignature` (unless still used by network type).

Keep `FileSignature` if used in the network workspace branch.

- [ ] **Step 6: Verify**

Run dev server. Check:

- Regular member sees: Cooperative (Members, Governance, Posts) + Network (Networks, Partners, Alignment, Campaigns) + You (Profile, Settings) = 9 items
- Admin sees: Cooperative gains Finance + Admin = 11 items
- Navigate to `/coop/handle/agreements/some-uri` → Governance is highlighted
- Navigate to `/coop/handle/agents` → Admin is highlighted
- Navigate to `/coop/handle/notifications` → Settings is highlighted
- Collapsed mode: section headers hidden, icons work

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/components/layout/Sidebar.svelte
git commit -m "feat: redesign sidebar with three sections and role-based visibility"
```

---

### Task 3: Members Page — Add Invitations + Onboarding Tabs

**Files:**

- Modify: `apps/web/src/routes/(authed)/coop/[handle]/members/+page.server.ts`
- Modify: `apps/web/src/routes/(authed)/coop/[handle]/members/+page.svelte`

- [ ] **Step 1: Merge data loading in page server**

Update `members/+page.server.ts` to load data for all three tabs. Add imports and merge the load functions from `invitations/+page.server.ts` and `onboarding/+page.server.ts`:

```typescript
export const load: PageServerLoad = async ({ fetch, request, url }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const cursor = url.searchParams.get('cursor') ?? undefined;
  const tab = url.searchParams.get('tab') ?? 'members';

  const [membersResult, invResult, obConfig, obProgress, allMembers] = await Promise.all([
    api.getMembers({ limit: 20, cursor }),
    api.getInvitations({ limit: 20 }).catch(() => ({ invitations: [], cursor: undefined })),
    api.getOnboardingConfig().catch(() => null),
    api.getOnboardingProgress({ limit: 20 }).catch(() => ({ items: [], cursor: null })),
    api.getMembers({ limit: 50 }).catch(() => ({ members: [], cursor: null })),
  ]);

  return {
    members: membersResult.members,
    cursor: membersResult.cursor,
    invitations: invResult.invitations,
    onboardingConfig: obConfig,
    onboardingProgress: obProgress.items,
    allMembers: allMembers.members,
    activeTab: tab,
  };
};
```

- [ ] **Step 2: Merge form actions**

Add the form actions from invitations and onboarding page servers to the existing `actions` object. Copy the action implementations from:

- `invitations/+page.server.ts`: `revoke`
- `onboarding/+page.server.ts`: `createConfig`, `updateConfig`, `startOnboarding`

Keep existing `invite` and `remove` actions unchanged.

- [ ] **Step 3: Add tabs to the page component**

In `members/+page.svelte`, add `Tabs` import and tab state:

```svelte
<script lang="ts">
  import { Tabs } from '$lib/components/ui';
  // ... existing imports

  let { data, form } = $props();
  let activeTab = $state(data.activeTab ?? 'members');

  const tabs = [
    { id: 'members', label: 'Members', count: data.members.length },
    { id: 'invitations', label: 'Invitations', count: data.invitations.length },
    { id: 'onboarding', label: 'Onboarding', count: data.onboardingProgress.length },
  ];
</script>
```

Add `<Tabs {tabs} bind:active={activeTab} />` below the page header. Wrap existing members content in `{#if activeTab === 'members'}`. Add `{#if activeTab === 'invitations'}` with content from `invitations/+page.svelte`. Add `{#if activeTab === 'onboarding'}` with content from `onboarding/+page.svelte`.

The header's action button should change per tab (Invite member for members, Start onboarding for onboarding).

If the component exceeds ~400 lines, extract tab content into sub-components: `MembersTab.svelte`, `InvitationsTab.svelte`, `OnboardingTab.svelte`.

- [ ] **Step 4: Verify**

- `/coop/handle/members` shows 3 tabs: Members, Invitations, Onboarding
- Each tab renders correct content with working forms
- Existing `/coop/handle/invitations` and `/coop/handle/onboarding` still work independently

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/\(authed\)/coop/\[handle\]/members/
git commit -m "feat: add Invitations and Onboarding tabs to Members page"
```

---

### Task 4: Governance Page — Add Agreements + Legal Tabs

**Files:**

- Modify: `apps/web/src/routes/(authed)/coop/[handle]/governance/+page.server.ts`
- Modify: `apps/web/src/routes/(authed)/coop/[handle]/governance/+page.svelte`

- [ ] **Step 1: Add agreements and legal data loading**

Extend the existing `Promise.all` in `governance/+page.server.ts`:

```typescript
const [result, delegations, actionItems, outcomes, members, agreementsResult, legalResult] = await Promise.all([
  // ... existing 5 calls ...
  api.getAgreements({ limit: 20 }).catch(() => ({ agreements: [], cursor: null })),
  api.getLegalDocuments({ limit: 20 }).catch(() => ({ documents: [], cursor: null })),
]);
```

Add to return: `agreements: agreementsResult.agreements`, `legalDocuments: legalResult.documents`.

- [ ] **Step 2: Add legal form action**

Add the `createLegalDocument` action from `legal/+page.server.ts` to the governance page's `actions` object.

- [ ] **Step 3: Add Agreements and Legal tabs**

Extend the tabs array in `governance/+page.svelte`:

```typescript
const tabs = [
  { id: 'proposals', label: 'Proposals', count: data.proposals.length },
  { id: 'delegations', label: 'Delegations', count: data.delegations.length },
  { id: 'feed', label: 'Feed', count: data.actionItems.length },
  { id: 'agreements', label: 'Agreements', count: data.agreements.length },
  { id: 'legal', label: 'Legal', count: data.legalDocuments.length },
];
```

Add `{#if activeTab === 'agreements'}` and `{#if activeTab === 'legal'}` blocks with content from those pages' `.svelte` files. Agreements links to `/agreements/new`, `/agreements/[uri]`, and `/agreements/templates` — keep these as-is. Legal needs the create document modal added.

- [ ] **Step 4: Verify**

- Governance shows 5 tabs: Proposals, Delegations, Feed, Agreements, Legal
- Agreement status filters and table render correctly
- Create legal document modal works
- Links within tabs navigate to existing sub-routes

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/\(authed\)/coop/\[handle\]/governance/
git commit -m "feat: add Agreements and Legal tabs to Governance page"
```

---

### Task 5: Admin Page — Add Agents Tab

**Files:**

- Modify: `apps/web/src/routes/(authed)/coop/[handle]/admin/+page.server.ts`
- Modify: `apps/web/src/routes/(authed)/coop/[handle]/admin/+page.svelte`

- [ ] **Step 1: Add agents data loading**

Add to the existing `Promise.all` in `admin/+page.server.ts`:

```typescript
api.getAgents().catch(() => ({ agents: [] })),
```

Add to return: `agents: agentsResult.agents`.

- [ ] **Step 2: Add Agents tab to component**

Add to tabs array in `admin/+page.svelte`:

```typescript
{ id: 'agents', label: 'Agents', count: data.agents.length },
```

Add `{#if activeTab === 'agents'}` block with the agent card grid from `agents/+page.svelte`:

```svelte
{#if activeTab === 'agents'}
  {#if data.agents.length === 0}
    <EmptyState title="No agents configured" description="Configure AI agents for your cooperative." />
  {:else}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each data.agents as agent}
        <a href="{$workspacePrefix}/agents/{agent.id}" class="cs-card p-5 hover:border-[var(--cs-primary)] cs-transition block">
          <div class="flex items-start gap-3">
            <div class="p-2 rounded-lg bg-[var(--cs-bg-inset)]">
              <Bot size={20} class="text-[var(--cs-primary)]" />
            </div>
            <div class="min-w-0 flex-1">
              <h3 class="font-medium text-[var(--cs-text)] truncate">{agent.name}</h3>
              <p class="text-xs text-[var(--cs-text-muted)] mt-0.5 capitalize">{agent.agentType}</p>
            </div>
          </div>
        </a>
      {/each}
    </div>
  {/if}
{/if}
```

Import `Bot` from `@lucide/svelte/icons/bot`.

Add Configure button to the tab-conditional header for the agents tab:

```svelte
{:else if activeTab === 'agents'}
  <a href="{$workspacePrefix}/settings/agents" class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]">Configure</a>
```

- [ ] **Step 3: Verify**

- Admin page shows 5 tabs: Officers, Compliance, Notices, Fiscal Periods, Agents
- Agent cards display and link to `/agents/[id]`
- Configure button links to `/settings/agents`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/\(authed\)/coop/\[handle\]/admin/
git commit -m "feat: add Agents tab to Admin page"
```

---

### Task 6: Settings Page — Add Notifications + Connections + Payments Tabs

**Files:**

- Modify: `apps/web/src/routes/(authed)/coop/[handle]/settings/+page.server.ts`
- Modify: `apps/web/src/routes/(authed)/coop/[handle]/settings/+page.svelte`

- [ ] **Step 1: Merge data loading**

Replace the settings page server load with merged data from all four sources:

```typescript
export const load: PageServerLoad = async ({ fetch, request, url }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  const [cooperative, notificationsResult, connectionsResult, servicesResult, paymentConfigs, supportedProviders] = await Promise.all([
    api.getCooperative(),
    api.getNotifications({ limit: 25 }).catch(() => ({ notifications: [], cursor: undefined })),
    api.getConnections().catch(() => ({ connections: [] })),
    api.getAvailableServices().catch(() => ({ services: [] })),
    api.getPaymentConfigs().catch(() => ({ providers: [] })),
    api.getSupportedProviders().catch(() => ({ providers: [] })),
  ]);

  return {
    cooperative,
    notifications: notificationsResult.notifications,
    notificationsCursor: notificationsResult.cursor,
    connections: connectionsResult.connections,
    availableServices: servicesResult.services,
    paymentConfigs: paymentConfigs.providers,
    supportedProviders: supportedProviders.providers,
  };
};
```

- [ ] **Step 2: Merge form actions**

Add actions from connections and payments page servers. Namespace payments actions to avoid collisions:

```typescript
export const actions: Actions = {
  // Existing
  update: async ({ ... }) => { /* existing */ },
  updateVisibility: async ({ ... }) => { /* existing */ },

  // From connections/+page.server.ts
  connect: async ({ request, fetch }) => { /* copy */ },
  disconnect: async ({ request, fetch }) => { /* copy */ },

  // From payments/+page.server.ts (namespaced)
  addPaymentProvider: async ({ request, fetch }) => { /* copy from payments add */ },
  togglePaymentProvider: async ({ request, fetch }) => { /* copy from payments toggle */ },
  removePaymentProvider: async ({ request, fetch }) => { /* copy from payments remove */ },
};
```

- [ ] **Step 3: Add tabs to the page component**

Add `Tabs` component and tab state:

```typescript
const tabs = [
  { id: 'settings', label: 'Settings' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'connections', label: 'Connections' },
  { id: 'payments', label: 'Payments' },
];
```

Wrap existing settings form in `{#if activeTab === 'settings'}`. Add notification, connection, and payment tab blocks with content from their respective pages.

**Note:** The Notifications tab uses client-side API calls (`markRead`, `markAllRead`, `loadMore`) — include the `createApiClient` + `env` imports and the client-side functions from `notifications/+page.svelte`.

**Note:** Payments form actions reference the namespaced action names: `?/addPaymentProvider`, `?/togglePaymentProvider`, `?/removePaymentProvider`.

- [ ] **Step 4: Verify**

- Settings page shows 4 tabs
- Coop settings form + visibility toggles work
- Notifications mark-read works
- Connect/disconnect external services works
- Add/toggle/remove payment providers works

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/\(authed\)/coop/\[handle\]/settings/
git commit -m "feat: add Notifications, Connections, and Payments tabs to Settings page"
```

---

### Task 7: Profile Page — New Page

**Files:**

- Create: `apps/web/src/routes/(authed)/coop/[handle]/profile/+page.server.ts`
- Create: `apps/web/src/routes/(authed)/coop/[handle]/profile/+page.svelte`

- [ ] **Step 1: Create page server**

```typescript
import type { PageServerLoad } from './$types.js';
import { createApiClient } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  const [membershipsResult, invitationsResult] = await Promise.allSettled([
    api.getMyMemberships(),
    api.getInvitations({ limit: 20 }),
  ]);

  return {
    cooperatives: membershipsResult.status === 'fulfilled' ? membershipsResult.value.cooperatives : [],
    networks: membershipsResult.status === 'fulfilled' ? membershipsResult.value.networks : [],
    invitations: invitationsResult.status === 'fulfilled' ? invitationsResult.value.invitations : [],
  };
};
```

- [ ] **Step 2: Create page component**

```svelte
<script lang="ts">
  import { Badge, EmptyState, Tabs } from '$lib/components/ui';
  import Building2 from '@lucide/svelte/icons/building-2';
  import Globe from '@lucide/svelte/icons/globe';

  let { data } = $props();
  let activeTab = $state('activity');

  const tabs = [
    { id: 'activity', label: 'My Activity' },
    { id: 'profiles', label: 'My Profiles' },
    { id: 'cooperatives', label: 'My Cooperatives', count: data.cooperatives.length },
  ];
</script>

<svelte:head>
  <title>Profile — Co-op Source</title>
</svelte:head>

<div class="space-y-4">
  <h1 class="text-xl font-semibold text-[var(--cs-text)]">Profile</h1>
  <Tabs {tabs} bind:active={activeTab} />

  {#if activeTab === 'activity'}
    <!-- Content relocated from dashboard/+page.svelte -->
    <!-- My Cooperatives cards grid -->
    {#if data.cooperatives.length > 0}
      <section>
        <h2 class="text-lg font-semibold text-[var(--cs-text)] mb-3">My Cooperatives</h2>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {#each data.cooperatives as coop}
            <a href="/coop/{coop.handle}" class="cs-card p-5 hover:border-[var(--cs-primary)] cs-transition block">
              <div class="flex items-start gap-3">
                <Building2 size={20} class="text-[var(--cs-primary)] mt-0.5" />
                <div>
                  <h3 class="font-medium text-[var(--cs-text)]">{coop.displayName}</h3>
                  {#if coop.description}
                    <p class="text-xs text-[var(--cs-text-muted)] mt-1 line-clamp-2">{coop.description}</p>
                  {/if}
                </div>
              </div>
            </a>
          {/each}
        </div>
      </section>
    {/if}

    <!-- My Networks cards grid -->
    {#if data.networks.length > 0}
      <section>
        <h2 class="text-lg font-semibold text-[var(--cs-text)] mb-3">My Networks</h2>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {#each data.networks as network}
            <a href="/coop/{network.handle}" class="cs-card p-5 hover:border-[var(--cs-primary)] cs-transition block">
              <div class="flex items-start gap-3">
                <Globe size={20} class="text-violet-500 mt-0.5" />
                <div>
                  <h3 class="font-medium text-[var(--cs-text)]">{network.displayName}</h3>
                </div>
              </div>
            </a>
          {/each}
        </div>
      </section>
    {/if}

    {#if data.cooperatives.length === 0 && data.networks.length === 0}
      <EmptyState title="No activity yet" description="Join a cooperative or network to get started." />
    {/if}
  {/if}

  {#if activeTab === 'profiles'}
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-5">
      <dl class="space-y-4">
        <div>
          <dt class="text-xs font-medium uppercase tracking-wide text-[var(--cs-text-muted)]">Display Name</dt>
          <dd class="mt-1 text-sm text-[var(--cs-text)]">{data.user?.displayName ?? '—'}</dd>
        </div>
        <div>
          <dt class="text-xs font-medium uppercase tracking-wide text-[var(--cs-text-muted)]">Handle</dt>
          <dd class="mt-1 text-sm text-[var(--cs-text)]">{data.user?.handle ? `@${data.user.handle}` : '—'}</dd>
        </div>
        <div>
          <dt class="text-xs font-medium uppercase tracking-wide text-[var(--cs-text-muted)]">Email</dt>
          <dd class="mt-1 text-sm text-[var(--cs-text)]">{data.user?.email ?? '—'}</dd>
        </div>
      </dl>
    </div>
  {/if}

  {#if activeTab === 'cooperatives'}
    {#if data.cooperatives.length === 0}
      <EmptyState title="No cooperatives" description="You haven't joined any cooperatives yet." />
    {:else}
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {#each data.cooperatives as coop}
          <a href="/coop/{coop.handle}" class="cs-card p-5 hover:border-[var(--cs-primary)] cs-transition block">
            <div class="flex items-start gap-3">
              <Building2 size={20} class="text-[var(--cs-primary)] mt-0.5" />
              <div>
                <h3 class="font-medium text-[var(--cs-text)]">{coop.displayName}</h3>
                {#if coop.description}
                  <p class="text-xs text-[var(--cs-text-muted)] mt-1 line-clamp-2">{coop.description}</p>
                {/if}
              </div>
            </div>
          </a>
        {/each}
      </div>
    {/if}
  {/if}
</div>
```

- [ ] **Step 3: Verify**

- Navigate to `/coop/handle/profile` — page loads
- My Activity tab shows cooperative and network cards
- My Profiles tab shows user info
- My Cooperatives tab shows cooperative list
- Sidebar highlights "Profile"

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/\(authed\)/coop/\[handle\]/profile/
git commit -m "feat: add Profile page with My Activity, My Profiles, My Cooperatives tabs"
```

---

## Final Verification

After all tasks are complete:

- [ ] Run `pnpm --filter @coopsource/web build` — no build errors
- [ ] Run `pnpm test` — all existing tests pass
- [ ] Manual walkthrough: regular member sees 9 sidebar items across 3 sections
- [ ] Manual walkthrough: admin sees 11 sidebar items
- [ ] Navigate through all tabbed pages, verify forms work
- [ ] Navigate to old standalone URLs (`/invitations`, `/agreements`, etc.) — still work
- [ ] Collapsed sidebar: section headers hidden, icons display correctly

## Risk Mitigations

1. **Form action name collisions**: Payments actions are namespaced (`addPaymentProvider`, etc.) to avoid conflicts with existing `update`/`add` actions
2. **Component size**: If merged pages exceed ~400 lines, extract tab content into sub-components
3. **Data loading performance**: All non-essential data uses `.catch(() => defaults)` so failures don't block pages
4. **`locals.user.roles` is NOT cooperative-scoped**: Task 1 uses `api.getMember(did)` to get roles for the specific cooperative being viewed
5. **Existing routes preserved**: Standalone pages are NOT deleted — data loading is duplicated, acceptable for backward compatibility
