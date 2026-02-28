<script lang="ts">
  import { page } from '$app/stores';
  import type { AuthUser, WorkspaceContext } from '$lib/api/types.js';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import LogOut from '@lucide/svelte/icons/log-out';
  import User from '@lucide/svelte/icons/user';

  interface Props {
    user?: AuthUser | null;
    workspace?: WorkspaceContext | null;
  }

  let { user = null, workspace = null }: Props = $props();

  let menuOpen = $state(false);

  // Build breadcrumb from current path
  const breadcrumbs = $derived.by(() => {
    const path = $page.url.pathname;
    const segments = path.split('/').filter(Boolean);

    // Workspace-aware breadcrumbs: skip "coop"/"net" prefix, replace handle with display name
    if (workspace && segments.length >= 2 && (segments[0] === 'coop' || segments[0] === 'net')) {
      const contextSegments = segments.slice(2);
      const crumbs = [
        {
          label: workspace.cooperative.displayName,
          href: workspace.prefix,
          isLast: contextSegments.length === 0,
        },
        ...contextSegments.map((seg, i) => ({
          label: seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' '),
          href: `${workspace.prefix}/${contextSegments.slice(0, i + 1).join('/')}`,
          isLast: i === contextSegments.length - 1,
        })),
      ];
      return crumbs;
    }

    // Default: original behavior
    return segments.map((seg, i) => ({
      label: seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' '),
      href: '/' + segments.slice(0, i + 1).join('/'),
      isLast: i === segments.length - 1,
    }));
  });

  const settingsHref = $derived(workspace ? `${workspace.prefix}/settings` : '/cooperative');

  function handleClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('[data-user-menu]')) {
      menuOpen = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && menuOpen) {
      menuOpen = false;
    }
  }
</script>

<svelte:window
  onclick={menuOpen ? handleClickOutside : undefined}
  onkeydown={menuOpen ? handleKeydown : undefined}
/>

<header class="flex items-center justify-between h-12 px-4 border-b border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
  <!-- Breadcrumb -->
  <nav class="flex items-center gap-1 text-[13px]" aria-label="Breadcrumb">
    {#each breadcrumbs as crumb}
      {#if !crumb.isLast}
        <a href={crumb.href} class="text-[var(--cs-text-muted)] hover:text-[var(--cs-text-secondary)] cs-transition">
          {crumb.label}
        </a>
        <ChevronRight class="h-3.5 w-3.5 text-[var(--cs-text-muted)]" />
      {:else}
        <span class="font-medium text-[var(--cs-text)]">{crumb.label}</span>
      {/if}
    {/each}
  </nav>

  <!-- User dropdown -->
  {#if user}
    <div class="relative" data-user-menu>
      <button
        type="button"
        onclick={() => (menuOpen = !menuOpen)}
        class="flex items-center gap-2 px-2 py-1 rounded-[var(--radius-sm)] text-[13px] text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)] cs-transition cursor-pointer"
      >
        <span class="font-medium">{user.displayName}</span>
        <span class="text-[var(--cs-text-muted)] text-[10px]">▾</span>
      </button>

      {#if menuOpen}
        <div class="absolute right-0 top-full z-50 mt-1 w-52 bg-[var(--cs-bg-elevated)] border border-[var(--cs-border)] rounded-[var(--radius-md)] shadow-md overflow-hidden">
          <div class="px-3 py-2 border-b border-[var(--cs-border)]">
            <p class="text-[12px] font-medium text-[var(--cs-text)]">{user.displayName}</p>
            <p class="text-[11px] text-[var(--cs-text-muted)]">{user.email}</p>
            {#if user.handle}
              <p class="text-[11px] text-[var(--cs-text-muted)]">@{user.handle}</p>
            {/if}
          </div>
          <div class="py-1">
            <a
              href={settingsHref}
              class="flex items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)] cs-transition"
              onclick={() => (menuOpen = false)}
            >
              <User class="h-3.5 w-3.5" />
              Profile
            </a>
            <form method="POST" action="/logout">
              <button
                type="submit"
                class="flex items-center gap-2 w-full px-3 py-1.5 text-[13px] text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] cs-transition cursor-pointer"
                onclick={() => (menuOpen = false)}
              >
                <LogOut class="h-3.5 w-3.5" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</header>
