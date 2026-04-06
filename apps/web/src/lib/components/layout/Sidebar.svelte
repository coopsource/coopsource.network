<script lang="ts">
  import { page } from '$app/stores';
  import type { Component } from 'svelte';
  import Users from '@lucide/svelte/icons/users';
  import Vote from '@lucide/svelte/icons/vote';
  import FileSignature from '@lucide/svelte/icons/file-signature';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import Compass from '@lucide/svelte/icons/compass';
  import Banknote from '@lucide/svelte/icons/banknote';
  import Globe from '@lucide/svelte/icons/globe';
  import Shield from '@lucide/svelte/icons/shield';
  import DollarSign from '@lucide/svelte/icons/dollar-sign';
  import Handshake from '@lucide/svelte/icons/handshake';
  import Settings from '@lucide/svelte/icons/settings';
  import CircleUser from '@lucide/svelte/icons/circle-user';
  import PanelLeftClose from '@lucide/svelte/icons/panel-left-close';
  import PanelLeftOpen from '@lucide/svelte/icons/panel-left-open';
  import ThemeToggle from '$lib/components/ui/ThemeToggle.svelte';
  import Avatar from '$lib/components/ui/Avatar.svelte';
  import type { AuthUser, WorkspaceContext } from '$lib/api/types.js';

  interface Props {
    user?: AuthUser | null;
    coopName?: string;
    collapsed?: boolean;
    workspace?: WorkspaceContext | null;
  }

  let {
    user = null,
    coopName = 'Co-op Source',
    collapsed = $bindable(false),
    workspace = null,
  }: Props = $props();

  interface NavItem {
    href: string;
    label: string;
    icon: Component;
  }

  interface NavSection {
    label: string;
    items: NavItem[];
  }

  const isAdmin = $derived(
    workspace?.userRoles?.some((r) => ['admin', 'owner', 'officer'].includes(r)) ?? false
  );

  const cooperativeNav: NavSection = $derived.by(() => {
    const prefix = workspace?.prefix ?? '';
    // For network workspace type, return its own items (keep existing behavior)
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

    if (pathname === href || pathname.startsWith(href + '/')) return true;

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
</script>

<aside
  class="flex h-full flex-col bg-[var(--cs-sidebar-bg)] cs-transition overflow-hidden"
  class:w-56={!collapsed}
  class:w-14={collapsed}
>
  <!-- Header -->
  <div class="flex items-center h-12 px-3 border-b border-[var(--cs-sidebar-border)]"
    class:justify-center={collapsed}
  >
    {#if !collapsed}
      <span class="text-[13px] font-semibold text-[var(--cs-sidebar-text-active)] truncate">
        {coopName}
      </span>
    {/if}
    <button
      onclick={() => (collapsed = !collapsed)}
      class="p-1 rounded-[var(--radius-sm)] text-[var(--cs-sidebar-text)] hover:text-[var(--cs-sidebar-text-active)] hover:bg-[var(--cs-sidebar-hover)] cs-transition cursor-pointer"
      class:ml-auto={!collapsed}
      title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
    >
      {#if collapsed}
        <PanelLeftOpen class="h-4 w-4" />
      {:else}
        <PanelLeftClose class="h-4 w-4" />
      {/if}
    </button>
  </div>

  <!-- Nav sections -->
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
        <a
          href={item.href}
          class="group relative flex items-center gap-2.5 rounded-[var(--radius-sm)] cs-transition
            {collapsed ? 'justify-center px-2 py-2' : 'px-2.5 py-1.5'}
            {active
              ? 'text-[var(--cs-sidebar-text-active)] bg-[var(--cs-sidebar-hover)]'
              : 'text-[var(--cs-sidebar-text)] hover:text-[var(--cs-sidebar-text-active)] hover:bg-[var(--cs-sidebar-hover)]'}"
          title={collapsed ? item.label : undefined}
          aria-label={collapsed ? item.label : undefined}
        >
          <!-- Active indicator -->
          {#if active}
            <span class="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-[var(--cs-sidebar-accent)]"></span>
          {/if}
          <item.icon class="h-4 w-4 shrink-0" />
          {#if !collapsed}
            <span class="text-[13px] font-medium truncate">{item.label}</span>
          {/if}
        </a>
      {/each}
    {/each}

    <!-- Footer -->
    <div class="mt-auto pt-2 border-t border-[var(--cs-sidebar-border)] flex flex-col gap-0.5">
      <!-- Theme toggle -->
      <div class="flex items-center {collapsed ? 'justify-center' : 'px-1'} py-1">
        <ThemeToggle variant="icon" />
      </div>

      <!-- User -->
      {#if user}
        <div
          class="flex items-center gap-2.5 px-2 py-1.5 rounded-[var(--radius-sm)]"
          class:justify-center={collapsed}
        >
          <Avatar name={user.displayName} size="sm" />
          {#if !collapsed}
            <div class="min-w-0 flex-1">
              <p class="text-[12px] font-medium text-[var(--cs-sidebar-text-active)] truncate">
                {user.displayName}
              </p>
              {#if user.handle}
                <p class="text-[11px] text-[var(--cs-sidebar-text)] truncate">
                  @{user.handle}
                </p>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </nav>
</aside>
