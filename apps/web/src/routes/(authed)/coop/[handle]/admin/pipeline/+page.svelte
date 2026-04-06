<script lang="ts">
  import { enhance } from '$app/forms';
  import { Badge, EmptyState, Tabs } from '$lib/components/ui';
  import Activity from '@lucide/svelte/icons/activity';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
  import Clock from '@lucide/svelte/icons/clock';
  import Hash from '@lucide/svelte/icons/hash';

  let { data, form } = $props();
  let activeTab = $state('hooks');
  let submitting = $state(false);

  const tabs = [
    { id: 'hooks', label: 'Hooks', count: data.hooks.length },
    { id: 'dead-letters', label: 'Dead Letters', count: data.deadLetters.length },
  ];

  function sourceVariant(source: string): 'default' | 'primary' | 'warning' {
    switch (source) {
      case 'builtin': return 'default';
      case 'declarative': return 'primary';
      case 'script': return 'warning';
      default: return 'default';
    }
  }

  function formatDate(iso: string | null): string {
    if (!iso) return 'Never';
    return new Date(iso).toLocaleString();
  }

  $effect(() => {
    if (form?.success) {
      submitting = false;
    }
  });
</script>

<svelte:head>
  <title>Pipeline -- Co-op Source</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <Activity class="h-5 w-5 text-[var(--cs-text-secondary)]" />
      <h1 class="text-xl font-semibold text-[var(--cs-text)]">Pipeline</h1>
    </div>
  </div>

  {#if form?.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}

  <!-- Health Card -->
  <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4">
    <h2 class="text-sm font-medium text-[var(--cs-text-secondary)] mb-3">Pipeline Health</h2>
    <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
      <div>
        <div class="text-xs text-[var(--cs-text-muted)]">Mode</div>
        <div class="mt-1 text-sm font-medium text-[var(--cs-text)]">{data.health.mode}</div>
      </div>
      <div>
        <div class="flex items-center gap-1 text-xs text-[var(--cs-text-muted)]">
          <Hash class="h-3 w-3" />
          Last Seq
        </div>
        <div class="mt-1 text-sm font-medium text-[var(--cs-text)]">{data.health.lastSeq}</div>
      </div>
      <div>
        <div class="flex items-center gap-1 text-xs text-[var(--cs-text-muted)]">
          <Clock class="h-3 w-3" />
          Last Event
        </div>
        <div class="mt-1 text-sm font-medium text-[var(--cs-text)]">
          {formatDate(data.health.lastEventAt)}
        </div>
      </div>
      <div>
        <div class="flex items-center gap-1 text-xs text-[var(--cs-text-muted)]">
          <AlertTriangle class="h-3 w-3" />
          Errors
        </div>
        <div class="mt-1 text-sm font-medium {data.health.errorCount > 0 ? 'text-red-600' : 'text-[var(--cs-text)]'}">
          {data.health.errorCount}
        </div>
      </div>
      <div>
        <div class="text-xs text-[var(--cs-text-muted)]">Validation Warnings</div>
        <div class="mt-1 text-sm font-medium {data.health.validationWarnings > 0 ? 'text-amber-600' : 'text-[var(--cs-text)]'}">
          {data.health.validationWarnings}
        </div>
      </div>
    </div>
    <div class="mt-3 text-xs text-[var(--cs-text-muted)]">
      Started at {formatDate(data.health.startedAt)}
    </div>
  </div>

  <Tabs {tabs} bind:active={activeTab} />

  <!-- Hooks Tab -->
  {#if activeTab === 'hooks'}
    {#if data.hooks.length === 0}
      <EmptyState title="No hooks registered" description="Pipeline hooks will appear here when configured." />
    {:else}
      <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-[var(--cs-border)] text-left">
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Name</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Phase</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Source</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Collections</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Priority</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[var(--cs-border)]">
            {#each data.hooks as hook}
              <tr>
                <td class="px-4 py-3 font-medium text-[var(--cs-text)]">{hook.name}</td>
                <td class="px-4 py-3">
                  <span class="rounded bg-[var(--cs-bg-inset)] px-1.5 py-0.5 text-xs text-[var(--cs-text-secondary)]">
                    {hook.phase}
                  </span>
                </td>
                <td class="px-4 py-3">
                  <Badge variant={sourceVariant(hook.source)}>{hook.source}</Badge>
                </td>
                <td class="px-4 py-3 text-[var(--cs-text-secondary)]">
                  {#if hook.collections.length === 0}
                    <span class="text-[var(--cs-text-muted)]">all</span>
                  {:else}
                    <span class="text-xs">{hook.collections.join(', ')}</span>
                  {/if}
                </td>
                <td class="px-4 py-3 text-[var(--cs-text-muted)]">{hook.priority}</td>
                <td class="px-4 py-3">
                  <Badge variant={hook.enabled ? 'success' : 'default'}>
                    {hook.enabled ? 'enabled' : 'disabled'}
                  </Badge>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}

  <!-- Dead Letters Tab -->
  {#if activeTab === 'dead-letters'}
    {#if data.deadLetters.length === 0}
      <EmptyState title="No dead letters" description="Failed pipeline events will appear here for manual resolution." />
    {:else}
      <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-[var(--cs-border)] text-left">
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Event URI</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Collection</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Hook</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Error</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Created</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[var(--cs-border)]">
            {#each data.deadLetters as entry}
              <tr>
                <td class="px-4 py-3 font-mono text-xs text-[var(--cs-text)] max-w-[200px] truncate" title={entry.event_uri}>
                  {entry.event_uri}
                </td>
                <td class="px-4 py-3 text-[var(--cs-text-secondary)]">
                  <span class="text-xs">{entry.collection}</span>
                </td>
                <td class="px-4 py-3 text-[var(--cs-text-muted)] text-xs">{entry.hook_id}</td>
                <td class="px-4 py-3 text-red-600 text-xs max-w-[250px] truncate" title={entry.error_message}>
                  {entry.error_message}
                </td>
                <td class="px-4 py-3 text-[var(--cs-text-muted)] text-xs">
                  {formatDate(entry.created_at)}
                </td>
                <td class="px-4 py-3 text-right">
                  <form method="POST" action="?/resolve"
                    use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }}>
                    <input type="hidden" name="id" value={entry.id} />
                    <button type="submit" disabled={submitting}
                      class="text-xs text-[var(--cs-primary)] hover:underline disabled:opacity-50">
                      Resolve
                    </button>
                  </form>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if data.deadLetterCursor}
        <div class="flex justify-center pt-2">
          <a href="?deadLetterCursor={data.deadLetterCursor}" class="text-sm text-[var(--cs-primary)] hover:underline">Load more</a>
        </div>
      {/if}
    {/if}
  {/if}
</div>
