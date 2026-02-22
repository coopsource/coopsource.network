<script lang="ts">
  import { Badge, EmptyState } from '$lib/components/ui';

  let { data } = $props();

  const networks = $derived(data.networks);

  function coopTypeVariant(cooperativeType: string): 'default' | 'primary' | 'success' | 'warning' {
    switch (cooperativeType) {
      case 'worker': return 'primary';
      case 'consumer': return 'success';
      case 'producer': return 'warning';
      default: return 'default';
    }
  }
</script>

<svelte:head>
  <title>Networks — Co-op Source</title>
</svelte:head>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">Networks</h1>
    <a
      href="/networks/new"
      class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
    >
      Create network
    </a>
  </div>

  {#if networks.length === 0}
    <EmptyState
      title="No networks"
      description="Create or join a network to collaborate with other cooperatives."
    />
  {:else}
    <div class="space-y-2">
      {#each networks as network}
        <a
          href="/networks/{encodeURIComponent(network.did)}"
          class="block rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4 hover:border-[var(--cs-border-hover)] hover:shadow-sm"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <h3 class="font-medium text-[var(--cs-text)]">
                {network.displayName}
              </h3>
              {#if network.description}
                <p class="mt-1 text-sm text-[var(--cs-text-secondary)] line-clamp-2">
                  {network.description}
                </p>
              {/if}
              <p class="mt-2 text-xs text-[var(--cs-text-muted)]">
                {network.memberCount} member{network.memberCount !== 1 ? 's' : ''}
              </p>
            </div>
            <Badge variant={coopTypeVariant(network.cooperativeType)} class="shrink-0">
              {network.cooperativeType}
            </Badge>
          </div>
        </a>
      {/each}
    </div>
  {/if}

  {#if data.cursor}
    <div class="flex justify-center pt-2">
      <a
        href="?cursor={data.cursor}"
        class="rounded-md border border-[var(--cs-border)] px-4 py-2 text-sm font-medium text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
      >
        Load more
      </a>
    </div>
  {/if}
</div>
