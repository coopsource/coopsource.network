<script lang="ts">
  import { enhance } from '$app/forms';
  import { Badge, EmptyState, Modal } from '$lib/components/ui';
  import type { ConnectorConfig, WebhookEndpoint, EventCatalogEntry } from '$lib/api/types.js';

  let { data, form } = $props();

  let showConnectorForm = $state(false);
  let showWebhookForm = $state(false);
  let showEventCatalog = $state(false);
  let submitting = $state(false);
  let activeTab = $state<'connectors' | 'webhooks'>('connectors');

  $effect(() => {
    if (form?.success) {
      showConnectorForm = false;
      showWebhookForm = false;
    }
  });

  const connectorTypes = [
    { value: 'open_collective', label: 'Open Collective', description: 'Sync financial data from Open Collective' },
    { value: 'loomio', label: 'Loomio', description: 'Sync governance decisions from Loomio' },
    { value: 'github', label: 'GitHub', description: 'Sync repository activity from GitHub' },
    { value: 'discord', label: 'Discord', description: 'Notify a Discord channel of cooperative events' },
    { value: 'matrix', label: 'Matrix', description: 'Bridge with Matrix chat rooms' },
    { value: 'csv_import', label: 'CSV Import', description: 'Import data from CSV files' },
  ];

  function getConnectorLabel(connectorType: string): string {
    return connectorTypes.find((c) => c.value === connectorType)?.label ?? connectorType;
  }
</script>

<svelte:head>
  <title>Integrations — Co-op Source</title>
</svelte:head>

<div class="space-y-4">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-xl font-semibold text-[var(--cs-text)]">Integrations</h1>
      <p class="text-sm text-[var(--cs-text-muted)]">Connect external services and configure webhooks.</p>
    </div>
    <div class="flex gap-2">
      <button
        type="button"
        onclick={() => (showEventCatalog = true)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
      >Event Catalog</button>
      {#if activeTab === 'connectors'}
        <button
          type="button"
          onclick={() => (showConnectorForm = true)}
          class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]"
        >Add Connector</button>
      {:else}
        <button
          type="button"
          onclick={() => (showWebhookForm = true)}
          class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]"
        >Add Webhook</button>
      {/if}
    </div>
  </div>

  {#if form?.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}

  <!-- Tab Toggle -->
  <div class="flex rounded-md border border-[var(--cs-border)] bg-[var(--cs-bg-card)] w-fit">
    <button
      type="button"
      onclick={() => (activeTab = 'connectors')}
      class="px-4 py-1.5 text-sm font-medium transition-colors {activeTab === 'connectors' ? 'bg-[var(--cs-primary)] text-[var(--cs-text-on-primary)]' : 'text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)]'} rounded-l-md"
    >Connectors ({data.connectors.length})</button>
    <button
      type="button"
      onclick={() => (activeTab = 'webhooks')}
      class="px-4 py-1.5 text-sm font-medium transition-colors {activeTab === 'webhooks' ? 'bg-[var(--cs-primary)] text-[var(--cs-text-on-primary)]' : 'text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)]'} rounded-r-md"
    >Webhooks ({data.webhooks.length})</button>
  </div>

  <!-- Connectors Tab -->
  {#if activeTab === 'connectors'}
    {#if data.connectors.length === 0}
      <EmptyState title="No connectors configured" description="Add a connector to sync data with external services." />
    {:else}
      <div class="space-y-3">
        {#each data.connectors as connector (connector.id)}
          <div class="flex items-center justify-between rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <h3 class="font-medium text-[var(--cs-text)]">{connector.displayName}</h3>
                <Badge variant={connector.enabled ? 'success' : 'default'}>{connector.enabled ? 'Enabled' : 'Disabled'}</Badge>
              </div>
              <div class="mt-1 flex items-center gap-3 text-xs text-[var(--cs-text-muted)]">
                <span class="rounded bg-[var(--cs-bg-inset)] px-1.5 py-0.5">{getConnectorLabel(connector.connectorType)}</span>
                {#if connector.lastSyncAt}
                  <span>Last sync: {new Date(connector.lastSyncAt).toLocaleString()}</span>
                {:else}
                  <span>Never synced</span>
                {/if}
              </div>
            </div>
            <form method="POST" action="?/deleteConnector" use:enhance class="inline">
              <input type="hidden" name="id" value={connector.id} />
              <button type="submit" class="text-xs text-red-600 hover:underline">Remove</button>
            </form>
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  <!-- Webhooks Tab -->
  {#if activeTab === 'webhooks'}
    {#if data.webhooks.length === 0}
      <EmptyState title="No webhooks configured" description="Add a webhook to receive event notifications." />
    {:else}
      <div class="space-y-3">
        {#each data.webhooks as webhook (webhook.id)}
          <div class="flex items-center justify-between rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <h3 class="font-medium text-[var(--cs-text)] truncate">{webhook.url}</h3>
                <Badge variant={webhook.enabled ? 'success' : 'default'}>{webhook.enabled ? 'Active' : 'Paused'}</Badge>
              </div>
              <div class="mt-1 flex flex-wrap gap-1">
                {#each webhook.eventTypes as eventType}
                  <span class="rounded bg-[var(--cs-bg-inset)] px-1.5 py-0.5 text-[10px] text-[var(--cs-text-muted)]">{eventType}</span>
                {/each}
              </div>
            </div>
            <form method="POST" action="?/deleteWebhook" use:enhance class="inline ml-3">
              <input type="hidden" name="id" value={webhook.id} />
              <button type="submit" class="text-xs text-red-600 hover:underline">Remove</button>
            </form>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<!-- Add Connector Modal -->
<Modal open={showConnectorForm} title="Add Connector" onclose={() => (showConnectorForm = false)}>
  <form
    method="POST"
    action="?/createConnector"
    use:enhance={() => {
      submitting = true;
      return async ({ update }) => {
        submitting = false;
        await update();
      };
    }}
    class="space-y-4"
  >
    <div>
      <label for="conn-type" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Connector Type</label>
      <select
        id="conn-type"
        name="connectorType"
        required
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      >
        {#each connectorTypes as ct}
          <option value={ct.value}>{ct.label} — {ct.description}</option>
        {/each}
      </select>
    </div>

    <div>
      <label for="conn-name" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Display Name</label>
      <input
        id="conn-name"
        name="displayName"
        type="text"
        required
        placeholder="My Open Collective sync"
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      />
    </div>

    <div class="flex justify-end gap-3">
      <button
        type="button"
        onclick={() => (showConnectorForm = false)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
      >Cancel</button>
      <button
        type="submit"
        disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50"
      >{submitting ? 'Adding...' : 'Add Connector'}</button>
    </div>
  </form>
</Modal>

<!-- Add Webhook Modal -->
<Modal open={showWebhookForm} title="Add Webhook" onclose={() => (showWebhookForm = false)}>
  <form
    method="POST"
    action="?/createWebhook"
    use:enhance={() => {
      submitting = true;
      return async ({ update }) => {
        submitting = false;
        await update();
      };
    }}
    class="space-y-4"
  >
    <div>
      <label for="wh-url" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Endpoint URL</label>
      <input
        id="wh-url"
        name="url"
        type="url"
        required
        placeholder="https://example.com/webhook"
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      />
    </div>

    <div>
      <label for="wh-secret" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Secret</label>
      <input
        id="wh-secret"
        name="secret"
        type="password"
        required
        placeholder="Signing secret for verification"
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      />
    </div>

    <div>
      <label for="wh-events" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Event Types</label>
      <input
        id="wh-events"
        name="eventTypes"
        type="text"
        required
        placeholder="membership.created, proposal.resolved"
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      />
      <p class="mt-1 text-xs text-[var(--cs-text-muted)]">Comma-separated event types. See the Event Catalog for available types.</p>
    </div>

    <div class="flex justify-end gap-3">
      <button
        type="button"
        onclick={() => (showWebhookForm = false)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
      >Cancel</button>
      <button
        type="submit"
        disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50"
      >{submitting ? 'Adding...' : 'Add Webhook'}</button>
    </div>
  </form>
</Modal>

<!-- Event Catalog Modal -->
<Modal open={showEventCatalog} title="Event Catalog" onclose={() => (showEventCatalog = false)}>
  <div class="max-h-96 overflow-y-auto">
    {#if data.eventCatalog.length === 0}
      <p class="text-sm text-[var(--cs-text-muted)]">No events available yet.</p>
    {:else}
      <div class="space-y-2">
        {#each data.eventCatalog as event}
          <div class="rounded-md border border-[var(--cs-border)] p-3">
            <code class="text-xs font-medium text-[var(--cs-primary)]">{event.type}</code>
            <p class="mt-0.5 text-sm text-[var(--cs-text-secondary)]">{event.description}</p>
          </div>
        {/each}
      </div>
    {/if}
  </div>
  <div class="mt-4 flex justify-end">
    <button
      type="button"
      onclick={() => (showEventCatalog = false)}
      class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
    >Close</button>
  </div>
</Modal>
