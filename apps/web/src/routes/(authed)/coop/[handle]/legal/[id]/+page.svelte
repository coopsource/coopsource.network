<script lang="ts">
  import { enhance } from '$app/forms';
  import { Badge } from '$lib/components/ui';
  import { workspacePrefix } from '$lib/utils/workspace.js';

  let { data, form } = $props();

  let editing = $state(false);
  let submitting = $state(false);

  const doc = $derived(data.document);

  $effect(() => {
    if (form?.success) {
      editing = false;
    }
  });

  function statusToVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
    switch (status) {
      case 'active': return 'success';
      case 'draft': return 'warning';
      case 'archived': return 'default';
      default: return 'default';
    }
  }
</script>

<svelte:head>
  <title>{doc.title} — Co-op Source</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6">
  <div class="flex items-center gap-3">
    <a href="{$workspacePrefix}/legal" class="text-sm text-[var(--cs-text-muted)] hover:text-[var(--cs-text-secondary)]">← Legal Documents</a>
  </div>

  {#if form?.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}
  {#if form?.success}
    <div class="rounded-md bg-green-50 p-3 text-sm text-green-700">Document updated successfully. A new version has been created.</div>
  {/if}

  <!-- Document Header -->
  <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-6">
    <div class="mb-4 flex items-start justify-between gap-4">
      <h1 class="text-xl font-semibold text-[var(--cs-text)]">{doc.title}</h1>
      <div class="flex items-center gap-2">
        <Badge variant={statusToVariant(doc.status)} class="shrink-0">{doc.status}</Badge>
        <span class="rounded bg-[var(--cs-bg-inset)] px-1.5 py-0.5 text-xs text-[var(--cs-text-secondary)]">v{doc.version}</span>
      </div>
    </div>

    <div class="mb-4 flex flex-wrap gap-3 text-xs text-[var(--cs-text-muted)]">
      <span>Type: <strong>{doc.documentType}</strong></span>
      <span>Created: <strong>{new Date(doc.createdAt).toLocaleDateString()}</strong></span>
      {#if doc.previousVersionUri}
        <span>Previous version available</span>
      {/if}
    </div>

    {#if !editing}
      <div class="prose prose-sm max-w-none whitespace-pre-wrap text-sm text-[var(--cs-text-secondary)]">
        {doc.body || 'No content yet.'}
      </div>
      <div class="mt-4 border-t border-[var(--cs-border)] pt-4">
        <button
          type="button"
          onclick={() => (editing = true)}
          class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]"
        >
          Edit document
        </button>
      </div>
    {:else}
      <form
        method="POST"
        action="?/update"
        use:enhance={() => {
          submitting = true;
          return async ({ update }) => {
            submitting = false;
            await update();
          };
        }}
        class="mt-4 space-y-4 border-t border-[var(--cs-border)] pt-4"
      >
        <div>
          <label for="editTitle" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Title</label>
          <input
            id="editTitle"
            name="title"
            type="text"
            value={doc.title}
            class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
          />
        </div>
        <div>
          <label for="editType" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Document Type</label>
          <select
            id="editType"
            name="documentType"
            class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
          >
            {#each ['bylaws', 'articles', 'policy', 'resolution', 'other'] as t}
              <option value={t} selected={doc.documentType === t}>{t}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="editStatus" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Status</label>
          <select
            id="editStatus"
            name="status"
            class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
          >
            {#each ['draft', 'active', 'archived'] as s}
              <option value={s} selected={doc.status === s}>{s}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="editBody" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Body</label>
          <textarea
            id="editBody"
            name="body"
            rows={10}
            class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
          >{doc.body ?? ''}</textarea>
        </div>
        <div class="flex justify-end gap-3">
          <button
            type="button"
            onclick={() => (editing = false)}
            class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Save changes (new version)'}
          </button>
        </div>
      </form>
    {/if}
  </div>
</div>
