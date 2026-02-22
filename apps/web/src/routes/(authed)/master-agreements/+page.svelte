<script lang="ts">
  import { Badge, EmptyState } from '$lib/components/ui';

  let { data } = $props();

  const statusFilters = [
    { value: '', label: 'All' },
    { value: 'draft', label: 'Draft' },
    { value: 'active', label: 'Active' },
    { value: 'amended', label: 'Amended' },
    { value: 'terminated', label: 'Terminated' },
  ];

  function statusToVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
    switch (status) {
      case 'active': return 'success';
      case 'draft': return 'default';
      case 'amended': return 'warning';
      case 'terminated': return 'danger';
      default: return 'default';
    }
  }
</script>

<svelte:head>
  <title>Master Agreements — Co-op Source</title>
</svelte:head>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">Master Agreements</h1>
    <a
      href="/master-agreements/new"
      class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
    >
      New master agreement
    </a>
  </div>

  <!-- Status filter tabs -->
  <div class="flex gap-1 border-b border-[var(--cs-border)]">
    {#each statusFilters as filter}
      <a
        href={filter.value ? `?status=${filter.value}` : '/master-agreements'}
        class="px-3 py-2 text-sm font-medium transition-colors
          {data.filterStatus === filter.value
            ? 'border-b-2 border-blue-600 text-blue-600'
            : 'text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)]'}"
      >
        {filter.label}
      </a>
    {/each}
  </div>

  {#if data.masterAgreements.length === 0}
    <EmptyState
      title="No master agreements"
      description="Create your first master agreement to define multi-party stakeholder terms."
    />
  {:else}
    <div class="space-y-2">
      {#each data.masterAgreements as agreement}
        <a
          href="/master-agreements/{encodeURIComponent(agreement.uri)}"
          class="block rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4 hover:border-[var(--cs-border-hover)] hover:shadow-sm"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <h3 class="font-medium text-[var(--cs-text)]">{agreement.title}</h3>
              {#if agreement.purpose}
                <p class="mt-1 line-clamp-2 text-sm text-[var(--cs-text-muted)]">{agreement.purpose}</p>
              {/if}
              <div class="mt-2 flex items-center gap-3 text-xs text-[var(--cs-text-muted)]">
                <span>{agreement.agreementType}</span>
                <span>v{agreement.version}</span>
                <span>{new Date(agreement.createdAt).toLocaleDateString()}</span>
                {#if agreement.effectiveDate}
                  <span class="text-green-600">Effective {new Date(agreement.effectiveDate).toLocaleDateString()}</span>
                {/if}
              </div>
            </div>
            <Badge variant={statusToVariant(agreement.status)} class="shrink-0">{agreement.status}</Badge>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
