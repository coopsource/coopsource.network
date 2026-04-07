<script lang="ts">
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Home from '@lucide/svelte/icons/home';
  import Building2 from '@lucide/svelte/icons/building-2';
  import Plus from '@lucide/svelte/icons/plus';
  import { goto } from '$app/navigation';
  import { clickOutside } from '$lib/actions/click-outside.js';
  import type { CoopEntity } from '$lib/api/types.js';

  interface Props {
    /** The label to display when the dropdown is closed */
    currentLabel: string;
    /** Whether the current workspace is Home */
    isHome: boolean;
    /** The current workspace's coop did (if not Home) */
    currentCoopDid?: string;
    /** All coops the user belongs to */
    myCoops: CoopEntity[];
    /** Sidebar collapsed mode — show only icon */
    collapsed?: boolean;
  }

  let { currentLabel, isHome, currentCoopDid, myCoops, collapsed = false }: Props = $props();

  let open = $state(false);
  let buttonEl: HTMLButtonElement | undefined = $state();

  function toggle() {
    open = !open;
  }

  function close() {
    open = false;
  }

  function selectHome() {
    open = false;
    goto('/me');
  }

  function selectCoop(handle: string | null) {
    if (!handle) return;
    open = false;
    goto(`/coop/${handle}`);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      close();
      buttonEl?.focus();
    }
  }
</script>

<svelte:window onkeydown={open ? handleKeydown : undefined} />

<div class="relative">
  <button
    bind:this={buttonEl}
    type="button"
    onclick={toggle}
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label="Switch workspace"
    class="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-[var(--radius-sm)] text-[var(--cs-sidebar-text-active)] hover:bg-[var(--cs-sidebar-hover)] cs-transition cursor-pointer
      {collapsed ? 'justify-center' : 'justify-between'}"
  >
    {#if collapsed}
      {#if isHome}
        <Home class="h-4 w-4" />
      {:else}
        <Building2 class="h-4 w-4" />
      {/if}
    {:else}
      <span class="text-[13px] font-semibold truncate">{currentLabel}</span>
      <ChevronDown class="h-3.5 w-3.5 shrink-0 opacity-60" />
    {/if}
  </button>

  {#if open}
    <div
      role="menu"
      use:clickOutside={close}
      class="absolute left-0 top-full mt-1 w-56 z-50 bg-[var(--cs-bg-elevated)] border border-[var(--cs-border)] rounded-[var(--radius-md)] shadow-lg py-1"
    >
      <div class="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--cs-text-muted)]">
        Switch to
      </div>

      <button
        type="button"
        role="menuitem"
        onclick={selectHome}
        class="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--cs-text)] hover:bg-[var(--cs-bg-inset)] cs-transition cursor-pointer
          {isHome ? 'bg-[var(--cs-bg-inset)]' : ''}"
      >
        <Home class="h-4 w-4 shrink-0 text-[var(--cs-text-muted)]" />
        <span class="flex-1 text-left">Home</span>
        {#if isHome}
          <span class="text-[10px] text-[var(--cs-text-muted)]">current</span>
        {/if}
      </button>

      {#if myCoops.length > 0}
        <div class="my-1 border-t border-[var(--cs-border)]"></div>
      {/if}

      {#each myCoops as coop}
        {@const isCurrent = !isHome && coop.did === currentCoopDid}
        <button
          type="button"
          role="menuitem"
          onclick={() => selectCoop(coop.handle)}
          class="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--cs-text)] hover:bg-[var(--cs-bg-inset)] cs-transition cursor-pointer
            {isCurrent ? 'bg-[var(--cs-bg-inset)]' : ''}"
        >
          <Building2 class="h-4 w-4 shrink-0 text-[var(--cs-text-muted)]" />
          <span class="flex-1 text-left truncate">{coop.displayName}</span>
          {#if isCurrent}
            <span class="text-[10px] text-[var(--cs-text-muted)]">current</span>
          {/if}
        </button>
      {/each}

      <div class="my-1 border-t border-[var(--cs-border)]"></div>

      <a
        href="/cooperative/new"
        role="menuitem"
        class="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--cs-text-muted)] hover:bg-[var(--cs-bg-inset)] hover:text-[var(--cs-text)] cs-transition"
      >
        <Plus class="h-4 w-4 shrink-0" />
        <span>Create new coop</span>
      </a>
    </div>
  {/if}
</div>
