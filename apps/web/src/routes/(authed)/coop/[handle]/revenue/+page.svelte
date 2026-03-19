<script lang="ts">
  import { enhance } from '$app/forms';
  import { EmptyState, Modal } from '$lib/components/ui';
  import { workspacePrefix } from '$lib/utils/workspace.js';
  import type { RevenueEntry } from '$lib/api/types.js';

  let { data, form } = $props();

  let showCreateForm = $state(false);
  let submitting = $state(false);

  $effect(() => {
    if (form?.success) {
      showCreateForm = false;
    }
  });

  function formatCurrency(amount: number, currency: string = 'USD'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  }

  let totalRevenue = $derived(
    data.entries.reduce((sum: number, e: RevenueEntry) => sum + e.amount, 0),
  );

  // Group summary by project for display
  let projectSummary = $derived(
    data.summary.map((item: { projectId: string | null; totalAmount: number; count: number }) => ({
      label: item.projectId ?? 'Unassigned',
      totalAmount: item.totalAmount,
      count: item.count,
    })),
  );

  // Gather unique sources for filter
  let uniqueSources = $derived(
    [...new Set(data.entries.map((e: RevenueEntry) => e.source).filter(Boolean))] as string[],
  );
</script>

<svelte:head>
  <title>Revenue — Co-op Source</title>
</svelte:head>

<div class="space-y-4">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-xl font-semibold text-[var(--cs-text)]">Revenue</h1>
      <p class="text-sm text-[var(--cs-text-muted)]">Total: {formatCurrency(totalRevenue)}</p>
    </div>
    <button
      type="button"
      onclick={() => (showCreateForm = true)}
      class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]"
    >Record Revenue</button>
  </div>

  {#if form?.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}

  <!-- Summary Cards -->
  <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
    <!-- Total Revenue Card -->
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4">
      <p class="text-xs font-medium uppercase tracking-wide text-[var(--cs-text-muted)]">Total Revenue (YTD)</p>
      <p class="mt-2 text-2xl font-semibold text-[var(--cs-text)]">{formatCurrency(totalRevenue)}</p>
      <p class="mt-1 text-xs text-[var(--cs-text-muted)]">{data.entries.length} entries</p>
    </div>

    <!-- Revenue by Project -->
    {#each projectSummary.slice(0, 2) as project}
      <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4">
        <p class="text-xs font-medium uppercase tracking-wide text-[var(--cs-text-muted)] truncate">{project.label}</p>
        <p class="mt-2 text-2xl font-semibold text-[var(--cs-text)]">{formatCurrency(project.totalAmount)}</p>
        <p class="mt-1 text-xs text-[var(--cs-text-muted)]">{project.count} entries</p>
      </div>
    {/each}
  </div>

  <!-- Source Filter -->
  {#if uniqueSources.length > 0}
    <div class="flex gap-1">
      <a
        href="{$workspacePrefix}/revenue"
        class="px-3 py-1.5 text-xs font-medium rounded-full transition-colors
          {data.filterSource === ''
            ? 'bg-[var(--cs-primary)] text-[var(--cs-text-on-primary)]'
            : 'bg-[var(--cs-bg-inset)] text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)]'}"
      >All Sources</a>
      {#each uniqueSources as source}
        <a
          href="{$workspacePrefix}/revenue?source={encodeURIComponent(source)}"
          class="px-3 py-1.5 text-xs font-medium rounded-full transition-colors
            {data.filterSource === source
              ? 'bg-[var(--cs-primary)] text-[var(--cs-text-on-primary)]'
              : 'bg-[var(--cs-bg-inset)] text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)]'}"
        >{source}</a>
      {/each}
    </div>
  {/if}

  <!-- Revenue Entries List -->
  {#if data.entries.length === 0}
    <EmptyState title="No revenue recorded" description="Record your first revenue entry." />
  {:else}
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-[var(--cs-border)] text-left">
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Title</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Amount</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Source</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Period</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Date</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--cs-border)]">
          {#each data.entries as entry (entry.id)}
            <tr class="hover:bg-[var(--cs-bg-inset)] transition-colors">
              <td class="px-4 py-3">
                <div>
                  <span class="font-medium text-[var(--cs-text)]">{entry.title}</span>
                  {#if entry.description}
                    <p class="mt-0.5 text-xs text-[var(--cs-text-muted)] line-clamp-1">{entry.description}</p>
                  {/if}
                </div>
              </td>
              <td class="px-4 py-3 font-medium text-green-600">
                {formatCurrency(entry.amount, entry.currency)}
              </td>
              <td class="px-4 py-3">
                {#if entry.source}
                  <span class="rounded bg-[var(--cs-bg-inset)] px-1.5 py-0.5 text-xs text-[var(--cs-text-secondary)]">{entry.source}</span>
                {:else}
                  <span class="text-[var(--cs-text-muted)]">—</span>
                {/if}
              </td>
              <td class="px-4 py-3 text-xs text-[var(--cs-text-muted)]">
                {#if entry.periodStart && entry.periodEnd}
                  {new Date(entry.periodStart).toLocaleDateString()} – {new Date(entry.periodEnd).toLocaleDateString()}
                {:else}
                  —
                {/if}
              </td>
              <td class="px-4 py-3 text-[var(--cs-text-muted)]">
                {new Date(entry.recordedAt).toLocaleDateString()}
              </td>
              <td class="px-4 py-3 text-right">
                <form method="POST" action="?/deleteEntry" use:enhance class="inline">
                  <input type="hidden" name="id" value={entry.id} />
                  <button type="submit" class="text-xs text-red-600 hover:underline">Delete</button>
                </form>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<!-- Record Revenue Modal -->
<Modal open={showCreateForm} title="Record Revenue" onclose={() => (showCreateForm = false)}>
  <form
    method="POST"
    action="?/recordRevenue"
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
      <label for="rev-title" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Title</label>
      <input
        id="rev-title"
        name="title"
        type="text"
        required
        placeholder="Revenue description..."
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      />
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="rev-amount" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Amount</label>
        <input
          id="rev-amount"
          name="amount"
          type="number"
          step="0.01"
          min="0.01"
          required
          placeholder="0.00"
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        />
      </div>
      <div>
        <label for="rev-source" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Source</label>
        <input
          id="rev-source"
          name="source"
          type="text"
          placeholder="e.g., Client, Grant, Sales"
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        />
      </div>
    </div>

    <div>
      <label for="rev-desc" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Description</label>
      <textarea
        id="rev-desc"
        name="description"
        rows="2"
        placeholder="Optional details..."
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      ></textarea>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="rev-period-start" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Period Start</label>
        <input
          id="rev-period-start"
          name="periodStart"
          type="date"
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        />
      </div>
      <div>
        <label for="rev-period-end" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Period End</label>
        <input
          id="rev-period-end"
          name="periodEnd"
          type="date"
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        />
      </div>
    </div>

    <div class="flex justify-end gap-3">
      <button
        type="button"
        onclick={() => (showCreateForm = false)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
      >Cancel</button>
      <button
        type="submit"
        disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50"
      >{submitting ? 'Saving...' : 'Record Revenue'}</button>
    </div>
  </form>
</Modal>
