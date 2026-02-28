<script lang="ts">
  import { enhance } from '$app/forms';
  import { workspacePrefix } from '$lib/utils/workspace.js';

  let { form } = $props();

  let submitting = $state(false);
</script>

<svelte:head>
  <title>New Proposal — Co-op Source</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
  <div class="flex items-center gap-3">
    <a href="{$workspacePrefix}/governance" class="text-sm text-[var(--cs-text-muted)] hover:text-[var(--cs-text)]">← Proposals</a>
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">New Proposal</h1>
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
      <label for="title" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Title</label>
      <input
        id="title"
        name="title"
        type="text"
        required
        class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        placeholder="Proposal title"
      />
    </div>

    <div>
      <label for="body" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Description</label>
      <textarea
        id="body"
        name="body"
        required
        rows={8}
        class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        placeholder="Describe the proposal in detail..."
      ></textarea>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="votingType" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
          Voting Method
        </label>
        <select
          id="votingType"
          name="votingType"
          class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        >
          <option value="binary">Yes / No</option>
          <option value="approval">Approval</option>
          <option value="ranked">Ranked Choice</option>
        </select>
      </div>

      <div>
        <label for="quorumType" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Quorum</label>
        <select
          id="quorumType"
          name="quorumType"
          class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        >
          <option value="simpleMajority">Simple Majority</option>
          <option value="superMajority">Supermajority (2/3)</option>
          <option value="unanimous">Unanimous</option>
        </select>
      </div>
    </div>

    <div>
      <label for="closesAt" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
        Voting Deadline <span class="text-[var(--cs-text-muted)]">(optional)</span>
      </label>
      <input
        id="closesAt"
        name="closesAt"
        type="datetime-local"
        class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      />
    </div>

    <div class="flex justify-end gap-3 pt-2">
      <a
        href="{$workspacePrefix}/governance"
        class="rounded-md border border-[var(--cs-border)] px-4 py-2 text-sm font-medium text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-hover)]"
      >
        Cancel
      </a>
      <button
        type="submit"
        disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-4 py-2 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50"
      >
        {submitting ? 'Creating...' : 'Create proposal'}
      </button>
    </div>
  </form>
</div>
