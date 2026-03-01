<script lang="ts">
  import { page } from '$app/stores';
  import type { Component } from 'svelte';
  import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
  import Users from '@lucide/svelte/icons/users';
  import Mail from '@lucide/svelte/icons/mail';
  import Vote from '@lucide/svelte/icons/vote';
  import FileSignature from '@lucide/svelte/icons/file-signature';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import Compass from '@lucide/svelte/icons/compass';
  import Banknote from '@lucide/svelte/icons/banknote';
  import Globe from '@lucide/svelte/icons/globe';
  import Bot from '@lucide/svelte/icons/bot';
  import Link2 from '@lucide/svelte/icons/link-2';
  import CreditCard from '@lucide/svelte/icons/credit-card';
  import Settings from '@lucide/svelte/icons/settings';
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

  const mainNav: NavItem[] = $derived.by(() => {
    const prefix = workspace?.prefix ?? '';

    if (workspace?.type === 'network') {
      return [
        { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { href: `${prefix}/cooperatives`, label: 'Cooperatives', icon: Users },
        { href: `${prefix}/governance`, label: 'Governance', icon: Vote },
        { href: `${prefix}/agreements`, label: 'Agreements', icon: FileSignature },
      ];
    }

    if (prefix) {
      return [
        { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { href: `${prefix}/members`, label: 'Members', icon: Users },
        { href: `${prefix}/invitations`, label: 'Invitations', icon: Mail },
        { href: `${prefix}/governance`, label: 'Governance', icon: Vote },
        { href: `${prefix}/agreements`, label: 'Agreements', icon: FileSignature },
        { href: `${prefix}/alignment`, label: 'Alignment', icon: Compass },
        { href: `${prefix}/campaigns`, label: 'Campaigns', icon: Banknote },
        { href: `${prefix}/posts`, label: 'Posts', icon: MessageSquare },
        { href: `${prefix}/networks`, label: 'Networks', icon: Globe },
        { href: `${prefix}/agents`, label: 'Agents', icon: Bot },
      ];
    }

    // Fallback: no workspace context (shouldn't happen, but safe default)
    return [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/members', label: 'Members', icon: Users },
      { href: '/invitations', label: 'Invitations', icon: Mail },
      { href: '/proposals', label: 'Proposals', icon: Vote },
      { href: '/agreements', label: 'Agreements', icon: FileSignature },
      { href: '/alignment', label: 'Alignment', icon: Compass },
      { href: '/campaigns', label: 'Campaigns', icon: Banknote },
      { href: '/threads', label: 'Threads', icon: MessageSquare },
      { href: '/networks', label: 'Networks', icon: Globe },
    ];
  });

  const bottomNav: NavItem[] = $derived.by(() => {
    const prefix = workspace?.prefix ?? '';
    if (prefix) {
      return [
        { href: `${prefix}/settings/payments`, label: 'Payments', icon: CreditCard },
        { href: `${prefix}/settings/connections`, label: 'Connections', icon: Link2 },
        { href: `${prefix}/settings`, label: 'Settings', icon: Settings },
      ];
    }
    return [
      { href: '/settings/connections', label: 'Connections', icon: Link2 },
      { href: '/cooperative', label: 'Settings', icon: Settings },
    ];
  });

  function isActive(href: string): boolean {
    if (href === '/dashboard') {
      return $page.url.pathname === '/dashboard';
    }
    return $page.url.pathname === href || $page.url.pathname.startsWith(href + '/');
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

  <!-- Main nav -->
  <nav class="flex flex-1 flex-col px-2 py-2 gap-0.5 overflow-y-auto">
    {#each mainNav as item}
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

    <!-- Bottom section -->
    <div class="mt-auto pt-2 border-t border-[var(--cs-sidebar-border)] flex flex-col gap-0.5">
      {#each bottomNav as item}
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
          {#if active}
            <span class="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-[var(--cs-sidebar-accent)]"></span>
          {/if}
          <item.icon class="h-4 w-4 shrink-0" />
          {#if !collapsed}
            <span class="text-[13px] font-medium truncate">{item.label}</span>
          {/if}
        </a>
      {/each}

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
