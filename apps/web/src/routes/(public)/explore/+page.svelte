<script lang="ts">
  import { Badge, EmptyState } from '$lib/components/ui';
  import Globe from '@lucide/svelte/icons/globe';
  import Users from '@lucide/svelte/icons/users';
  import Search from '@lucide/svelte/icons/search';

  let { data } = $props();

  const cooperatives = $derived(data.cooperatives.cooperatives);
  const networks = $derived(data.networks.networks);
  const cursor = $derived(data.cooperatives.cursor);
  const q = $derived(data.q);

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
  <title>Explore Cooperatives — Co-op Source</title>
</svelte:head>

<div class="space-y-8">
  <!-- Header -->
  <div>
    <h1 class="text-2xl font-semibold text-[var(--cs-text)]">Discover Cooperatives</h1>
    <p class="mt-1 text-sm text-[var(--cs-text-secondary)]">
      Browse cooperatives and networks on the Co-op Source platform.
    </p>
  </div>

  <!-- V8.6: Search input. Plain GET form so it works without JS. -->
  <form method="GET" class="max-w-md">
    <div class="relative">
      <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--cs-text-muted)] pointer-events-none" />
      <input
        type="search"
        name="q"
        value={q}
        placeholder="Search cooperatives..."
        class="w-full rounded-md border border-[var(--cs-border)] bg-[var(--cs-bg-card)] pl-9 pr-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-primary)] focus:outline-none"
      />
    </div>
  </form>

  <!-- Networks section — hidden in search mode for visual focus -->
  {#if !q && networks.length > 0}
    <section>
      <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--cs-text-muted)]">
        Networks
      </h2>
      <div class="flex gap-3 overflow-x-auto pb-2">
        {#each networks as network}
          <div class="flex-shrink-0 rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4 w-64">
            <div class="flex items-start gap-2">
              <div class="rounded-md bg-[var(--cs-primary-soft)] p-1.5">
                <Globe class="h-4 w-4 text-[var(--cs-primary)]" />
              </div>
              <div class="min-w-0 flex-1">
                <h3 class="font-medium text-[var(--cs-text)] truncate">{network.displayName}</h3>
                {#if network.description}
                  <p class="mt-0.5 text-xs text-[var(--cs-text-secondary)] line-clamp-2">{network.description}</p>
                {/if}
                {#if network.memberCount !== null}
                  <p class="mt-1.5 text-xs text-[var(--cs-text-muted)]">
                    {network.memberCount} member{network.memberCount !== 1 ? 's' : ''}
                  </p>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <!-- Cooperatives grid -->
  <section>
    <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--cs-text-muted)]">
      {q ? `Search results for "${q}"` : 'Cooperatives'}
    </h2>

    {#if cooperatives.length === 0}
      {#if q}
        <EmptyState
          icon={Search}
          title="No cooperatives match your search"
          description={`Nothing found for "${q}". Try a different keyword.`}
        />
      {:else}
        <EmptyState
          icon={Users}
          title="No cooperatives yet"
          description="No cooperatives have been registered on this platform yet."
        />
      {/if}
    {:else}
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {#each cooperatives as coop}
          <a
            href="/explore/{coop.handle ?? encodeURIComponent(coop.did)}"
            class="block rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4 hover:border-[var(--cs-border-hover)] hover:shadow-sm cs-transition"
          >
            <div class="flex items-start justify-between gap-2">
              <h3 class="font-medium text-[var(--cs-text)] truncate">{coop.displayName}</h3>
              <Badge variant={coopTypeVariant(coop.cooperativeType)} class="shrink-0">
                {coop.cooperativeType}
              </Badge>
            </div>
            {#if coop.description}
              <p class="mt-1.5 text-sm text-[var(--cs-text-secondary)] line-clamp-2">
                {coop.description}
              </p>
            {/if}
            {#if coop.memberCount !== null}
              <div class="mt-3 flex items-center gap-1 text-xs text-[var(--cs-text-muted)]">
                <Users class="h-3.5 w-3.5" />
                {coop.memberCount} member{coop.memberCount !== 1 ? 's' : ''}
              </div>
            {/if}
          </a>
        {/each}
      </div>
    {/if}

    <!-- Pagination — preserves the search query when present -->
    {#if cursor}
      <div class="flex justify-center pt-4">
        <a
          href={q ? `?q=${encodeURIComponent(q)}&cursor=${cursor}` : `?cursor=${cursor}`}
          class="rounded-md border border-[var(--cs-border)] px-4 py-2 text-sm font-medium text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)] cs-transition"
        >
          Load more
        </a>
      </div>
    {/if}
  </section>
</div>
