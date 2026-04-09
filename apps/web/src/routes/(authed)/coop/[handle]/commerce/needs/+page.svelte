<script lang="ts">
  import { enhance } from '$app/forms';
  import { Badge, EmptyState, Modal } from '$lib/components/ui';
  import { workspacePrefix } from '$lib/utils/workspace.js';
  import { canEditCommerceNeed } from '$lib/utils/entity-permissions.js';
  import type { CommerceNeed } from '$lib/api/types.js';

  let { data, form } = $props();

  let showCreateForm = $state(false);
  let editingNeed = $state<CommerceNeed | null>(null);
  let submitting = $state(false);

  $effect(() => {
    if (form?.success) {
      showCreateForm = false;
      editingNeed = null;
    }
  });

  const categoryFilters = [
    { value: '', label: 'All Categories' },
    { value: 'goods', label: 'Goods' },
    { value: 'services', label: 'Services' },
    { value: 'expertise', label: 'Expertise' },
    { value: 'materials', label: 'Materials' },
  ];

  function urgencyVariant(urgency: string): 'success' | 'warning' | 'danger' | 'default' {
    switch (urgency) {
      case 'critical': return 'danger';
      case 'high': return 'warning';
      case 'normal': return 'default';
      case 'low': return 'success';
      default: return 'default';
    }
  }

  function urgencyColor(urgency: string): string {
    switch (urgency) {
      case 'critical': return 'bg-red-100 text-red-700';
      case 'high': return 'bg-orange-100 text-orange-700';
      case 'normal': return 'bg-blue-100 text-blue-700';
      case 'low': return 'bg-gray-100 text-gray-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  }

  function categoryColor(category: string): string {
    switch (category) {
      case 'goods': return 'bg-blue-100 text-blue-700';
      case 'services': return 'bg-violet-100 text-violet-700';
      case 'expertise': return 'bg-emerald-100 text-emerald-700';
      case 'materials': return 'bg-amber-100 text-amber-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  }
</script>

<svelte:head>
  <title>Needs — Co-op Source</title>
</svelte:head>

<div class="space-y-4">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-xl font-semibold text-[var(--cs-text)]">Needs</h1>
      <p class="text-sm text-[var(--cs-text-muted)]">What your cooperative needs from others.</p>
    </div>
    <button
      type="button"
      onclick={() => (showCreateForm = true)}
      class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]"
    >Post Need</button>
  </div>

  {#if form?.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}

  <!-- Filters -->
  <div class="flex gap-1 flex-wrap">
    {#each categoryFilters as filter}
      <a
        href={filter.value
          ? `${$workspacePrefix}/commerce/needs?category=${filter.value}${data.filterStatus ? `&status=${data.filterStatus}` : ''}`
          : `${$workspacePrefix}/commerce/needs${data.filterStatus ? `?status=${data.filterStatus}` : ''}`}
        class="px-3 py-1.5 text-xs font-medium rounded-full transition-colors
          {data.filterCategory === filter.value
            ? 'bg-[var(--cs-primary)] text-[var(--cs-text-on-primary)]'
            : 'bg-[var(--cs-bg-inset)] text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)]'}"
      >{filter.label}</a>
    {/each}
  </div>

  <!-- Needs List -->
  {#if data.needs.length === 0}
    <EmptyState title="No needs posted" description="Post your first need to let other cooperatives know what you are looking for." />
  {:else}
    <div class="space-y-3">
      {#each data.needs as need (need.id)}
        <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4 hover:border-[var(--cs-border-hover)] transition-colors">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <h3 class="font-medium text-[var(--cs-text)]">{need.title}</h3>
                <span class="rounded-full px-2 py-0.5 text-[10px] font-medium {urgencyColor(need.urgency)}">{need.urgency}</span>
              </div>
              {#if need.description}
                <p class="mt-1 text-sm text-[var(--cs-text-secondary)] line-clamp-2">{need.description}</p>
              {/if}
              <div class="mt-2 flex flex-wrap items-center gap-1.5">
                <span class="rounded-full px-2 py-0.5 text-[10px] font-medium {categoryColor(need.category)}">{need.category}</span>
                {#each need.tags as tag}
                  <span class="rounded-full bg-[var(--cs-bg-inset)] px-2 py-0.5 text-[10px] text-[var(--cs-text-muted)]">{tag}</span>
                {/each}
              </div>
              <div class="mt-2 flex items-center gap-3 text-xs text-[var(--cs-text-muted)]">
                {#if need.location}
                  <span>{need.location}</span>
                {/if}
                <span>{new Date(need.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <Badge variant={urgencyVariant(need.urgency)}>{need.status}</Badge>
              {#if canEditCommerceNeed(need)}
                <button
                  type="button"
                  onclick={() => { editingNeed = need; }}
                  class="text-xs text-[var(--cs-primary)] hover:underline"
                >Edit</button>
              {/if}
              <form method="POST" action="?/deleteNeed" use:enhance class="inline">
                <input type="hidden" name="id" value={need.id} />
                <button type="submit" class="text-xs text-red-600 hover:underline">Delete</button>
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
        href="{$workspacePrefix}/commerce/needs?cursor={data.cursor}{data.filterCategory ? `&category=${data.filterCategory}` : ''}"
        class="rounded-md border border-[var(--cs-border)] px-4 py-2 text-sm font-medium text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
      >Load more</a>
    </div>
  {/if}
</div>

<!-- Create / Edit Need Modal -->
<Modal open={showCreateForm || editingNeed !== null} title={editingNeed ? 'Edit Need' : 'Post a Need'} onclose={() => { showCreateForm = false; editingNeed = null; }}>
  {#key editingNeed?.id ?? 'create'}
  <form
    method="POST"
    action={editingNeed ? '?/updateNeed' : '?/createNeed'}
    use:enhance={() => {
      submitting = true;
      return async ({ update }) => {
        submitting = false;
        await update();
      };
    }}
    class="space-y-4"
  >
    {#if editingNeed}<input type="hidden" name="id" value={editingNeed.id} />{/if}

    <div>
      <label for="need-title" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Title</label>
      <input
        id="need-title"
        name="title"
        type="text"
        required
        value={editingNeed?.title ?? ''}
        placeholder="What do you need?"
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      />
    </div>

    <div>
      <label for="need-description" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Description</label>
      <textarea
        id="need-description"
        name="description"
        rows="3"
        placeholder="Describe what you need in detail..."
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      >{editingNeed?.description ?? ''}</textarea>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="need-category" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Category</label>
        <select
          id="need-category"
          name="category"
          required
          value={editingNeed?.category ?? 'goods'}
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        >
          <option value="goods">Goods</option>
          <option value="services">Services</option>
          <option value="expertise">Expertise</option>
          <option value="materials">Materials</option>
        </select>
      </div>
      <div>
        <label for="need-urgency" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Urgency</label>
        <select
          id="need-urgency"
          name="urgency"
          value={editingNeed?.urgency ?? 'normal'}
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        >
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
      </div>
    </div>

    <div>
      <label for="need-location" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Location</label>
      <input
        id="need-location"
        name="location"
        type="text"
        value={editingNeed?.location ?? ''}
        placeholder="City or region (optional)"
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      />
    </div>

    <div>
      <label for="need-tags" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Tags</label>
      <input
        id="need-tags"
        name="tags"
        type="text"
        value={editingNeed?.tags?.join(', ') ?? ''}
        placeholder="Comma-separated tags (optional)"
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      />
    </div>

    <div class="flex justify-end gap-3">
      <button
        type="button"
        onclick={() => { showCreateForm = false; editingNeed = null; }}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
      >Cancel</button>
      <button
        type="submit"
        disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50"
      >{submitting ? 'Saving...' : editingNeed ? 'Save changes' : 'Post Need'}</button>
    </div>
  </form>
  {/key}
</Modal>
