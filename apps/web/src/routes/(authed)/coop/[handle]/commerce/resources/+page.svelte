<script lang="ts">
  import { enhance } from '$app/forms';
  import { Badge, EmptyState, Modal } from '$lib/components/ui';
  import { workspacePrefix } from '$lib/utils/workspace.js';
  import type { SharedResource } from '$lib/api/types.js';

  let { data, form } = $props();

  let showCreateForm = $state(false);
  let showBookingForm = $state(false);
  let bookingResourceId = $state('');
  let bookingResourceTitle = $state('');
  let submitting = $state(false);

  $effect(() => {
    if (form?.success) {
      showCreateForm = false;
      showBookingForm = false;
    }
  });

  const typeFilters = [
    { value: '', label: 'All Types' },
    { value: 'equipment', label: 'Equipment' },
    { value: 'space', label: 'Space' },
    { value: 'vehicle', label: 'Vehicle' },
    { value: 'tool', label: 'Tool' },
    { value: 'other', label: 'Other' },
  ];

  function typeColor(resourceType: string): string {
    switch (resourceType) {
      case 'equipment': return 'bg-blue-100 text-blue-700';
      case 'space': return 'bg-violet-100 text-violet-700';
      case 'vehicle': return 'bg-emerald-100 text-emerald-700';
      case 'tool': return 'bg-amber-100 text-amber-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  }

  function statusVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
    switch (status) {
      case 'available': return 'success';
      case 'in_use': return 'warning';
      case 'maintenance': return 'danger';
      default: return 'default';
    }
  }

  function formatCost(costPerUnit: number | null, costUnit: string | null): string {
    if (costPerUnit == null) return 'Free';
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(costPerUnit);
    return costUnit ? `${formatted}/${costUnit}` : formatted;
  }

  function openBooking(resource: SharedResource) {
    bookingResourceId = resource.id;
    bookingResourceTitle = resource.title;
    showBookingForm = true;
  }
</script>

<svelte:head>
  <title>Shared Resources — Co-op Source</title>
</svelte:head>

<div class="space-y-4">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-xl font-semibold text-[var(--cs-text)]">Shared Resources</h1>
      <p class="text-sm text-[var(--cs-text-muted)]">Equipment, space, and tools available for sharing.</p>
    </div>
    <button
      type="button"
      onclick={() => (showCreateForm = true)}
      class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]"
    >Add Resource</button>
  </div>

  {#if form?.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}

  <!-- Filters -->
  <div class="flex gap-1 flex-wrap">
    {#each typeFilters as filter}
      <a
        href={filter.value
          ? `${$workspacePrefix}/commerce/resources?resourceType=${filter.value}${data.filterStatus ? `&status=${data.filterStatus}` : ''}`
          : `${$workspacePrefix}/commerce/resources${data.filterStatus ? `?status=${data.filterStatus}` : ''}`}
        class="px-3 py-1.5 text-xs font-medium rounded-full transition-colors
          {data.filterResourceType === filter.value
            ? 'bg-[var(--cs-primary)] text-[var(--cs-text-on-primary)]'
            : 'bg-[var(--cs-bg-inset)] text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)]'}"
      >{filter.label}</a>
    {/each}
  </div>

  <!-- Resource Cards -->
  {#if data.resources.length === 0}
    <EmptyState title="No shared resources" description="Add equipment, space, or tools that can be shared with other cooperatives." />
  {:else}
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {#each data.resources as resource (resource.id)}
        <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4 hover:border-[var(--cs-border-hover)] hover:shadow-sm transition-shadow">
          <div class="flex items-start justify-between gap-2">
            <h3 class="font-medium text-[var(--cs-text)] truncate">{resource.title}</h3>
            <Badge variant={statusVariant(resource.status)}>{resource.status}</Badge>
          </div>
          {#if resource.description}
            <p class="mt-1 text-sm text-[var(--cs-text-secondary)] line-clamp-2">{resource.description}</p>
          {/if}
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <span class="rounded-full px-2 py-0.5 text-[10px] font-medium {typeColor(resource.resourceType)}">{resource.resourceType}</span>
            <span class="text-xs font-medium text-[var(--cs-text)]">{formatCost(resource.costPerUnit, resource.costUnit)}</span>
          </div>
          <div class="mt-3 flex items-center justify-between">
            {#if resource.location}
              <span class="text-xs text-[var(--cs-text-muted)]">{resource.location}</span>
            {:else}
              <span></span>
            {/if}
            {#if resource.status === 'available'}
              <button
                type="button"
                onclick={() => openBooking(resource)}
                class="text-xs font-medium text-[var(--cs-primary)] hover:underline"
              >Book</button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Pagination -->
  {#if data.cursor}
    <div class="flex justify-center pt-2">
      <a
        href="{$workspacePrefix}/commerce/resources?cursor={data.cursor}{data.filterResourceType ? `&resourceType=${data.filterResourceType}` : ''}"
        class="rounded-md border border-[var(--cs-border)] px-4 py-2 text-sm font-medium text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
      >Load more</a>
    </div>
  {/if}
</div>

<!-- Create Resource Modal -->
<Modal open={showCreateForm} title="Add Shared Resource" onclose={() => (showCreateForm = false)}>
  <form
    method="POST"
    action="?/createResource"
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
      <label for="res-title" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Title</label>
      <input
        id="res-title"
        name="title"
        type="text"
        required
        placeholder="Resource name..."
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      />
    </div>

    <div>
      <label for="res-description" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Description</label>
      <textarea
        id="res-description"
        name="description"
        rows="3"
        placeholder="Describe the resource..."
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      ></textarea>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="res-type" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Type</label>
        <select
          id="res-type"
          name="resourceType"
          required
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        >
          <option value="equipment">Equipment</option>
          <option value="space">Space</option>
          <option value="vehicle">Vehicle</option>
          <option value="tool">Tool</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div>
        <label for="res-location" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Location</label>
        <input
          id="res-location"
          name="location"
          type="text"
          placeholder="Where is it?"
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        />
      </div>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="res-cost" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Cost Per Unit</label>
        <input
          id="res-cost"
          name="costPerUnit"
          type="number"
          step="0.01"
          min="0"
          placeholder="0.00 (free)"
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        />
      </div>
      <div>
        <label for="res-unit" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Cost Unit</label>
        <select
          id="res-unit"
          name="costUnit"
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        >
          <option value="">N/A</option>
          <option value="hour">Per Hour</option>
          <option value="day">Per Day</option>
          <option value="week">Per Week</option>
          <option value="use">Per Use</option>
        </select>
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
      >{submitting ? 'Adding...' : 'Add Resource'}</button>
    </div>
  </form>
</Modal>

<!-- Booking Modal -->
<Modal open={showBookingForm} title="Book: {bookingResourceTitle}" onclose={() => (showBookingForm = false)}>
  <form
    method="POST"
    action="?/bookResource"
    use:enhance={() => {
      submitting = true;
      return async ({ update }) => {
        submitting = false;
        await update();
      };
    }}
    class="space-y-4"
  >
    <input type="hidden" name="resourceId" value={bookingResourceId} />

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="book-start" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Start</label>
        <input
          id="book-start"
          name="startsAt"
          type="datetime-local"
          required
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        />
      </div>
      <div>
        <label for="book-end" class="block text-sm font-medium text-[var(--cs-text-secondary)]">End</label>
        <input
          id="book-end"
          name="endsAt"
          type="datetime-local"
          required
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        />
      </div>
    </div>

    <div>
      <label for="book-purpose" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Purpose</label>
      <textarea
        id="book-purpose"
        name="purpose"
        rows="2"
        placeholder="What will you use it for?"
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      ></textarea>
    </div>

    <div class="flex justify-end gap-3">
      <button
        type="button"
        onclick={() => (showBookingForm = false)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
      >Cancel</button>
      <button
        type="submit"
        disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50"
      >{submitting ? 'Booking...' : 'Request Booking'}</button>
    </div>
  </form>
</Modal>
