<script lang="ts">
  import { enhance } from '$app/forms';
  import { workspacePrefix } from '$lib/utils/workspace.js';

  let { data, form } = $props();
  let submitting = $state(false);

  const existing = data.myInterests;
  const isUpdate = $derived(existing !== null);

  // --- $state-backed form arrays ---

  interface InterestRow {
    category: string;
    description: string;
    priority: number;
    scope: string;
  }
  interface ContributionRow {
    type: string;
    description: string;
    capacity: string;
  }
  interface ConstraintRow {
    description: string;
    hardConstraint: boolean;
  }
  interface RedLineRow {
    description: string;
    reason: string;
  }

  let interests: InterestRow[] = $state(
    existing?.interests.length
      ? existing.interests.map((i) => ({
          category: i.category ?? '',
          description: i.description ?? '',
          priority: i.priority ?? 3,
          scope: i.scope ?? '',
        }))
      : [{ category: '', description: '', priority: 3, scope: '' }],
  );

  let contributions: ContributionRow[] = $state(
    existing?.contributions.length
      ? existing.contributions.map((c) => ({
          type: c.type ?? 'skill',
          description: c.description ?? '',
          capacity: c.capacity ?? '',
        }))
      : [],
  );

  let constraints: ConstraintRow[] = $state(
    existing?.constraints.length
      ? existing.constraints.map((c) => ({
          description: c.description ?? '',
          hardConstraint: c.hardConstraint ?? false,
        }))
      : [],
  );

  let redLines: RedLineRow[] = $state(
    existing?.redLines.length
      ? existing.redLines.map((r) => ({
          description: r.description ?? '',
          reason: r.reason ?? '',
        }))
      : [],
  );

  let prefDecisionMaking = $state(existing?.preferences?.decisionMaking ?? '');
  let prefCommunication = $state(existing?.preferences?.communication ?? '');
  let prefPace = $state(existing?.preferences?.pace ?? '');
</script>

<svelte:head>
  <title>{isUpdate ? 'Edit' : 'Submit'} Interests — Co-op Source</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
  <div>
    <a href="{$workspacePrefix}/alignment" class="text-sm text-[var(--cs-text-muted)] hover:text-[var(--cs-text)]">&larr; Alignment</a>
    <h1 class="mt-1 text-xl font-semibold text-[var(--cs-text)]">{isUpdate ? 'Edit My Interests' : 'Submit My Interests'}</h1>
  </div>

  {#if form?.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}

  <form method="POST" use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }} class="space-y-6">
    {#if isUpdate}
      <input type="hidden" name="_action" value="update" />
    {/if}

    <!-- Interests -->
    <fieldset class="space-y-3">
      <legend class="text-sm font-medium text-[var(--cs-text)]">Interests & Goals</legend>
      <input type="hidden" name="interestCount" value={interests.length} />
      {#each interests as interest, i}
        <div class="rounded-md border border-[var(--cs-border)] p-3 space-y-2">
          <div class="grid grid-cols-3 gap-2">
            <div>
              <label for="interest_category_{i}" class="block text-xs text-[var(--cs-text-secondary)]">Category</label>
              <input id="interest_category_{i}" name="interest_category_{i}" type="text" required maxlength="100" bind:value={interest.category} class="mt-0.5 block w-full rounded border border-[var(--cs-border)] px-2 py-1 text-sm" />
            </div>
            <div>
              <label for="interest_priority_{i}" class="block text-xs text-[var(--cs-text-secondary)]">Priority (1-5)</label>
              <input id="interest_priority_{i}" name="interest_priority_{i}" type="number" min="1" max="5" bind:value={interest.priority} class="mt-0.5 block w-full rounded border border-[var(--cs-border)] px-2 py-1 text-sm" />
            </div>
            <div>
              <label for="interest_scope_{i}" class="block text-xs text-[var(--cs-text-secondary)]">Scope</label>
              <select id="interest_scope_{i}" name="interest_scope_{i}" bind:value={interest.scope} class="mt-0.5 block w-full rounded border border-[var(--cs-border)] px-2 py-1 text-sm">
                <option value="">—</option>
                <option value="short-term">Short-term</option>
                <option value="medium-term">Medium-term</option>
                <option value="long-term">Long-term</option>
              </select>
            </div>
          </div>
          <div>
            <label for="interest_description_{i}" class="block text-xs text-[var(--cs-text-secondary)]">Description</label>
            <textarea id="interest_description_{i}" name="interest_description_{i}" required maxlength="2000" rows="2" bind:value={interest.description} class="mt-0.5 block w-full rounded border border-[var(--cs-border)] px-2 py-1 text-sm"></textarea>
          </div>
        </div>
      {/each}
      <button type="button" onclick={() => interests.push({ category: '', description: '', priority: 3, scope: '' })} class="text-xs text-[var(--cs-primary)] hover:text-[var(--cs-primary-hover)]">+ Add Interest</button>
    </fieldset>

    <!-- Contributions -->
    <fieldset class="space-y-3">
      <legend class="text-sm font-medium text-[var(--cs-text)]">Contributions (optional)</legend>
      <input type="hidden" name="contributionCount" value={contributions.length} />
      {#each contributions as contribution, i}
        <div class="rounded-md border border-[var(--cs-border)] p-3 space-y-2">
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label for="contribution_type_{i}" class="block text-xs text-[var(--cs-text-secondary)]">Type</label>
              <select id="contribution_type_{i}" name="contribution_type_{i}" bind:value={contribution.type} class="mt-0.5 block w-full rounded border border-[var(--cs-border)] px-2 py-1 text-sm">
                <option value="skill">Skill</option>
                <option value="resource">Resource</option>
                <option value="capital">Capital</option>
                <option value="network">Network</option>
                <option value="time">Time</option>
              </select>
            </div>
            <div>
              <label for="contribution_capacity_{i}" class="block text-xs text-[var(--cs-text-secondary)]">Capacity</label>
              <input id="contribution_capacity_{i}" name="contribution_capacity_{i}" type="text" maxlength="500" bind:value={contribution.capacity} class="mt-0.5 block w-full rounded border border-[var(--cs-border)] px-2 py-1 text-sm" />
            </div>
          </div>
          <div>
            <label for="contribution_description_{i}" class="block text-xs text-[var(--cs-text-secondary)]">Description</label>
            <textarea id="contribution_description_{i}" name="contribution_description_{i}" maxlength="2000" rows="2" bind:value={contribution.description} class="mt-0.5 block w-full rounded border border-[var(--cs-border)] px-2 py-1 text-sm"></textarea>
          </div>
        </div>
      {/each}
      <button type="button" onclick={() => contributions.push({ type: 'skill', description: '', capacity: '' })} class="text-xs text-[var(--cs-primary)] hover:text-[var(--cs-primary-hover)]">+ Add Contribution</button>
    </fieldset>

    <!-- Constraints -->
    <fieldset class="space-y-3">
      <legend class="text-sm font-medium text-[var(--cs-text)]">Constraints (optional)</legend>
      <input type="hidden" name="constraintCount" value={constraints.length} />
      {#each constraints as constraint, i}
        <div class="rounded-md border border-[var(--cs-border)] p-3 space-y-2">
          <div>
            <label for="constraint_description_{i}" class="block text-xs text-[var(--cs-text-secondary)]">Description</label>
            <textarea id="constraint_description_{i}" name="constraint_description_{i}" maxlength="2000" rows="2" bind:value={constraint.description} class="mt-0.5 block w-full rounded border border-[var(--cs-border)] px-2 py-1 text-sm"></textarea>
          </div>
          <label class="flex items-center gap-2 text-xs text-[var(--cs-text-secondary)]">
            <input type="checkbox" name="constraint_hard_{i}" bind:checked={constraint.hardConstraint} class="rounded border-[var(--cs-border)]" />
            Hard constraint (non-negotiable)
          </label>
        </div>
      {/each}
      <button type="button" onclick={() => constraints.push({ description: '', hardConstraint: false })} class="text-xs text-[var(--cs-primary)] hover:text-[var(--cs-primary-hover)]">+ Add Constraint</button>
    </fieldset>

    <!-- Red Lines -->
    <fieldset class="space-y-3">
      <legend class="text-sm font-medium text-[var(--cs-text)]">Red Lines (optional)</legend>
      <input type="hidden" name="redLineCount" value={redLines.length} />
      {#each redLines as redLine, i}
        <div class="rounded-md border border-red-100 p-3 space-y-2">
          <div>
            <label for="redline_description_{i}" class="block text-xs text-[var(--cs-text-secondary)]">Description</label>
            <textarea id="redline_description_{i}" name="redline_description_{i}" maxlength="2000" rows="2" bind:value={redLine.description} class="mt-0.5 block w-full rounded border border-[var(--cs-border)] px-2 py-1 text-sm"></textarea>
          </div>
          <div>
            <label for="redline_reason_{i}" class="block text-xs text-[var(--cs-text-secondary)]">Reason (optional)</label>
            <input id="redline_reason_{i}" name="redline_reason_{i}" type="text" maxlength="2000" bind:value={redLine.reason} class="mt-0.5 block w-full rounded border border-[var(--cs-border)] px-2 py-1 text-sm" />
          </div>
        </div>
      {/each}
      <button type="button" onclick={() => redLines.push({ description: '', reason: '' })} class="text-xs text-[var(--cs-primary)] hover:text-[var(--cs-primary-hover)]">+ Add Red Line</button>
    </fieldset>

    <!-- Work Preferences -->
    <fieldset class="space-y-3">
      <legend class="text-sm font-medium text-[var(--cs-text)]">Work Preferences (optional)</legend>
      <div>
        <label for="pref_decisionMaking" class="block text-xs text-[var(--cs-text-secondary)]">Decision Making</label>
        <input id="pref_decisionMaking" name="pref_decisionMaking" type="text" maxlength="500" placeholder="e.g., Consensus-based, majority vote" bind:value={prefDecisionMaking} class="mt-0.5 block w-full rounded border border-[var(--cs-border)] px-2 py-1 text-sm" />
      </div>
      <div>
        <label for="pref_communication" class="block text-xs text-[var(--cs-text-secondary)]">Communication</label>
        <input id="pref_communication" name="pref_communication" type="text" maxlength="500" placeholder="e.g., Async-first, weekly syncs" bind:value={prefCommunication} class="mt-0.5 block w-full rounded border border-[var(--cs-border)] px-2 py-1 text-sm" />
      </div>
      <div>
        <label for="pref_pace" class="block text-xs text-[var(--cs-text-secondary)]">Pace</label>
        <input id="pref_pace" name="pref_pace" type="text" maxlength="500" placeholder="e.g., Steady iteration, rapid sprints" bind:value={prefPace} class="mt-0.5 block w-full rounded border border-[var(--cs-border)] px-2 py-1 text-sm" />
      </div>
    </fieldset>

    <div class="flex gap-3 pt-2">
      <button type="submit" disabled={submitting} class="rounded-md bg-[var(--cs-primary)] px-4 py-2 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50">
        {submitting ? 'Saving...' : isUpdate ? 'Update Interests' : 'Submit Interests'}
      </button>
      <a href="{$workspacePrefix}/alignment" class="rounded-md px-4 py-2 text-sm text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)]">Cancel</a>
    </div>
  </form>
</div>
