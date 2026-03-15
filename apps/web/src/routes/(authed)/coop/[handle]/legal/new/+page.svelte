<script lang="ts">
  import { enhance } from '$app/forms';
  import { workspacePrefix } from '$lib/utils/workspace.js';

  let { form } = $props();

  let submitting = $state(false);
</script>

<svelte:head>
  <title>New Legal Document — Co-op Source</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
  <div class="flex items-center gap-3">
    <a href="{$workspacePrefix}/legal" class="text-sm text-[var(--cs-text-muted)] hover:text-[var(--cs-text-secondary)]">← Legal Documents</a>
  </div>

  <h1 class="text-xl font-semibold text-[var(--cs-text)]">New Legal Document</h1>

  {#if form?.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}

  <form
    method="POST"
    use:enhance={() => {
      submitting = true;
      return async ({ update }) => {
        submitting = false;
        await update();
      };
    }}
    class="space-y-4 rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-6"
  >
    <div>
      <label for="title" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Title</label>
      <input
        id="title"
        name="title"
        type="text"
        required
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        placeholder="e.g. Cooperative Bylaws"
      />
    </div>
    <div>
      <label for="documentType" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Document Type</label>
      <select
        id="documentType"
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
      <label for="status" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Status</label>
      <select
        id="status"
        name="status"
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      >
        <option value="draft">Draft</option>
        <option value="active">Active</option>
      </select>
    </div>
    <div>
      <label for="body" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Body</label>
      <textarea
        id="body"
        name="body"
        rows={12}
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        placeholder="Document content…"
      ></textarea>
    </div>
    <div class="flex justify-end gap-3">
      <a
        href="{$workspacePrefix}/legal"
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
      >
        Cancel
      </a>
      <button
        type="submit"
        disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50"
      >
        {submitting ? 'Creating…' : 'Create document'}
      </button>
    </div>
  </form>
</div>
