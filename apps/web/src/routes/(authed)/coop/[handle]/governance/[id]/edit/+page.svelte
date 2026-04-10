<script lang="ts">
  import { enhance } from '$app/forms';
  import ProposalForm from '$lib/components/forms/ProposalForm.svelte';
  import { workspacePrefix } from '$lib/utils/workspace.js';

  let { data, form } = $props();

  let submitting = $state(false);

  const initialValues = $derived({
    title: data.proposal.title,
    body: data.proposal.body,
    votingType: data.proposal.votingMethod,
    quorumType: data.proposal.quorumType,
    closesAt: data.proposal.votingEndsAt?.slice(0, 16) ?? '',
  });
</script>

<svelte:head>
  <title>Edit Proposal — Co-op Source</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
  <div class="flex items-center gap-3">
    <a href="{$workspacePrefix}/governance/{data.proposal.id}" class="text-sm text-[var(--cs-text-muted)] hover:text-[var(--cs-text)]">← Proposal</a>
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">Edit Proposal</h1>
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
    <div class="space-y-5">
      <ProposalForm {initialValues} />
    </div>

    <div class="flex justify-end gap-3 pt-2">
      <a
        href="{$workspacePrefix}/governance/{data.proposal.id}"
        class="rounded-md border border-[var(--cs-border)] px-4 py-2 text-sm font-medium text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-hover)]"
      >
        Cancel
      </a>
      <button
        type="submit"
        disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-4 py-2 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50"
      >
        {submitting ? 'Saving...' : 'Save changes'}
      </button>
    </div>
  </form>
</div>
