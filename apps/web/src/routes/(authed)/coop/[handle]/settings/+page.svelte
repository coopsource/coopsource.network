<script lang="ts">
  import { enhance } from '$app/forms';
  import { Badge, Tabs } from '$lib/components/ui';
  import Bell from '@lucide/svelte/icons/bell';
  import Check from '@lucide/svelte/icons/check';
  import { createApiClient } from '$lib/api/client.js';
  import type { Notification } from '$lib/api/types.js';
  import { getUnreadCount, setUnreadCount, decrementUnreadCount } from '$lib/stores/events.svelte.js';
  import { env } from '$env/dynamic/public';
  import { timeAgo } from '$lib/utils/time.js';

  let { data, form } = $props();

  let activeTab = $state('settings');

  const tabs = [
    { id: 'settings', label: 'Settings' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'connections', label: 'Connections' },
    { id: 'payments', label: 'Payments' },
  ];

  // Settings state
  let editing = $state(false);
  let submitting = $state(false);
  let savingVisibility = $state(false);

  const coop = $derived(form?.cooperative ?? data.cooperative);

  function statusToVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
    switch (status) {
      case 'active': case 'accepted': case 'resolved': case 'signed': return 'success';
      case 'pending': case 'open': case 'closed': return 'warning';
      case 'revoked': case 'void': case 'voided': return 'danger';
      default: return 'default';
    }
  }

  // Notifications state
  let notifications = $state<Notification[]>(data.notifications);
  let cursor = $state<string | undefined>(data.notificationsCursor);
  let notifFilter = $state<'all' | 'unread'>('all');
  let loadingMore = $state(false);

  $effect(() => {
    notifications = data.notifications;
    cursor = data.notificationsCursor;
  });

  const filteredNotifications = $derived(
    notifFilter === 'unread' ? notifications.filter((n) => !n.read) : notifications,
  );

  async function markRead(id: string) {
    try {
      const api = createApiClient(fetch, undefined, env.PUBLIC_API_URL);
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
      const api = createApiClient(fetch, undefined, env.PUBLIC_API_URL);
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
      const api = createApiClient(fetch, undefined, env.PUBLIC_API_URL);
      const result = await api.getNotifications({ limit: 25, cursor });
      notifications = [...notifications, ...result.notifications];
      cursor = result.cursor;
    } catch {
      // silently fail
    } finally {
      loadingMore = false;
    }
  }

  // Connections state
  let connectSubmitting = $state(false);

  const serviceLabels: Record<string, string> = {
    github: 'GitHub',
    google: 'Google',
    slack: 'Slack',
    linear: 'Linear',
    zoom: 'Zoom',
  };

  $effect(() => {
    if (form?.redirect) {
      window.location.href = form.redirect as string;
    }
  });

  // Payments state
  let addingPayment = $state(false);
  let showAddPaymentForm = $state(false);
</script>

<svelte:head>
  <title>Co-op Settings — Co-op Source</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">Co-op Settings</h1>
    {#if activeTab === 'settings' && !editing}
      <button type="button" onclick={() => (editing = true)} class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]">Edit</button>
    {/if}
    {#if activeTab === 'payments' && !showAddPaymentForm}
      <button onclick={() => showAddPaymentForm = true} class="rounded-md bg-[var(--cs-primary)] px-3 py-2 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]">
        Add Provider
      </button>
    {/if}
  </div>

  <Tabs {tabs} bind:active={activeTab} />

  <!-- Settings Tab -->
  {#if activeTab === 'settings'}
    {#if form?.error}
      <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
    {/if}
    {#if form?.success && !editing}
      <div class="rounded-md bg-green-50 p-3 text-sm text-green-700">Settings saved.</div>
    {/if}
    {#if form?.visibilitySuccess}
      <div class="rounded-md bg-green-50 p-3 text-sm text-green-700">Visibility settings saved.</div>
    {/if}

    {#if editing}
      <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-5">
        <form method="POST" action="?/update" use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; editing = false; await update(); }; }} class="space-y-4">
          <div>
            <label for="displayName" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Display Name</label>
            <input id="displayName" name="displayName" type="text" required value={coop.displayName} class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
          </div>
          <div>
            <label for="description" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Description</label>
            <textarea id="description" name="description" rows={3} value={coop.description ?? ''} class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" placeholder="Describe your cooperative..."></textarea>
          </div>
          <div>
            <label for="website" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Website</label>
            <input id="website" name="website" type="url" value={coop.website ?? ''} class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" placeholder="https://example.com" />
          </div>
          <div class="flex gap-3">
            <button type="submit" disabled={submitting} class="rounded-md bg-[var(--cs-primary)] px-4 py-2 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50">
              {submitting ? 'Saving...' : 'Save changes'}
            </button>
            <button type="button" onclick={() => (editing = false)} class="rounded-md border border-[var(--cs-border)] px-4 py-2 text-sm font-medium text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]">Cancel</button>
          </div>
        </form>
      </div>
    {:else}
      <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-5">
        <dl class="space-y-4">
          <div>
            <dt class="text-xs font-medium uppercase tracking-wide text-[var(--cs-text-muted)]">Name</dt>
            <dd class="mt-1 text-sm text-[var(--cs-text)]">{coop.displayName}</dd>
          </div>
          {#if coop.handle}
            <div>
              <dt class="text-xs font-medium uppercase tracking-wide text-[var(--cs-text-muted)]">Handle</dt>
              <dd class="mt-1 text-sm text-[var(--cs-text)]">@{coop.handle}</dd>
            </div>
          {/if}
          <div>
            <dt class="text-xs font-medium uppercase tracking-wide text-[var(--cs-text-muted)]">Status</dt>
            <dd class="mt-1"><Badge variant={statusToVariant(coop.status)}>{coop.status}</Badge></dd>
          </div>
          {#if coop.description}
            <div>
              <dt class="text-xs font-medium uppercase tracking-wide text-[var(--cs-text-muted)]">Description</dt>
              <dd class="mt-1 text-sm text-[var(--cs-text-secondary)]">{coop.description}</dd>
            </div>
          {/if}
          {#if coop.website}
            <div>
              <dt class="text-xs font-medium uppercase tracking-wide text-[var(--cs-text-muted)]">Website</dt>
              <dd class="mt-1"><a href={coop.website} target="_blank" rel="noreferrer" class="text-sm text-[var(--cs-primary)] hover:underline">{coop.website}</a></dd>
            </div>
          {/if}
          <div>
            <dt class="text-xs font-medium uppercase tracking-wide text-[var(--cs-text-muted)]">DID</dt>
            <dd class="mt-1 font-mono text-xs text-[var(--cs-text-muted)]">{coop.did}</dd>
          </div>
          <div>
            <dt class="text-xs font-medium uppercase tracking-wide text-[var(--cs-text-muted)]">Created</dt>
            <dd class="mt-1 text-sm text-[var(--cs-text-secondary)]">{new Date(coop.createdAt).toLocaleDateString()}</dd>
          </div>
        </dl>
      </div>
    {/if}

    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-5">
      <h2 class="text-base font-semibold text-[var(--cs-text)]">Public Profile Visibility</h2>
      <p class="mt-1 text-sm text-[var(--cs-text-muted)]">Control what's visible on your public profile at /explore.</p>

      <form method="POST" action="?/updateVisibility" use:enhance={() => { savingVisibility = true; return async ({ update }) => { savingVisibility = false; await update(); }; }} class="mt-4 space-y-3">
        <label class="flex items-center justify-between gap-3 py-1">
          <div>
            <span class="text-sm font-medium text-[var(--cs-text)]">Description</span>
            <span class="block text-xs text-[var(--cs-text-muted)]">Show your cooperative's description publicly</span>
          </div>
          <input type="checkbox" name="publicDescription" checked={coop.publicDescription} class="h-4 w-4 rounded border-[var(--cs-input-border)] text-[var(--cs-primary)] focus:ring-[var(--cs-ring)]" />
        </label>

        <label class="flex items-center justify-between gap-3 py-1">
          <div>
            <span class="text-sm font-medium text-[var(--cs-text)]">Member count</span>
            <span class="block text-xs text-[var(--cs-text-muted)]">Show how many members your cooperative has</span>
          </div>
          <input type="checkbox" name="publicMembers" checked={coop.publicMembers} class="h-4 w-4 rounded border-[var(--cs-input-border)] text-[var(--cs-primary)] focus:ring-[var(--cs-ring)]" />
        </label>

        <label class="flex items-center justify-between gap-3 py-1">
          <div>
            <span class="text-sm font-medium text-[var(--cs-text)]">Activity</span>
            <span class="block text-xs text-[var(--cs-text-muted)]">Show which networks you belong to</span>
          </div>
          <input type="checkbox" name="publicActivity" checked={coop.publicActivity} class="h-4 w-4 rounded border-[var(--cs-input-border)] text-[var(--cs-primary)] focus:ring-[var(--cs-ring)]" />
        </label>

        <label class="flex items-center justify-between gap-3 py-1">
          <div>
            <span class="text-sm font-medium text-[var(--cs-text)]">Agreements</span>
            <span class="block text-xs text-[var(--cs-text-muted)]">Show your cooperative's agreements publicly</span>
          </div>
          <input type="checkbox" name="publicAgreements" checked={coop.publicAgreements} class="h-4 w-4 rounded border-[var(--cs-input-border)] text-[var(--cs-primary)] focus:ring-[var(--cs-ring)]" />
        </label>

        <label class="flex items-center justify-between gap-3 py-1">
          <div>
            <span class="text-sm font-medium text-[var(--cs-text)]">Campaigns</span>
            <span class="block text-xs text-[var(--cs-text-muted)]">Show your cooperative's funding campaigns publicly</span>
          </div>
          <input type="checkbox" name="publicCampaigns" checked={coop.publicCampaigns} class="h-4 w-4 rounded border-[var(--cs-input-border)] text-[var(--cs-primary)] focus:ring-[var(--cs-ring)]" />
        </label>

        <div class="pt-2">
          <button type="submit" disabled={savingVisibility} class="rounded-md bg-[var(--cs-primary)] px-4 py-2 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50">
            {savingVisibility ? 'Saving...' : 'Save visibility settings'}
          </button>
        </div>
      </form>
    </div>

  <!-- Notifications Tab -->
  {:else if activeTab === 'notifications'}
    <div class="max-w-3xl">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-lg font-semibold text-[var(--cs-text)]">Notifications</h2>
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

      <div class="flex gap-0.5 border-b border-[var(--cs-border)] mb-4" role="tablist">
        <button
          role="tab"
          aria-selected={notifFilter === 'all'}
          class="px-3 py-2 text-[13px] font-medium cs-transition border-b-2 -mb-px cursor-pointer
            {notifFilter === 'all'
              ? 'border-[var(--cs-primary)] text-[var(--cs-primary)]'
              : 'border-transparent text-[var(--cs-text-muted)] hover:text-[var(--cs-text-secondary)]'}"
          onclick={() => (notifFilter = 'all')}
        >
          All
        </button>
        <button
          role="tab"
          aria-selected={notifFilter === 'unread'}
          class="px-3 py-2 text-[13px] font-medium cs-transition border-b-2 -mb-px cursor-pointer
            {notifFilter === 'unread'
              ? 'border-[var(--cs-primary)] text-[var(--cs-primary)]'
              : 'border-transparent text-[var(--cs-text-muted)] hover:text-[var(--cs-text-secondary)]'}"
          onclick={() => (notifFilter = 'unread')}
        >
          Unread
          {#if getUnreadCount() > 0}
            <span class="ml-1 text-[11px]">{getUnreadCount()}</span>
          {/if}
        </button>
      </div>

      {#if filteredNotifications.length === 0}
        <div class="text-center py-12">
          <Bell size={40} class="mx-auto text-[var(--cs-text-muted)] mb-3" />
          <p class="text-sm text-[var(--cs-text-secondary)]">
            {notifFilter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
          </p>
        </div>
      {:else}
        <div class="flex flex-col gap-1">
          {#each filteredNotifications as notif}
            <button
              type="button"
              class="w-full text-left px-4 py-3 rounded-[var(--radius-md)] border border-[var(--cs-border)] hover:bg-[var(--cs-bg-inset)] cs-transition cursor-pointer flex items-start gap-3
                {notif.read ? 'bg-[var(--cs-bg-card)]' : 'bg-[var(--cs-bg-elevated)]'}"
              onclick={() => { if (!notif.read) markRead(notif.id); }}
            >
              <div class="mt-1.5 shrink-0">
                {#if !notif.read}
                  <span class="block w-2.5 h-2.5 rounded-full bg-[var(--cs-primary)]"></span>
                {:else}
                  <span class="block w-2.5 h-2.5"></span>
                {/if}
              </div>

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

        {#if cursor && notifFilter === 'all'}
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

  <!-- Connections Tab -->
  {:else if activeTab === 'connections'}
    <div class="mx-auto max-w-2xl space-y-6">
      <p class="text-sm text-[var(--cs-text-muted)]">
        Connect external services to link repositories, documents, and other resources to your cooperative projects.
      </p>

      {#if form?.actionSuccess}
        <div class="rounded-md bg-green-50 p-3 text-sm text-green-700">{form.actionSuccess}</div>
      {/if}
      {#if form?.actionError}
        <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.actionError}</div>
      {/if}

      {#if data.availableServices.length > 0}
        <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-6">
          <h2 class="text-lg font-semibold text-[var(--cs-text)]">Available Services</h2>
          <div class="mt-4 space-y-3">
            {#each data.availableServices as service}
              {@const alreadyConnected = data.connections.some(c => c.service === service && c.status === 'active')}
              <div class="flex items-center justify-between rounded-md border border-[var(--cs-border)] p-3">
                <span class="text-sm font-medium text-[var(--cs-text)]">{serviceLabels[service] ?? service}</span>
                {#if alreadyConnected}
                  <Badge variant="success">Connected</Badge>
                {:else}
                  <form method="POST" action="?/connect" use:enhance={() => { connectSubmitting = true; return async ({ result, update }) => { connectSubmitting = false; if (result.type === 'success' && result.data?.redirect) { window.location.href = result.data.redirect as string; } else { await update(); } }; }}>
                    <input type="hidden" name="service" value={service} />
                    <button type="submit" disabled={connectSubmitting} class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50">Connect</button>
                  </form>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-6 text-center">
          <p class="text-sm text-[var(--cs-text-muted)]">No external services are configured. Ask your administrator to set up GitHub, Google, or other service credentials.</p>
        </div>
      {/if}

      {#if data.connections.length > 0}
        <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-6">
          <h2 class="text-lg font-semibold text-[var(--cs-text)]">Your Connections</h2>
          <div class="mt-4 space-y-3">
            {#each data.connections as connection}
              <div class="flex items-center justify-between rounded-md border border-[var(--cs-border)] p-3">
                <div>
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-[var(--cs-text)]">{serviceLabels[connection.service] ?? connection.service}</span>
                    <Badge variant={connection.status === 'active' ? 'success' : 'danger'}>{connection.status}</Badge>
                  </div>
                  {#if connection.metadata}
                    <div class="mt-1 text-xs text-[var(--cs-text-muted)]">
                      {#if connection.metadata.login}
                        @{connection.metadata.login}
                      {:else if connection.metadata.email}
                        {connection.metadata.email}
                      {/if}
                    </div>
                  {/if}
                  <div class="mt-1 text-xs text-[var(--cs-text-muted)]">Connected {new Date(connection.createdAt).toLocaleDateString()}</div>
                </div>
                {#if connection.status === 'active'}
                  <form method="POST" action="?/disconnect" use:enhance>
                    <input type="hidden" name="uri" value={connection.uri} />
                    <button type="submit" class="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50">Disconnect</button>
                  </form>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>

  <!-- Payments Tab -->
  {:else if activeTab === 'payments'}
    <div class="space-y-6">
      <p class="mt-1 text-sm text-[var(--cs-text-muted)]">Configure which payment methods are available for your cooperative's funding campaigns.</p>

      {#if form?.paymentError}
        <div class="rounded-md border border-[var(--color-danger-light)] bg-[var(--color-danger-light)] p-3 text-sm text-[var(--color-danger-dark)]">{form.paymentError}</div>
      {/if}
      {#if form?.paymentSuccess}
        <div class="rounded-md border border-green-200 bg-[var(--cs-bg-inset)] p-3 text-sm text-[var(--cs-text)]">Provider updated successfully.</div>
      {/if}

      {#if showAddPaymentForm}
        <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4">
          <h2 class="mb-3 text-sm font-medium text-[var(--cs-text)]">Add Payment Provider</h2>
          <form method="POST" action="?/addPaymentProvider" use:enhance={() => {
            addingPayment = true;
            return async ({ result, update }) => {
              addingPayment = false;
              if (result.type === 'success') {
                showAddPaymentForm = false;
              }
              await update();
            };
          }} class="space-y-3">
            <div>
              <label for="pay-providerId" class="block text-xs font-medium text-[var(--cs-text-secondary)]">Provider</label>
              <select name="providerId" id="pay-providerId" required class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]">
                {#each data.supportedProviders as sp}
                  <option value={sp.id}>{sp.displayName}</option>
                {/each}
              </select>
            </div>
            <div>
              <label for="pay-displayName" class="block text-xs font-medium text-[var(--cs-text-secondary)]">Display Name</label>
              <input name="displayName" id="pay-displayName" type="text" placeholder="e.g. Stripe" required class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
            </div>
            <div>
              <label for="pay-secretKey" class="block text-xs font-medium text-[var(--cs-text-secondary)]">Secret Key</label>
              <input name="secretKey" id="pay-secretKey" type="password" placeholder="sk_live_..." required class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm font-mono focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
            </div>
            <div>
              <label for="pay-webhookSecret" class="block text-xs font-medium text-[var(--cs-text-secondary)]">Webhook Secret <span class="text-[var(--cs-text-muted)]">(optional)</span></label>
              <input name="webhookSecret" id="pay-webhookSecret" type="password" placeholder="whsec_..." class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm font-mono focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
            </div>
            <div class="flex gap-2">
              <button type="submit" disabled={addingPayment} class="rounded-md bg-[var(--cs-primary)] px-4 py-2 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50">
                {addingPayment ? 'Adding...' : 'Add Provider'}
              </button>
              <button type="button" onclick={() => showAddPaymentForm = false} class="rounded-md border border-[var(--cs-border)] px-4 py-2 text-sm text-[var(--cs-text-muted)] hover:bg-[var(--cs-bg-inset)]">
                Cancel
              </button>
            </div>
          </form>
        </div>
      {/if}

      {#if data.paymentConfigs.length === 0 && !showAddPaymentForm}
        <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-6 text-center">
          <p class="text-sm text-[var(--cs-text-muted)]">No payment providers configured. Pledges will be recorded without online payment processing.</p>
        </div>
      {:else}
        <div class="space-y-3">
          {#each data.paymentConfigs as config}
            <div class="flex items-center justify-between rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] px-4 py-3">
              <div class="flex items-center gap-3">
                <div class="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--cs-bg-inset)] text-xs font-bold text-[var(--cs-text-muted)]">
                  {config.providerId.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p class="text-sm font-medium text-[var(--cs-text)]">{config.displayName}</p>
                  <p class="text-xs text-[var(--cs-text-muted)]">{config.providerId}</p>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <form method="POST" action="?/togglePaymentProvider" use:enhance>
                  <input type="hidden" name="providerId" value={config.providerId} />
                  <input type="hidden" name="enabled" value={String(!config.enabled)} />
                  <button type="submit" class="rounded-full px-2.5 py-1 text-xs font-medium {config.enabled ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}">
                    {config.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </form>
                <form method="POST" action="?/removePaymentProvider" use:enhance>
                  <input type="hidden" name="providerId" value={config.providerId} />
                  <button type="submit" class="text-xs text-red-500 hover:text-red-700">Remove</button>
                </form>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
