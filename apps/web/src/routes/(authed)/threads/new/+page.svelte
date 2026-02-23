<script lang="ts">
  import { enhance } from '$app/forms';

  let { form } = $props();

  let submitting = $state(false);
</script>

<svelte:head>
  <title>New Thread — Co-op Source</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
  <div class="flex items-center gap-3">
    <a href="/threads" class="text-sm text-[var(--cs-text-muted)] hover:text-[var(--cs-text-secondary)]">← Threads</a>
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">New Thread</h1>
  </div>

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
    class="space-y-5 rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-6"
  >
    <div>
      <label for="title" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
        Title <span class="text-[var(--cs-text-muted)]">(optional)</span>
      </label>
      <input
        id="title"
        name="title"
        type="text"
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        placeholder="Thread title"
      />
    </div>

    <div>
      <label for="threadType" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
        Type
      </label>
      <select
        id="threadType"
        name="threadType"
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      >
        <option value="discussion">Discussion</option>
        <option value="announcement">Announcement</option>
        <option value="direct">Direct</option>
      </select>
    </div>

    <div class="flex justify-end gap-3 pt-2">
      <a
        href="/threads"
        class="rounded-md border border-[var(--cs-border)] px-4 py-2 text-sm font-medium text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
      >
        Cancel
      </a>
      <button
        type="submit"
        disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-4 py-2 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50"
      >
        {submitting ? 'Creating…' : 'Create thread'}
      </button>
    </div>
  </form>
</div>
