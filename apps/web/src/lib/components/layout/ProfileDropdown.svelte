<script lang="ts">
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import User from '@lucide/svelte/icons/user';
  import Settings from '@lucide/svelte/icons/settings';
  import BadgeCheck from '@lucide/svelte/icons/badge-check';
  import { clickOutside } from '$lib/actions/click-outside.js';
  import Avatar from '$lib/components/ui/Avatar.svelte';
  import type { AuthUser, Profile } from '$lib/api/types.js';

  interface Props {
    /** The authenticated user (for fallback display name + handle) */
    user: AuthUser;
    /** The user's current default profile (V8.3 always = the only profile) */
    profile: Profile | null;
    /** Sidebar collapsed mode — show only avatar */
    collapsed?: boolean;
  }

  let { user, profile, collapsed = false }: Props = $props();

  // V8.3 — single profile per user. The dropdown is a single-item shell;
  // multi-profile selection arrives in V8.X. We still mount the affordance
  // so the navigation pattern is in place.
  const displayName = $derived(profile?.displayName ?? user.displayName);
  const verified = $derived(profile?.verified ?? false);

  let open = $state(false);
  let buttonEl: HTMLButtonElement | undefined = $state();

  function toggle() {
    open = !open;
  }

  function close() {
    open = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      close();
      buttonEl?.focus();
    }
  }
</script>

<svelte:window onkeydown={open ? handleKeydown : undefined} />

<!-- clickOutside on the wrapper so the toggle button click is not counted
     as "outside" (capture-phase listener would otherwise fire first). -->
<div class="relative" use:clickOutside={close}>
  <button
    bind:this={buttonEl}
    type="button"
    onclick={toggle}
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label="Open profile menu"
    data-testid="profile-dropdown-trigger"
    class="flex items-center gap-2.5 w-full px-2 py-1.5 rounded-[var(--radius-sm)] text-[var(--cs-sidebar-text-active)] hover:bg-[var(--cs-sidebar-hover)] cs-transition cursor-pointer
      {collapsed ? 'justify-center' : ''}"
  >
    <Avatar name={displayName} size="sm" />
    {#if !collapsed}
      <div class="min-w-0 flex-1 text-left">
        <p class="text-[12px] font-medium text-[var(--cs-sidebar-text-active)] truncate">
          {displayName}
        </p>
        {#if user.handle}
          <p class="text-[11px] text-[var(--cs-sidebar-text)] truncate">
            @{user.handle}
          </p>
        {/if}
      </div>
      <ChevronDown class="h-3.5 w-3.5 shrink-0 opacity-60" />
    {/if}
  </button>

  {#if open}
    <div
      role="menu"
      data-testid="profile-dropdown-menu"
      class="absolute left-0 bottom-full mb-1 w-56 z-50 bg-[var(--cs-bg-elevated)] border border-[var(--cs-border)] rounded-[var(--radius-md)] shadow-lg py-1"
    >
      <div class="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--cs-text-muted)]">
        Profile
      </div>

      <!-- Current profile row (read-only in V8.3 — single profile per user) -->
      <div
        class="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--cs-text)] bg-[var(--cs-bg-inset)]"
      >
        <Avatar name={displayName} size="sm" />
        <span class="flex-1 text-left truncate">{displayName}</span>
        {#if verified}
          <BadgeCheck class="h-3.5 w-3.5 shrink-0 text-[var(--cs-text-muted)]" aria-label="Verified" />
        {/if}
        <span class="text-[10px] text-[var(--cs-text-muted)]">current</span>
      </div>

      <div class="my-1 border-t border-[var(--cs-border)]"></div>

      <a
        href="/me/profile"
        role="menuitem"
        onclick={close}
        class="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--cs-text)] hover:bg-[var(--cs-bg-inset)] cs-transition cursor-pointer"
      >
        <User class="h-4 w-4 shrink-0 text-[var(--cs-text-muted)]" />
        <span class="flex-1 text-left">View profile</span>
      </a>

      <a
        href="/me/settings"
        role="menuitem"
        onclick={close}
        class="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--cs-text)] hover:bg-[var(--cs-bg-inset)] cs-transition cursor-pointer"
      >
        <Settings class="h-4 w-4 shrink-0 text-[var(--cs-text-muted)]" />
        <span class="flex-1 text-left">Settings</span>
      </a>
    </div>
  {/if}
</div>
