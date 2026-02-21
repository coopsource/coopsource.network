<script lang="ts">
  import { Badge, EmptyState } from '$lib/components/ui';

  let { data } = $props();

  const statusFilters = [
    { value: '', label: 'All' },
    { value: 'draft', label: 'Draft' },
    { value: 'open', label: 'Open' },
    { value: 'closed', label: 'Closed' },
    { value: 'resolved', label: 'Resolved' },
  ];

  function statusToVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
    switch (status) {
      case 'active': case 'accepted': case 'resolved': case 'signed': return 'success';
      case 'pending': case 'open': case 'closed': return 'warning';
      case 'revoked': case 'void': case 'voided': return 'danger';
      default: return 'default';
    }
  }
</script>

<svelte:head>
  <title>Proposals — Co-op Source</title>
</svelte:head>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">Proposals</h1>
    <a
      href="/proposals/new"
      class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
    >
      New proposal
    </a>
  </div>

  <!-- Status filter tabs -->
  <div class="flex gap-1 border-b border-[var(--cs-border)]">
    {#each statusFilters as filter}
      <a
        href={filter.value ? `?status=${filter.value}` : '/proposals'}
        class="px-3 py-2 text-sm font-medium transition-colors
          {data.filterStatus === filter.value
            ? 'border-b-2 border-blue-600 text-blue-600'
            : 'text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)]'}"
      >
        {filter.label}
      </a>
    {/each}
  </div>

  {#if data.proposals.length === 0}
    <EmptyState
      title="No proposals"
      description="Create your first proposal to start a discussion."
    />
  {:else}
    <div class="space-y-2">
      {#each data.proposals as proposal}
        <a
          href="/proposals/{proposal.id}"
          class="block rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4 hover:border-[var(--cs-border-hover)] hover:shadow-sm"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <h3 class="font-medium text-[var(--cs-text)]">{proposal.title}</h3>
              <p class="mt-1 line-clamp-2 text-sm text-[var(--cs-text-muted)]">{proposal.body}</p>
              <p class="mt-2 text-xs text-[var(--cs-text-muted)]">
                {proposal.proposalType} · by {proposal.authorDisplayName} ·
                {new Date(proposal.createdAt).toLocaleDateString()}
              </p>
            </div>
            <Badge variant={statusToVariant(proposal.status)} class="shrink-0">{proposal.status}</Badge>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
