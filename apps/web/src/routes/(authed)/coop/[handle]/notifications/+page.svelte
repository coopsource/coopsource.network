<script lang="ts">
  import Bell from '@lucide/svelte/icons/bell';
  import Check from '@lucide/svelte/icons/check';
  import { createApiClient } from '$lib/api/client.js';
  import type { Notification } from '$lib/api/types.js';
  import { getUnreadCount, setUnreadCount, decrementUnreadCount } from '$lib/stores/events.svelte.js';
  import { timeAgo } from '$lib/utils/time.js';

  let { data } = $props();

  let notifications = $state<Notification[]>(data.notifications);
  let cursor = $state<string | undefined>(data.cursor);
  let filter = $state<'all' | 'unread'>('all');
  let loadingMore = $state(false);

  // Sync when SvelteKit re-runs the load function (e.g., navigation, invalidation)
  $effect(() => {
    notifications = data.notifications;
    cursor = data.cursor;
  });

  const filtered = $derived(
    filter === 'unread' ? notifications.filter((n) => !n.read) : notifications,
  );

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

  async function loadMore() {
    if (!cursor || loadingMore) return;
    loadingMore = true;
    try {
      const api = createApiClient(fetch);
      const result = await api.getNotifications({ limit: 25, cursor });
      notifications = [...notifications, ...result.notifications];
      cursor = result.cursor;
    } catch {
      // silently fail
    } finally {
      loadingMore = false;
    }
  }
</script>

<div class="max-w-3xl">
  <!-- Header -->
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-lg font-semibold text-[var(--cs-text)]">Notifications</h1>
    {#if getUnreadCount() > 0}
      <button
        type="button"
        onclick={markAllRead}
        class="flex items-center gap-1.5 text-[12px] text-[var(--cs-primary)] hover:underline cursor-pointer"
      >
        <Check class="h-3.5 w-3.5" />
        Mark all as read
      </button>
    {/if}
  </div>

  <!-- Filter tabs -->
  <div class="flex gap-0.5 border-b border-[var(--cs-border)] mb-4" role="tablist">
    <button
      role="tab"
      aria-selected={filter === 'all'}
      class="px-3 py-2 text-[13px] font-medium cs-transition border-b-2 -mb-px cursor-pointer
        {filter === 'all'
          ? 'border-[var(--cs-primary)] text-[var(--cs-primary)]'
          : 'border-transparent text-[var(--cs-text-muted)] hover:text-[var(--cs-text-secondary)]'}"
      onclick={() => (filter = 'all')}
    >
      All
    </button>
    <button
      role="tab"
      aria-selected={filter === 'unread'}
      class="px-3 py-2 text-[13px] font-medium cs-transition border-b-2 -mb-px cursor-pointer
        {filter === 'unread'
          ? 'border-[var(--cs-primary)] text-[var(--cs-primary)]'
          : 'border-transparent text-[var(--cs-text-muted)] hover:text-[var(--cs-text-secondary)]'}"
      onclick={() => (filter = 'unread')}
    >
      Unread
      {#if getUnreadCount() > 0}
        <span class="ml-1 text-[11px]">{getUnreadCount()}</span>
      {/if}
    </button>
  </div>

  <!-- Notification list -->
  {#if filtered.length === 0}
    <div class="text-center py-12">
      <Bell size={40} class="mx-auto text-[var(--cs-text-muted)] mb-3" />
      <p class="text-sm text-[var(--cs-text-secondary)]">
        {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
      </p>
    </div>
  {:else}
    <div class="flex flex-col gap-1">
      {#each filtered as notif}
        <button
          type="button"
          class="w-full text-left px-4 py-3 rounded-[var(--radius-md)] border border-[var(--cs-border)] hover:bg-[var(--cs-bg-inset)] cs-transition cursor-pointer flex items-start gap-3
            {notif.read ? 'bg-[var(--cs-bg-card)]' : 'bg-[var(--cs-bg-elevated)]'}"
          onclick={() => { if (!notif.read) markRead(notif.id); }}
        >
          <!-- Unread dot -->
          <div class="mt-1.5 shrink-0">
            {#if !notif.read}
              <span class="block w-2.5 h-2.5 rounded-full bg-[var(--cs-primary)]"></span>
            {:else}
              <span class="block w-2.5 h-2.5"></span>
            {/if}
          </div>

          <!-- Content -->
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-2">
              <p class="text-[13px] text-[var(--cs-text)] {notif.read ? '' : 'font-semibold'} truncate">{notif.title}</p>
              <span class="text-[11px] text-[var(--cs-text-muted)] shrink-0">{timeAgo(notif.createdAt)}</span>
            </div>
            {#if notif.body}
              <p class="text-[12px] text-[var(--cs-text-muted)] mt-0.5 line-clamp-2">{notif.body}</p>
            {/if}
            <span class="inline-block mt-1 text-[10px] text-[var(--cs-text-muted)] bg-[var(--cs-bg-inset)] px-1.5 py-0.5 rounded">{notif.category}</span>
          </div>
        </button>
      {/each}
    </div>

    <!-- Load more -->
    {#if cursor && filter === 'all'}
      <div class="mt-4 text-center">
        <button
          type="button"
          onclick={loadMore}
          disabled={loadingMore}
          class="px-4 py-2 text-[13px] text-[var(--cs-primary)] hover:underline cursor-pointer disabled:opacity-50"
        >
          {loadingMore ? 'Loading...' : 'Load more'}
        </button>
      </div>
    {/if}
  {/if}
</div>
