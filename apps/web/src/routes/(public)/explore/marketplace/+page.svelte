<script lang="ts">
  import { Badge, EmptyState } from '$lib/components/ui';
  import ShoppingBag from '@lucide/svelte/icons/shopping-bag';
  import MapPin from '@lucide/svelte/icons/map-pin';
  import Search from '@lucide/svelte/icons/search';
  import type { CommerceListing } from '$lib/api/types.js';

  let { data } = $props();

  let searchQuery = $state(data.filterQuery);

  const categoryFilters = [
    { value: '', label: 'All' },
    { value: 'goods', label: 'Goods' },
    { value: 'services', label: 'Services' },
    { value: 'expertise', label: 'Expertise' },
    { value: 'surplus', label: 'Surplus' },
  ];

  function availabilityVariant(availability: string): 'success' | 'warning' | 'danger' | 'default' {
    switch (availability) {
      case 'available': return 'success';
      case 'limited': return 'warning';
      case 'unavailable': return 'danger';
      default: return 'default';
    }
  }

  function categoryColor(category: string): string {
    switch (category) {
      case 'goods': return 'bg-blue-100 text-blue-700';
      case 'services': return 'bg-violet-100 text-violet-700';
      case 'expertise': return 'bg-emerald-100 text-emerald-700';
      case 'surplus': return 'bg-amber-100 text-amber-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  }

  function buildSearchUrl(overrides: { category?: string; q?: string } = {}): string {
    const params = new URLSearchParams();
    const cat = overrides.category ?? data.filterCategory;
    const q = overrides.q ?? data.filterQuery;
    if (cat) params.set('category', cat);
    if (data.filterLocation) params.set('location', data.filterLocation);
    if (q) params.set('q', q);
    return `/explore/marketplace${params.size ? `?${params}` : ''}`;
  }
</script>

<svelte:head>
  <title>Cooperative Marketplace — Co-op Source</title>
</svelte:head>

<div class="space-y-6">
  <!-- Header -->
  <div>
    <h1 class="text-2xl font-semibold text-[var(--cs-text)]">Cooperative Marketplace</h1>
    <p class="mt-1 text-sm text-[var(--cs-text-secondary)]">
      Discover products, services, and expertise offered by cooperatives.
    </p>
  </div>

  <!-- Search Bar -->
  <form action="/explore/marketplace" method="GET" class="flex gap-2">
    <div class="relative flex-1">
      <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cs-text-muted)]" />
      <input
        name="q"
        type="text"
        placeholder="Search listings..."
        bind:value={searchQuery}
        class="block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] pl-10 pr-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      />
    </div>
    {#if data.filterCategory}
      <input type="hidden" name="category" value={data.filterCategory} />
    {/if}
    {#if data.filterLocation}
      <input type="hidden" name="location" value={data.filterLocation} />
    {/if}
    <button
      type="submit"
      class="rounded-md bg-[var(--cs-primary)] px-4 py-2 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]"
    >Search</button>
  </form>

  <!-- Category Filters -->
  <div class="flex gap-1 flex-wrap">
    {#each categoryFilters as filter}
      <a
        href={buildSearchUrl({ category: filter.value })}
        class="px-3 py-1.5 text-xs font-medium rounded-full transition-colors
          {data.filterCategory === filter.value
            ? 'bg-[var(--cs-primary)] text-[var(--cs-text-on-primary)]'
            : 'bg-[var(--cs-bg-inset)] text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)]'}"
      >{filter.label}</a>
    {/each}
  </div>

  <!-- Listings Grid -->
  {#if data.listings.length === 0}
    <EmptyState
      icon={ShoppingBag}
      title="No listings found"
      description={data.filterQuery || data.filterCategory
        ? 'Try adjusting your search or filters.'
        : 'No cooperatives have published marketplace listings yet.'}
    />
  {:else}
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each data.listings as listing (listing.id)}
        <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4 hover:border-[var(--cs-border-hover)] hover:shadow-sm transition-shadow">
          <div class="flex items-start justify-between gap-2">
            <h3 class="font-medium text-[var(--cs-text)] truncate">{listing.title}</h3>
            <Badge variant={availabilityVariant(listing.availability)}>{listing.availability}</Badge>
          </div>

          {#if listing.description}
            <p class="mt-1.5 text-sm text-[var(--cs-text-secondary)] line-clamp-3">{listing.description}</p>
          {/if}

          <div class="mt-3 flex flex-wrap items-center gap-1.5">
            <span class="rounded-full px-2 py-0.5 text-[10px] font-medium {categoryColor(listing.category)}">{listing.category}</span>
            {#if listing.cooperativeType}
              <span class="rounded-full bg-[var(--cs-bg-inset)] px-2 py-0.5 text-[10px] text-[var(--cs-text-muted)]">{listing.cooperativeType} co-op</span>
            {/if}
            {#each listing.tags.slice(0, 3) as tag}
              <span class="rounded-full bg-[var(--cs-bg-inset)] px-2 py-0.5 text-[10px] text-[var(--cs-text-muted)]">{tag}</span>
            {/each}
            {#if listing.tags.length > 3}
              <span class="text-[10px] text-[var(--cs-text-muted)]">+{listing.tags.length - 3} more</span>
            {/if}
          </div>

          {#if listing.location}
            <div class="mt-2 flex items-center gap-1 text-xs text-[var(--cs-text-muted)]">
              <MapPin class="h-3 w-3" />
              {listing.location}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- Pagination -->
  {#if data.cursor}
    <div class="flex justify-center pt-4">
      <a
        href="/explore/marketplace?cursor={data.cursor}{data.filterCategory ? `&category=${data.filterCategory}` : ''}{data.filterQuery ? `&q=${encodeURIComponent(data.filterQuery)}` : ''}{data.filterLocation ? `&location=${encodeURIComponent(data.filterLocation)}` : ''}"
        class="rounded-md border border-[var(--cs-border)] px-4 py-2 text-sm font-medium text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)] cs-transition"
      >
        Load more
      </a>
    </div>
  {/if}
</div>
