<script lang="ts">
  import type { ProposalQuorumType } from '@coopsource/common';
  import { onMount, untrack } from 'svelte';
  import {
    isoDateTimeToLocalInput,
    localDateTimeToIso,
  } from '$lib/utils/datetime.js';

  interface Props {
    initialValues?: Partial<{
      title: string;
      body: string;
      closesAt: string;
    }>;
    showVotingSettings?: boolean;
  }

  let { initialValues, showVotingSettings = true }: Props = $props();

  const initial = untrack(() => initialValues);
  const values = $state({
    title: initial?.title ?? '',
    body: initial?.body ?? '',
    closesAt: '',
  });
  let quorumType = $state<ProposalQuorumType>('simpleMajority');
  let quorumThresholdPercent = $state('50');
  const closesAtIso = $derived(localDateTimeToIso(values.closesAt));

  onMount(() => {
    values.closesAt = initial?.closesAt
      ? isoDateTimeToLocalInput(initial.closesAt)
      : '';
  });
</script>

<div>
  <label for="title" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Title</label>
  <input
    id="title"
    name="title"
    type="text"
    required
    bind:value={values.title}
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
    bind:value={values.body}
    class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
    placeholder="Describe the proposal in detail..."
  ></textarea>
</div>

{#if showVotingSettings}
  <div class="grid grid-cols-2 gap-4">
    <div>
      <span class="block text-sm font-medium text-[var(--cs-text-secondary)]">
        Voting Method
      </span>
      <p class="mt-1 border border-[var(--cs-border)] px-3 py-2 text-sm text-[var(--cs-text)]">
        Yes / No
      </p>
      <input type="hidden" name="votingType" value="binary" />
    </div>

    <div>
      <label for="quorumType" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Quorum</label>
      <select
        id="quorumType"
        name="quorumType"
        bind:value={quorumType}
        class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      >
        <option value="simpleMajority">Simple Majority</option>
        <option value="superMajority">Supermajority (2/3)</option>
        <option value="unanimous">Unanimous</option>
        <option value="custom">Custom threshold</option>
      </select>
    </div>
  </div>

  {#if quorumType === 'custom'}
    <div>
      <label for="quorumThresholdPercent" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
        Quorum threshold (%)
      </label>
      <input
        id="quorumThresholdPercent"
        name="quorumThresholdPercent"
        type="number"
        min="0"
        max="100"
        step="1"
        required
        bind:value={quorumThresholdPercent}
        class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      />
    </div>
  {/if}
{/if}

<div>
  <label for="closesAt" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
    Voting Deadline <span class="text-[var(--cs-text-muted)]">(optional)</span>
  </label>
  <input
    id="closesAt"
    name="closesAtLocal"
    type="datetime-local"
    bind:value={values.closesAt}
    class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
  />
  <input type="hidden" name="closesAt" value={closesAtIso} />
</div>
