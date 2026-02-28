<script lang="ts">
  import { Badge, EmptyState } from '$lib/components/ui';
  import { workspacePrefix } from '$lib/utils/workspace.js';

  let { data } = $props();

  const statusFilters = [
    { value: '', label: 'All' },
    { value: 'draft', label: 'Draft' },
    { value: 'open', label: 'Open' },
    { value: 'active', label: 'Active' },
    { value: 'terminated', label: 'Terminated' },
    { value: 'voided', label: 'Voided' },
  ];

  function statusToVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
    switch (status) {
      case 'active': return 'success';
      case 'open': return 'warning';
      case 'terminated': case 'voided': return 'danger';
      case 'amended': return 'warning';
      default: return 'default';
    }
  }
</script>

<svelte:head>
  <title>Network Agreements — Co-op Source</title>
</svelte:head>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">Agreements</h1>
  </div>

  <!-- Status filter tabs -->
  <div class="flex gap-1 border-b border-[var(--cs-border)]">
    {#each statusFilters as filter}
      <a
        href={filter.value ? `?status=${filter.value}` : `${$workspacePrefix}/agreements`}
        class="px-3 py-2 text-sm font-medium transition-colors
          {data.filterStatus === filter.value
            ? 'border-b-2 border-[var(--cs-primary)] text-[var(--cs-primary)]'
            : 'text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)]'}"
      >
        {filter.label}
      </a>
    {/each}
  </div>

  {#if data.agreements.length === 0}
    <EmptyState
      title="No agreements"
      description="No agreements have been created yet."
    />
  {:else}
    <div class="space-y-2">
      {#each data.agreements as agreement}
        <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <h3 class="font-medium text-[var(--cs-text)]">{agreement.title}</h3>
              {#if agreement.purpose}
                <p class="mt-1 line-clamp-2 text-sm text-[var(--cs-text-muted)]">{agreement.purpose}</p>
              {:else if agreement.body}
                <p class="mt-1 line-clamp-2 text-sm text-[var(--cs-text-muted)]">{agreement.body}</p>
              {/if}
              <div class="mt-2 flex items-center gap-3 text-xs text-[var(--cs-text-muted)]">
                <span>{agreement.agreementType}</span>
                <span>v{agreement.version}</span>
                <span>by {agreement.authorDisplayName}</span>
                <span>{new Date(agreement.createdAt).toLocaleDateString()}</span>
                {#if agreement.signatureCount > 0}
                  <span class="text-green-600">{agreement.signatureCount} signature{agreement.signatureCount !== 1 ? 's' : ''}</span>
                {/if}
              </div>
            </div>
            <Badge variant={statusToVariant(agreement.status)} class="shrink-0">{agreement.status}</Badge>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
