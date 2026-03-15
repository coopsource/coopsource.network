<script lang="ts">
  import { enhance } from '$app/forms';
  import { Badge, Modal } from '$lib/components/ui';
  import { workspacePrefix } from '$lib/utils/workspace.js';
  import type { Member } from '$lib/api/types.js';

  let { data, form } = $props();

  let reviewModalOpen = $state(false);
  let buddyModalOpen = $state(false);
  let completeModalOpen = $state(false);
  let submitting = $state(false);

  const progress = $derived(data.progress);
  const config = $derived(data.config);

  $effect(() => {
    if (form?.reviewSuccess || form?.success) {
      reviewModalOpen = false;
      buddyModalOpen = false;
      completeModalOpen = false;
    }
  });

  function getMemberName(did: string): string {
    const member = data.members.find((m: Member) => m.did === did);
    return member?.displayName ?? did;
  }

  function statusToVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
    switch (status) {
      case 'completed': return 'success';
      case 'in_progress': case 'probation': return 'warning';
      case 'failed': return 'danger';
      default: return 'default';
    }
  }

  function outcomeToVariant(outcome: string): 'success' | 'warning' | 'danger' | 'default' {
    switch (outcome) {
      case 'pass': return 'success';
      case 'needs_improvement': return 'warning';
      case 'fail': return 'danger';
      default: return 'default';
    }
  }

  const buddyCandidates = $derived(
    data.members.filter((m: Member) => m.did !== data.memberDid)
  );
</script>

<svelte:head>
  <title>Onboarding — {getMemberName(data.memberDid)} — Co-op Source</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6">
  <div class="flex items-center gap-3">
    <a href="{$workspacePrefix}/onboarding" class="text-sm text-[var(--cs-text-muted)] hover:text-[var(--cs-text-secondary)]">← Onboarding</a>
  </div>

  {#if form?.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}
  {#if form?.success || form?.reviewSuccess}
    <div class="rounded-md bg-green-50 p-3 text-sm text-green-700">Updated successfully.</div>
  {/if}

  <!-- Header -->
  <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-6">
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold text-[var(--cs-text)]">{getMemberName(data.memberDid)}</h1>
        <p class="mt-1 text-sm text-[var(--cs-text-muted)]">
          Started {new Date(progress.createdAt).toLocaleDateString()}
          {#if progress.probationEndsAt}
            · Probation ends {new Date(progress.probationEndsAt).toLocaleDateString()}
          {/if}
        </p>
      </div>
      <Badge variant={statusToVariant(progress.status)}>{progress.status}</Badge>
    </div>

    {#if progress.buddyDid}
      <p class="mt-3 text-sm text-[var(--cs-text-secondary)]">
        Buddy: <strong>{getMemberName(progress.buddyDid)}</strong>
      </p>
    {/if}

    {#if progress.status !== 'completed'}
      <div class="mt-4 flex gap-2 border-t border-[var(--cs-border)] pt-4">
        {#if !progress.buddyDid && config?.buddySystemEnabled}
          <button type="button" onclick={() => (buddyModalOpen = true)}
            class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]">
            Assign buddy
          </button>
        {/if}
        <button type="button" onclick={() => (reviewModalOpen = true)}
          class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]">
          Add review
        </button>
        <button type="button" onclick={() => (completeModalOpen = true)}
          class="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">
          Complete onboarding
        </button>
      </div>
    {/if}
  </div>

  <!-- Checklist -->
  <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-6">
    <h2 class="mb-4 text-sm font-semibold text-[var(--cs-text)]">Checklist</h2>
    <div class="space-y-3">
      <!-- Training -->
      {#if config?.requireTraining}
        <div class="flex items-center justify-between rounded-md border border-[var(--cs-border)] px-4 py-3">
          <div class="flex items-center gap-3">
            <span class="text-lg">{progress.trainingCompleted ? '✓' : '○'}</span>
            <div>
              <span class="text-sm font-medium text-[var(--cs-text)]">Training</span>
              {#if progress.trainingCompletedAt}
                <span class="ml-2 text-xs text-[var(--cs-text-muted)]">
                  Completed {new Date(progress.trainingCompletedAt).toLocaleDateString()}
                </span>
              {/if}
            </div>
          </div>
          {#if !progress.trainingCompleted && progress.status !== 'completed'}
            <form method="POST" action="?/completeTraining" use:enhance class="inline">
              <input type="hidden" name="memberDid" value={data.memberDid} />
              <button type="submit" class="text-xs text-[var(--cs-primary)] hover:underline">Mark done</button>
            </form>
          {/if}
        </div>
      {/if}

      <!-- Buy-in -->
      {#if config?.requireBuyIn}
        <div class="flex items-center justify-between rounded-md border border-[var(--cs-border)] px-4 py-3">
          <div class="flex items-center gap-3">
            <span class="text-lg">{progress.buyInCompleted ? '✓' : '○'}</span>
            <div>
              <span class="text-sm font-medium text-[var(--cs-text)]">
                Buy-in{#if config.buyInAmount} (${config.buyInAmount}){/if}
              </span>
              {#if progress.buyInCompletedAt}
                <span class="ml-2 text-xs text-[var(--cs-text-muted)]">
                  Completed {new Date(progress.buyInCompletedAt).toLocaleDateString()}
                </span>
              {/if}
            </div>
          </div>
          {#if !progress.buyInCompleted && progress.status !== 'completed'}
            <form method="POST" action="?/completeBuyIn" use:enhance class="inline">
              <input type="hidden" name="memberDid" value={data.memberDid} />
              <button type="submit" class="text-xs text-[var(--cs-primary)] hover:underline">Mark done</button>
            </form>
          {/if}
        </div>
      {/if}

      <!-- Milestones -->
      {#if config?.milestones && config.milestones.length > 0}
        {#each config.milestones as milestone}
          {@const completed = progress.milestonesCompleted.includes(milestone.name)}
          <div class="flex items-center justify-between rounded-md border border-[var(--cs-border)] px-4 py-3">
            <div class="flex items-center gap-3">
              <span class="text-lg">{completed ? '✓' : '○'}</span>
              <div>
                <span class="text-sm font-medium text-[var(--cs-text)]">{milestone.name}</span>
                {#if milestone.description}
                  <p class="text-xs text-[var(--cs-text-muted)]">{milestone.description}</p>
                {/if}
              </div>
            </div>
            {#if !completed && progress.status !== 'completed'}
              <form method="POST" action="?/completeMilestone" use:enhance class="inline">
                <input type="hidden" name="memberDid" value={data.memberDid} />
                <input type="hidden" name="milestoneName" value={milestone.name} />
                <button type="submit" class="text-xs text-[var(--cs-primary)] hover:underline">Mark done</button>
              </form>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  </div>

  <!-- Reviews -->
  {#if data.reviews.length > 0}
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
      <h2 class="border-b border-[var(--cs-border)] px-5 py-4 text-sm font-semibold text-[var(--cs-text)]">
        Reviews ({data.reviews.length})
      </h2>
      <ul class="divide-y divide-[var(--cs-border)]">
        {#each data.reviews as review}
          <li class="px-5 py-3">
            <div class="flex items-center gap-3">
              <Badge variant={outcomeToVariant(review.outcome)}>{review.outcome}</Badge>
              <span class="text-sm font-medium text-[var(--cs-text)]">{review.reviewType}</span>
              {#if review.milestoneName}
                <span class="text-xs text-[var(--cs-text-muted)]">({review.milestoneName})</span>
              {/if}
              <span class="ml-auto text-xs text-[var(--cs-text-muted)]">
                by {getMemberName(review.reviewerDid)} · {new Date(review.createdAt).toLocaleDateString()}
              </span>
            </div>
            {#if review.comments}
              <p class="mt-1 text-sm text-[var(--cs-text-secondary)]">{review.comments}</p>
            {/if}
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>

<!-- Assign Buddy Modal -->
<Modal open={buddyModalOpen} title="Assign Buddy" onclose={() => (buddyModalOpen = false)}>
  <form method="POST" action="?/assignBuddy"
    use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }}
    class="space-y-4">
    <input type="hidden" name="memberDid" value={data.memberDid} />
    <div>
      <label for="buddyDid" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Buddy</label>
      <select id="buddyDid" name="buddyDid" required
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]">
        <option value="">Select buddy…</option>
        {#each buddyCandidates as member}
          <option value={member.did}>{member.displayName}{member.handle ? ` (@${member.handle})` : ''}</option>
        {/each}
      </select>
    </div>
    <div class="flex justify-end gap-3">
      <button type="button" onclick={() => (buddyModalOpen = false)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]">Cancel</button>
      <button type="submit" disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50">
        {submitting ? 'Assigning…' : 'Assign'}
      </button>
    </div>
  </form>
</Modal>

<!-- Add Review Modal -->
<Modal open={reviewModalOpen} title="Add Review" onclose={() => (reviewModalOpen = false)}>
  <form method="POST" action="?/createReview"
    use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }}
    class="space-y-4">
    <input type="hidden" name="memberDid" value={data.memberDid} />
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="reviewType" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Type</label>
        <select id="reviewType" name="reviewType" required
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]">
          <option value="">Select type…</option>
          <option value="milestone">Milestone</option>
          <option value="periodic">Periodic</option>
          <option value="final">Final</option>
        </select>
      </div>
      <div>
        <label for="outcome" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Outcome</label>
        <select id="outcome" name="outcome" required
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]">
          <option value="">Select outcome…</option>
          <option value="pass">Pass</option>
          <option value="needs_improvement">Needs Improvement</option>
          <option value="fail">Fail</option>
        </select>
      </div>
    </div>
    <div>
      <label for="milestoneName" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
        Milestone Name <span class="text-[var(--cs-text-muted)]">(optional, for milestone reviews)</span>
      </label>
      <input id="milestoneName" name="milestoneName" type="text"
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
    </div>
    <div>
      <label for="comments" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
        Comments <span class="text-[var(--cs-text-muted)]">(optional)</span>
      </label>
      <textarea id="comments" name="comments" rows={3}
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"></textarea>
    </div>
    <div class="flex justify-end gap-3">
      <button type="button" onclick={() => (reviewModalOpen = false)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]">Cancel</button>
      <button type="submit" disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50">
        {submitting ? 'Saving…' : 'Submit review'}
      </button>
    </div>
  </form>
</Modal>

<!-- Complete Onboarding Confirmation -->
<Modal open={completeModalOpen} title="Complete Onboarding" onclose={() => (completeModalOpen = false)}>
  <p class="mb-4 text-sm text-[var(--cs-text-secondary)]">
    Mark {getMemberName(data.memberDid)}'s onboarding as complete?
  </p>
  <form method="POST" action="?/completeOnboarding" use:enhance>
    <input type="hidden" name="memberDid" value={data.memberDid} />
    <div class="flex justify-end gap-3">
      <button type="button" onclick={() => (completeModalOpen = false)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]">Cancel</button>
      <button type="submit"
        class="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">Complete</button>
    </div>
  </form>
</Modal>
