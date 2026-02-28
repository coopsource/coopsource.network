<script lang="ts">
  import { enhance } from '$app/forms';
  import { Badge } from '$lib/components/ui';
  import { workspacePrefix } from '$lib/utils/workspace.js';

  let { data, form } = $props();

  function statusToVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
    switch (status) {
      case 'active': case 'accepted': case 'resolved': case 'signed': return 'success';
      case 'pending': case 'open': case 'closed': return 'warning';
      case 'revoked': case 'void': case 'voided': return 'danger';
      default: return 'default';
    }
  }

  const proposal = $derived(data.proposal);
  const votes = $derived(data.votes);
  const tally = $derived(data.tally);

  const totalVotes = $derived(
    (tally.yes ?? 0) + (tally.no ?? 0) + (tally.abstain ?? 0),
  );

  function pct(count: number): string {
    if (totalVotes === 0) return '0';
    return ((count / totalVotes) * 100).toFixed(0);
  }

  const myVote = $derived(
    votes.find((v) => v.voterDid === data.user?.did) ?? null,
  );

  let rationale = $state('');
  let submitting = $state(false);
</script>

<svelte:head>
  <title>{proposal.title} — Co-op Source</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6">
  <div class="flex items-center gap-3">
    <a href="{$workspacePrefix}/governance" class="text-sm text-[var(--cs-text-muted)] hover:text-[var(--cs-text-secondary)]">← Proposals</a>
  </div>

  {#if form?.actionError || form?.voteError}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">
      {form?.actionError ?? form?.voteError}
    </div>
  {/if}

  {#if form?.actionSuccess}
    <div class="rounded-md bg-green-50 p-3 text-sm text-green-700">{form.actionSuccess}</div>
  {/if}

  <!-- Proposal Header -->
  <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-6">
    <div class="mb-4 flex items-start justify-between gap-4">
      <h1 class="text-xl font-semibold text-[var(--cs-text)]">{proposal.title}</h1>
      <Badge variant={statusToVariant(proposal.status)} class="shrink-0">{proposal.status}</Badge>
    </div>

    <div class="mb-4 flex flex-wrap gap-3 text-xs text-[var(--cs-text-muted)]">
      <span>Type: <strong>{proposal.proposalType}</strong></span>
      <span>Voting: <strong>{proposal.votingMethod}</strong></span>
      {#if proposal.quorumRequired}
        <span>Quorum: <strong>{proposal.quorumRequired}</strong></span>
      {/if}
      {#if proposal.votingEndsAt}
        <span>Deadline: <strong>{new Date(proposal.votingEndsAt).toLocaleString()}</strong></span>
      {/if}
      <span>
        By <strong>{proposal.authorDisplayName}</strong> on
        {new Date(proposal.createdAt).toLocaleDateString()}
      </span>
    </div>

    <div class="prose prose-sm max-w-none whitespace-pre-wrap text-sm text-[var(--cs-text-secondary)]">
      {proposal.body}
    </div>

    <!-- Proposal Actions -->
    {#if proposal.status === 'draft'}
      <div class="mt-4 flex gap-3 border-t border-[var(--cs-border)] pt-4">
        <form method="POST" action="?/open" use:enhance>
          <button
            type="submit"
            class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]"
          >
            Open for voting
          </button>
        </form>
      </div>
    {:else if proposal.status === 'open'}
      <div class="mt-4 flex gap-3 border-t border-[var(--cs-border)] pt-4">
        <form method="POST" action="?/close" use:enhance>
          <button
            type="submit"
            class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
          >
            Close voting
          </button>
        </form>
      </div>
    {:else if proposal.status === 'closed'}
      <div class="mt-4 flex gap-3 border-t border-[var(--cs-border)] pt-4">
        <form method="POST" action="?/resolve" use:enhance>
          <button
            type="submit"
            class="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
          >
            Mark resolved
          </button>
        </form>
      </div>
    {/if}
  </div>

  <!-- Vote Tally -->
  {#if totalVotes > 0 || proposal.status === 'open'}
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-5">
      <h2 class="mb-4 text-sm font-semibold text-[var(--cs-text)]">Vote Tally</h2>
      <div class="space-y-3">
        {#each [['yes', 'bg-green-500', 'Yes'], ['no', 'bg-red-500', 'No'], ['abstain', 'bg-gray-400', 'Abstain']] as [key, color, label]}
          {@const count = (tally[key] ?? 0) as number}
          <div>
            <div class="mb-1 flex justify-between text-sm">
              <span class="font-medium text-[var(--cs-text-secondary)]">{label}</span>
              <span class="text-[var(--cs-text-muted)]">{count} ({pct(count)}%)</span>
            </div>
            <div class="h-2.5 rounded-full bg-[var(--cs-bg-inset)]">
              <div
                class="h-2.5 rounded-full {color} transition-all"
                style="width: {pct(count)}%"
              ></div>
            </div>
          </div>
        {/each}
        <p class="text-xs text-[var(--cs-text-muted)]">{totalVotes} total vote{totalVotes !== 1 ? 's' : ''}</p>
      </div>
    </div>
  {/if}

  <!-- Vote Section -->
  {#if proposal.status === 'open'}
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-5">
      <h2 class="mb-4 text-sm font-semibold text-[var(--cs-text)]">Cast Your Vote</h2>

      {#if myVote}
        <div class="mb-4 rounded-md bg-blue-50 p-3 text-sm text-blue-800">
          You voted: <strong>{myVote.choice}</strong>
          {#if myVote.rationale}
            — "{myVote.rationale}"
          {/if}
        </div>
        <form method="POST" action="?/retractVote" use:enhance>
          <button
            type="submit"
            class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
          >
            Retract vote
          </button>
        </form>
      {:else}
        <form
          method="POST"
          action="?/vote"
          use:enhance={() => {
            submitting = true;
            return async ({ update }) => {
              submitting = false;
              rationale = '';
              await update();
            };
          }}
          class="space-y-4"
        >
          <div class="flex gap-3">
            {#each [['yes', 'bg-green-600 hover:bg-green-700', 'Yes'], ['no', 'bg-red-600 hover:bg-red-700', 'No'], ['abstain', 'bg-gray-500 hover:bg-gray-600', 'Abstain']] as [val, cls, lbl]}
              <button
                type="submit"
                name="choice"
                value={val}
                disabled={submitting}
                class="flex-1 rounded-md px-3 py-2 text-sm font-medium text-white {cls} disabled:opacity-50"
              >
                {lbl}
              </button>
            {/each}
          </div>
          <div>
            <label for="rationale" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
              Rationale <span class="text-[var(--cs-text-muted)]">(optional)</span>
            </label>
            <textarea
              id="rationale"
              name="rationale"
              bind:value={rationale}
              rows={2}
              class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
              placeholder="Why are you voting this way?"
            ></textarea>
          </div>
        </form>
      {/if}
    </div>
  {/if}

  <!-- Votes List -->
  {#if votes.length > 0}
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
      <h2 class="border-b border-[var(--cs-border)] px-5 py-4 text-sm font-semibold text-[var(--cs-text)]">
        Votes ({votes.length})
      </h2>
      <ul class="divide-y divide-[var(--cs-border)]">
        {#each votes as vote}
          <li class="flex items-start gap-3 px-5 py-3">
            <span
              class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium
                {vote.choice === 'yes'
                  ? 'bg-green-100 text-green-700'
                  : vote.choice === 'no'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-[var(--cs-bg-inset)] text-[var(--cs-text-secondary)]'}"
            >
              {vote.choice}
            </span>
            <div class="min-w-0 flex-1">
              <span class="text-sm font-medium text-[var(--cs-text)]">{vote.voterDisplayName}</span>
              {#if vote.voterHandle}
                <span class="ml-1 text-xs text-[var(--cs-text-muted)]">@{vote.voterHandle}</span>
              {/if}
              {#if vote.rationale}
                <p class="mt-0.5 text-sm text-[var(--cs-text-secondary)]">"{vote.rationale}"</p>
              {/if}
            </div>
            <span class="shrink-0 text-xs text-[var(--cs-text-muted)]">
              {new Date(vote.createdAt).toLocaleDateString()}
            </span>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>
