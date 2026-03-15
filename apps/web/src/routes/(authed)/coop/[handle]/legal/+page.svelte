<script lang="ts">
  import { enhance } from '$app/forms';
  import { Badge, EmptyState, Modal } from '$lib/components/ui';
  import { workspacePrefix } from '$lib/utils/workspace.js';

  let { data, form } = $props();

  let createOpen = $state(false);
  let submitting = $state(false);

  $effect(() => {
    if (form?.success) {
      createOpen = false;
    }
  });

  const statusFilters = [
    { value: '', label: 'All' },
    { value: 'draft', label: 'Draft' },
    { value: 'active', label: 'Active' },
    { value: 'archived', label: 'Archived' },
  ];

  const typeFilters = [
    { value: '', label: 'All types' },
    { value: 'bylaws', label: 'Bylaws' },
    { value: 'articles', label: 'Articles' },
    { value: 'policy', label: 'Policy' },
    { value: 'resolution', label: 'Resolution' },
    { value: 'other', label: 'Other' },
  ];

  function statusToVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
    switch (status) {
      case 'active': return 'success';
      case 'draft': return 'warning';
      case 'archived': return 'default';
      default: return 'default';
    }
  }

  function buildFilterUrl(statusVal?: string, typeVal?: string): string {
    const s = statusVal ?? data.filterStatus;
    const t = typeVal ?? data.filterType;
    const qs = new URLSearchParams();
    if (s) qs.set('status', s);
    if (t) qs.set('documentType', t);
    return qs.size ? `${$workspacePrefix}/legal?${qs}` : `${$workspacePrefix}/legal`;
  }
</script>

<svelte:head>
  <title>Legal Documents — Co-op Source</title>
</svelte:head>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">Legal Documents</h1>
    <div class="flex gap-2">
      <a
        href="{$workspacePrefix}/legal/meetings"
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
      >
        Meeting Records
      </a>
      <button
        type="button"
        onclick={() => (createOpen = true)}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]"
      >
        New document
      </button>
    </div>
  </div>

  {#if form?.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}

  <!-- Filters -->
  <div class="flex gap-4">
    <div class="flex gap-1 border-b border-[var(--cs-border)]">
      {#each statusFilters as filter}
        <a
          href={buildFilterUrl(filter.value, undefined)}
          class="px-3 py-2 text-sm font-medium transition-colors
            {data.filterStatus === filter.value
              ? 'border-b-2 border-[var(--cs-primary)] text-[var(--cs-primary)]'
              : 'text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)]'}"
        >
          {filter.label}
        </a>
      {/each}
    </div>
    <select
      onchange={(e) => { window.location.href = buildFilterUrl(undefined, (e.target as HTMLSelectElement).value); }}
      class="rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-2 py-1 text-sm text-[var(--cs-text)]"
    >
      {#each typeFilters as tf}
        <option value={tf.value} selected={data.filterType === tf.value}>{tf.label}</option>
      {/each}
    </select>
  </div>

  {#if data.documents.length === 0}
    <EmptyState
      title="No legal documents"
      description="Create your first legal document — bylaws, articles, policies, or resolutions."
    />
  {:else}
    <div class="space-y-2">
      {#each data.documents as doc}
        <a
          href="{$workspacePrefix}/legal/{doc.id}"
          class="block rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4 hover:border-[var(--cs-border-hover)] hover:shadow-sm"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <h3 class="font-medium text-[var(--cs-text)]">{doc.title}</h3>
              <p class="mt-2 text-xs text-[var(--cs-text-muted)]">
                {doc.documentType} · v{doc.version} ·
                {new Date(doc.createdAt).toLocaleDateString()}
              </p>
            </div>
            <Badge variant={statusToVariant(doc.status)} class="shrink-0">{doc.status}</Badge>
          </div>
        </a>
      {/each}
    </div>
  {/if}

  {#if data.cursor}
    <div class="flex justify-center pt-2">
      <a
        href="{$workspacePrefix}/legal?cursor={data.cursor}{data.filterStatus ? `&status=${data.filterStatus}` : ''}{data.filterType ? `&documentType=${data.filterType}` : ''}"
        class="text-sm text-[var(--cs-primary)] hover:underline"
      >
        Load more
      </a>
    </div>
  {/if}
</div>

<!-- Create Document Modal -->
<Modal open={createOpen} title="New Legal Document" onclose={() => (createOpen = false)}>
  {#if form?.error}
    <div class="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}
  <form
    method="POST"
    action="?/create"
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
      <label for="docTitle" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Title</label>
      <input
        id="docTitle"
        name="title"
        type="text"
        required
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        placeholder="e.g. Cooperative Bylaws"
      />
    </div>
    <div>
      <label for="docType" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Document Type</label>
      <select
        id="docType"
        name="documentType"
        required
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      >
        <option value="">Select type…</option>
        <option value="bylaws">Bylaws</option>
        <option value="articles">Articles</option>
        <option value="policy">Policy</option>
        <option value="resolution">Resolution</option>
        <option value="other">Other</option>
      </select>
    </div>
    <div>
      <label for="docStatus" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Status</label>
      <select
        id="docStatus"
        name="status"
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      >
        <option value="draft">Draft</option>
        <option value="active">Active</option>
      </select>
    </div>
    <div>
      <label for="docBody" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Body</label>
      <textarea
        id="docBody"
        name="body"
        rows={6}
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        placeholder="Document content…"
      ></textarea>
    </div>
    <div class="flex justify-end gap-3">
      <button
        type="button"
        onclick={() => (createOpen = false)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50"
      >
        {submitting ? 'Creating…' : 'Create document'}
      </button>
    </div>
  </form>
</Modal>
