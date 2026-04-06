<script lang="ts">
  import { Badge, EmptyState } from '$lib/components/ui';
  import Tag from '@lucide/svelte/icons/tag';
  import Hash from '@lucide/svelte/icons/hash';

  let { data } = $props();

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString();
  }

  function labelVariant(value: string): 'success' | 'warning' | 'danger' | 'default' | 'primary' {
    switch (value) {
      case 'proposal-approved': case 'agreement-ratified': return 'success';
      case 'proposal-active': return 'primary';
      case 'proposal-rejected': case 'member-suspended': return 'danger';
      case 'proposal-archived': return 'warning';
      default: return 'default';
    }
  }
</script>

<svelte:head>
  <title>Labels -- Co-op Source</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex items-center gap-2">
    <Tag class="h-5 w-5 text-[var(--cs-text-secondary)]" />
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">Governance Labels</h1>
  </div>

  <!-- Summary Cards -->
  <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-3">
      <div class="text-xs text-[var(--cs-text-muted)]">Active Proposals</div>
      <div class="mt-1 text-lg font-semibold text-[var(--cs-text)]">{data.counts.active}</div>
    </div>
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-3">
      <div class="text-xs text-[var(--cs-text-muted)]">Approved</div>
      <div class="mt-1 text-lg font-semibold text-green-600">{data.counts.approved}</div>
    </div>
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-3">
      <div class="text-xs text-[var(--cs-text-muted)]">Rejected</div>
      <div class="mt-1 text-lg font-semibold text-red-600">{data.counts.rejected}</div>
    </div>
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-3">
      <div class="text-xs text-[var(--cs-text-muted)]">Archived</div>
      <div class="mt-1 text-lg font-semibold text-[var(--cs-text-muted)]">{data.counts.archived}</div>
    </div>
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-3">
      <div class="text-xs text-[var(--cs-text-muted)]">Suspended</div>
      <div class="mt-1 text-lg font-semibold text-red-600">{data.counts.suspended}</div>
    </div>
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-3">
      <div class="text-xs text-[var(--cs-text-muted)]">Ratified</div>
      <div class="mt-1 text-lg font-semibold text-green-600">{data.counts.ratified}</div>
    </div>
  </div>

  <!-- Labels Table -->
  {#if data.labels.length === 0}
    <EmptyState
      icon={Tag}
      title="No labels yet"
      description="Governance labels will appear here when proposals are resolved or members are suspended."
    />
  {:else}
    <div class="overflow-x-auto rounded-lg border border-[var(--cs-border)]">
      <table class="min-w-full divide-y divide-[var(--cs-border)]">
        <thead class="bg-[var(--cs-bg-card)]">
          <tr>
            <th class="px-4 py-2 text-left text-xs font-medium text-[var(--cs-text-muted)]">
              <div class="flex items-center gap-1"><Hash class="h-3 w-3" /> Seq</div>
            </th>
            <th class="px-4 py-2 text-left text-xs font-medium text-[var(--cs-text-muted)]">Label</th>
            <th class="px-4 py-2 text-left text-xs font-medium text-[var(--cs-text-muted)]">Subject</th>
            <th class="px-4 py-2 text-left text-xs font-medium text-[var(--cs-text-muted)]">Neg</th>
            <th class="px-4 py-2 text-left text-xs font-medium text-[var(--cs-text-muted)]">Created</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--cs-border)] bg-[var(--cs-bg)]">
          {#each data.labels as label}
            <tr>
              <td class="px-4 py-2 text-xs font-mono text-[var(--cs-text-muted)]">{label.seq}</td>
              <td class="px-4 py-2"><Badge variant={labelVariant(label.labelValue)}>{label.labelValue}</Badge></td>
              <td class="px-4 py-2 text-xs font-mono text-[var(--cs-text)] max-w-xs truncate">{label.subjectUri}</td>
              <td class="px-4 py-2">{#if label.neg}<Badge variant="danger">neg</Badge>{/if}</td>
              <td class="px-4 py-2 text-xs text-[var(--cs-text-muted)]">{formatDate(label.createdAt)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
