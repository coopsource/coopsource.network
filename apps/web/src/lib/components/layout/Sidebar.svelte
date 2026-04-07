<script lang="ts">
  import { page } from '$app/stores';
  import PanelLeftClose from '@lucide/svelte/icons/panel-left-close';
  import PanelLeftOpen from '@lucide/svelte/icons/panel-left-open';
  import ThemeToggle from '$lib/components/ui/ThemeToggle.svelte';
  import type { AuthUser, WorkspaceContext, CoopEntity, Profile } from '$lib/api/types.js';
  import WorkspaceSwitcher from './WorkspaceSwitcher.svelte';
  import ProfileDropdown from './ProfileDropdown.svelte';
  import {
    cooperativeNavSection,
    networkNavSection,
    homeNavSection,
    myCoopsNavSection,
    youNavSection,
    isNavItemActive,
    isAdminRoles,
    type NavSection,
  } from './sidebar-nav.js';

  interface Props {
    user?: AuthUser | null;
    workspaceLabel?: string;
    myCoops?: CoopEntity[];
    collapsed?: boolean;
    workspace?: WorkspaceContext | null;
    /** V8.3 — current profile (always = the user's default profile in V8.3) */
    currentProfile?: Profile | null;
  }

  let {
    user = null,
    workspaceLabel = 'Co-op Source',
    myCoops = [],
    collapsed = $bindable(false),
    workspace = null,
    currentProfile = null,
  }: Props = $props();

  const isHome = $derived(workspace?.type === 'home');
  const isAdmin = $derived(isAdminRoles(workspace?.userRoles));

  const homeNav = $derived(homeNavSection(workspace));
  const cooperativeNav = $derived(cooperativeNavSection(workspace, isAdmin));
  const networkNav = $derived(networkNavSection(workspace));
  const myCoopsNav = $derived(myCoopsNavSection(workspace, myCoops));
  const youNav = $derived(youNavSection(workspace));

  const sections: NavSection[] = $derived(
    [homeNav, cooperativeNav, networkNav, myCoopsNav, youNav].filter((s) => s.items.length > 0)
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
    <div class="flex-1 min-w-0">
      <WorkspaceSwitcher
        currentLabel={workspaceLabel}
        {isHome}
        currentCoopDid={workspace?.cooperative?.did}
        {myCoops}
        {collapsed}
      />
    </div>
    <button
      onclick={() => (collapsed = !collapsed)}
      class="p-1 rounded-[var(--radius-sm)] text-[var(--cs-sidebar-text)] hover:text-[var(--cs-sidebar-text-active)] hover:bg-[var(--cs-sidebar-hover)] cs-transition cursor-pointer"
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
      {#if !collapsed && section.label}
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

      <!-- User / profile dropdown (V8.3) -->
      {#if user}
        <ProfileDropdown {user} profile={currentProfile} {collapsed} />
      {/if}
    </div>
  </nav>
</aside>
