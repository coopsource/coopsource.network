<script lang="ts">
  import Bell from '@lucide/svelte/icons/bell';
  import { getUnreadCount, setUnreadCount, decrementUnreadCount } from '$lib/stores/events.svelte.js';
  import { createApiClient } from '$lib/api/client.js';
  import type { Notification } from '$lib/api/types.js';
  import { timeAgo } from '$lib/utils/time.js';

  interface Props {
    workspacePrefix: string;
  }

  let { workspacePrefix }: Props = $props();

  let open = $state(false);
  let notifications = $state<Notification[]>([]);
  let loading = $state(false);

  async function toggle() {
    open = !open;
    if (open) {
      loading = true;
      try {
        const api = createApiClient(fetch);
        const result = await api.getNotifications({ limit: 5 });
        notifications = result.notifications;
      } catch {
        // silently fail
      } finally {
        loading = false;
      }
    }
  }

  async function markRead(id: string) {
    try {
      const api = createApiClient(fetch);
      await api.markNotificationRead(id);
      notifications = notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n,
      );
      decrementUnreadCount();
    } catch {
      // silently fail
    }
  }

  async function markAllRead() {
    try {
      const api = createApiClient(fetch);
      await api.markAllNotificationsRead();
      notifications = notifications.map((n) => ({ ...n, read: true }));
      setUnreadCount(0);
    } catch {
      // silently fail
    }
  }

  function handleClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('[data-notification-menu]')) {
      open = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) {
      open = false;
    }
  }
</script>

<svelte:window
  onclick={open ? handleClickOutside : undefined}
  onkeydown={open ? handleKeydown : undefined}
/>

<div class="relative" data-notification-menu>
  <button
    type="button"
    onclick={toggle}
    class="relative p-1.5 rounded-[var(--radius-sm)] text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)] cs-transition cursor-pointer"
    aria-label="Notifications"
  >
    <Bell class="h-4 w-4" />
    {#if getUnreadCount() > 0}
      <span class="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-[var(--color-danger)] text-white text-[10px] font-bold leading-none">
        {getUnreadCount() > 99 ? '99+' : getUnreadCount()}
      </span>
    {/if}
  </button>

  {#if open}
    <div class="absolute right-0 top-full z-50 mt-1 w-80 bg-[var(--cs-bg-elevated)] border border-[var(--cs-border)] rounded-[var(--radius-md)] shadow-md overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between px-3 py-2 border-b border-[var(--cs-border)]">
        <span class="text-[13px] font-semibold text-[var(--cs-text)]">Notifications</span>
        {#if getUnreadCount() > 0}
          <button
            type="button"
            onclick={markAllRead}
            class="text-[11px] text-[var(--cs-primary)] hover:underline cursor-pointer"
          >
            Mark all read
          </button>
        {/if}
      </div>

      <!-- Items -->
      <div class="max-h-80 overflow-y-auto">
        {#if loading}
          <div class="px-3 py-6 text-center text-[12px] text-[var(--cs-text-muted)]">Loading...</div>
        {:else if notifications.length === 0}
          <div class="px-3 py-6 text-center text-[12px] text-[var(--cs-text-muted)]">No notifications</div>
        {:else}
          {#each notifications as notif}
            <button
              type="button"
              class="w-full text-left px-3 py-2.5 hover:bg-[var(--cs-bg-inset)] cs-transition cursor-pointer flex items-start gap-2.5
                {notif.read ? '' : 'bg-[var(--cs-bg-inset)]/50'}"
              onclick={() => { if (!notif.read) markRead(notif.id); }}
            >
              {#if !notif.read}
                <span class="mt-1.5 shrink-0 w-2 h-2 rounded-full bg-[var(--cs-primary)]"></span>
              {:else}
                <span class="mt-1.5 shrink-0 w-2 h-2"></span>
              {/if}
              <div class="min-w-0 flex-1">
                <p class="text-[12px] text-[var(--cs-text)] {notif.read ? '' : 'font-semibold'} truncate">{notif.title}</p>
                {#if notif.body}
                  <p class="text-[11px] text-[var(--cs-text-muted)] truncate mt-0.5">{notif.body}</p>
                {/if}
                <p class="text-[10px] text-[var(--cs-text-muted)] mt-0.5">{timeAgo(notif.createdAt)}</p>
              </div>
            </button>
          {/each}
        {/if}
      </div>

      <!-- Footer -->
      {#if workspacePrefix}
        <div class="border-t border-[var(--cs-border)] px-3 py-2">
          <a
            href="{workspacePrefix}/notifications"
            class="text-[12px] text-[var(--cs-primary)] hover:underline"
            onclick={() => (open = false)}
          >
            View all notifications
          </a>
        </div>
      {/if}
    </div>
  {/if}
</div>
