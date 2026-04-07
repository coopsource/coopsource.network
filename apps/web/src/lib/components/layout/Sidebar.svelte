<script lang="ts">
  import { page } from '$app/stores';
  import PanelLeftClose from '@lucide/svelte/icons/panel-left-close';
  import PanelLeftOpen from '@lucide/svelte/icons/panel-left-open';
  import ThemeToggle from '$lib/components/ui/ThemeToggle.svelte';
  import Avatar from '$lib/components/ui/Avatar.svelte';
  import type { AuthUser, WorkspaceContext } from '$lib/api/types.js';
  import {
    cooperativeNavSection,
    networkNavSection,
    youNavSection,
    isNavItemActive,
    isAdminRoles,
    type NavSection,
  } from './sidebar-nav.js';

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

  const isAdmin = $derived(isAdminRoles(workspace?.userRoles));
  const cooperativeNav = $derived(cooperativeNavSection(workspace, isAdmin));
  const networkNav = $derived(networkNavSection(workspace));
  const youNav = $derived(youNavSection(workspace));

  const sections: NavSection[] = $derived(
    [cooperativeNav, networkNav, youNav].filter((s) => s.items.length > 0)
  );

  function isActive(href: string): boolean {
    return isNavItemActive(href, $page.url.pathname, workspace?.prefix);
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
