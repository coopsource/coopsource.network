<script lang="ts">
  import { enhance } from '$app/forms';
  import { Badge, EmptyState, Modal } from '$lib/components/ui';
  import { workspacePrefix } from '$lib/utils/workspace.js';
  import { canEditCommerceListing } from '$lib/utils/entity-permissions.js';
  import type { CommerceListing } from '$lib/api/types.js';

  let { data, form } = $props();

  let showCreateForm = $state(false);
  let editingListing = $state<CommerceListing | null>(null);
  let submitting = $state(false);

  $effect(() => {
    if (form?.success) {
      showCreateForm = false;
      editingListing = null;
    }
  });

  const categoryFilters = [
    { value: '', label: 'All Categories' },
    { value: 'goods', label: 'Goods' },
    { value: 'services', label: 'Services' },
    { value: 'expertise', label: 'Expertise' },
    { value: 'surplus', label: 'Surplus' },
  ];

  const statusFilters = [
    { value: '', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'paused', label: 'Paused' },
    { value: 'closed', label: 'Closed' },
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
</script>

<svelte:head>
  <title>Listings — Co-op Source</title>
</svelte:head>

<div class="space-y-4">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-xl font-semibold text-[var(--cs-text)]">Listings</h1>
      <p class="text-sm text-[var(--cs-text-muted)]">Products and services your cooperative offers.</p>
    </div>
    <button
      type="button"
      onclick={() => (showCreateForm = true)}
      class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]"
    >New Listing</button>
  </div>

  {#if form?.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}

  <!-- Filters -->
  <div class="flex gap-1 flex-wrap">
    {#each categoryFilters as filter}
      <a
        href={filter.value
          ? `${$workspacePrefix}/commerce/listings?category=${filter.value}${data.filterStatus ? `&status=${data.filterStatus}` : ''}`
          : `${$workspacePrefix}/commerce/listings${data.filterStatus ? `?status=${data.filterStatus}` : ''}`}
        class="px-3 py-1.5 text-xs font-medium rounded-full transition-colors
          {data.filterCategory === filter.value
            ? 'bg-[var(--cs-primary)] text-[var(--cs-text-on-primary)]'
            : 'bg-[var(--cs-bg-inset)] text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)]'}"
      >{filter.label}</a>
    {/each}
    <span class="border-l border-[var(--cs-border)] mx-1"></span>
    {#each statusFilters as filter}
      <a
        href={filter.value
          ? `${$workspacePrefix}/commerce/listings?status=${filter.value}${data.filterCategory ? `&category=${data.filterCategory}` : ''}`
          : `${$workspacePrefix}/commerce/listings${data.filterCategory ? `?category=${data.filterCategory}` : ''}`}
        class="px-3 py-1.5 text-xs font-medium rounded-full transition-colors
          {data.filterStatus === filter.value
            ? 'bg-[var(--cs-primary)] text-[var(--cs-text-on-primary)]'
            : 'bg-[var(--cs-bg-inset)] text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)]'}"
      >{filter.label}</a>
    {/each}
  </div>

  <!-- Listings Grid -->
  {#if data.listings.length === 0}
    <EmptyState title="No listings yet" description="Create your first listing to offer products or services to other cooperatives." />
  {:else}
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {#each data.listings as listing (listing.id)}
        <div class="group relative rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4 hover:border-[var(--cs-border-hover)] hover:shadow-sm transition-shadow">
          <div class="flex items-start justify-between gap-2">
            <h3 class="font-medium text-[var(--cs-text)] truncate">{listing.title}</h3>
            <Badge variant={availabilityVariant(listing.availability)}>{listing.availability}</Badge>
          </div>
          {#if listing.description}
            <p class="mt-1 text-sm text-[var(--cs-text-secondary)] line-clamp-2">{listing.description}</p>
          {/if}
          <div class="mt-3 flex flex-wrap items-center gap-1.5">
            <span class="rounded-full px-2 py-0.5 text-[10px] font-medium {categoryColor(listing.category)}">{listing.category}</span>
            {#each listing.tags as tag}
              <span class="rounded-full bg-[var(--cs-bg-inset)] px-2 py-0.5 text-[10px] text-[var(--cs-text-muted)]">{tag}</span>
            {/each}
          </div>
          <div class="mt-3 flex items-center justify-between">
            {#if listing.location}
              <span class="text-xs text-[var(--cs-text-muted)]">{listing.location}</span>
            {:else}
              <span></span>
            {/if}
            <div class="flex items-center gap-2">
              {#if canEditCommerceListing(listing)}
                <button
                  type="button"
                  onclick={() => { editingListing = listing; }}
                  class="text-xs text-[var(--cs-primary)] hover:underline"
                >Edit</button>
              {/if}
              <form method="POST" action="?/deleteListing" use:enhance class="inline">
                <input type="hidden" name="id" value={listing.id} />
                <button type="submit" class="text-xs text-red-600 hover:underline">Remove</button>
              </form>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Pagination -->
  {#if data.cursor}
    <div class="flex justify-center pt-2">
      <a
        href="{$workspacePrefix}/commerce/listings?cursor={data.cursor}{data.filterCategory ? `&category=${data.filterCategory}` : ''}{data.filterStatus ? `&status=${data.filterStatus}` : ''}"
        class="rounded-md border border-[var(--cs-border)] px-4 py-2 text-sm font-medium text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
      >Load more</a>
    </div>
  {/if}
</div>

<!-- Create / Edit Listing Modal -->
<Modal open={showCreateForm || editingListing !== null} title={editingListing ? 'Edit Listing' : 'New Listing'} onclose={() => { showCreateForm = false; editingListing = null; }}>
  {#key editingListing?.id ?? 'create'}
  <form
    method="POST"
    action={editingListing ? '?/updateListing' : '?/createListing'}
    use:enhance={() => {
      submitting = true;
      return async ({ update }) => {
        submitting = false;
        await update();
      };
    }}
    class="space-y-4"
  >
    {#if editingListing}<input type="hidden" name="id" value={editingListing.id} />{/if}

    <div>
      <label for="listing-title" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Title</label>
      <input
        id="listing-title"
        name="title"
        type="text"
        required
        value={editingListing?.title ?? ''}
        placeholder="What are you offering?"
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      />
    </div>

    <div>
      <label for="listing-description" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Description</label>
      <textarea
        id="listing-description"
        name="description"
        rows="3"
        placeholder="Describe the product or service..."
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      >{editingListing?.description ?? ''}</textarea>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="listing-category" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Category</label>
        <select
          id="listing-category"
          name="category"
          required
          value={editingListing?.category ?? 'goods'}
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        >
          <option value="goods">Goods</option>
          <option value="services">Services</option>
          <option value="expertise">Expertise</option>
          <option value="surplus">Surplus</option>
        </select>
      </div>
      <div>
        <label for="listing-availability" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Availability</label>
        <select
          id="listing-availability"
          name="availability"
          value={editingListing?.availability ?? 'available'}
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        >
          <option value="available">Available</option>
          <option value="limited">Limited</option>
          <option value="unavailable">Unavailable</option>
        </select>
      </div>
    </div>

    <div>
      <label for="listing-location" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Location</label>
      <input
        id="listing-location"
        name="location"
        type="text"
        value={editingListing?.location ?? ''}
        placeholder="City or region (optional)"
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      />
    </div>

    <div>
      <label for="listing-tags" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Tags</label>
      <input
        id="listing-tags"
        name="tags"
        type="text"
        value={editingListing?.tags?.join(', ') ?? ''}
        placeholder="Comma-separated tags (optional)"
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      />
    </div>

    <div class="flex justify-end gap-3">
      <button
        type="button"
        onclick={() => { showCreateForm = false; editingListing = null; }}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
      >Cancel</button>
      <button
        type="submit"
        disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50"
      >{submitting ? 'Saving...' : editingListing ? 'Save changes' : 'Create Listing'}</button>
    </div>
  </form>
  {/key}
</Modal>
