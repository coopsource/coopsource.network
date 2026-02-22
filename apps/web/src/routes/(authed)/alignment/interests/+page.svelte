<script lang="ts">
  import { enhance } from '$app/forms';
  import { tick } from 'svelte';

  let { data, form } = $props();
  let submitting = $state(false);

  const isUpdate = $derived(data.myInterests !== null);

  // Dynamic form arrays
  let interestCount = $state(data.myInterests?.interests.length ?? 1);
  let contributionCount = $state(data.myInterests?.contributions.length ?? 0);
  let constraintCount = $state(data.myInterests?.constraints.length ?? 0);
  let redLineCount = $state(data.myInterests?.redLines.length ?? 0);

  const existing = data.myInterests;

  // Pre-populate form fields on mount (edit mode only)
  $effect(() => {
    if (!existing) return;
    tick().then(() => {
      for (let i = 0; i < existing.interests.length; i++) {
        const cat = document.getElementById(`interest_category_${i}`) as HTMLInputElement | null;
        const pri = document.getElementById(`interest_priority_${i}`) as HTMLInputElement | null;
        if (cat) cat.value = existing.interests[i]?.category ?? '';
        if (pri) pri.value = String(existing.interests[i]?.priority ?? 3);
      }
      for (let i = 0; i < existing.contributions.length; i++) {
        const cap = document.getElementById(`contribution_capacity_${i}`) as HTMLInputElement | null;
        if (cap) cap.value = existing.contributions[i]?.capacity ?? '';
      }
      for (let i = 0; i < existing.redLines.length; i++) {
        const reason = document.getElementById(`redline_reason_${i}`) as HTMLInputElement | null;
        if (reason) reason.value = existing.redLines[i]?.reason ?? '';
      }
      // Preferences
      const dm = document.getElementById('pref_decisionMaking') as HTMLInputElement | null;
      const comm = document.getElementById('pref_communication') as HTMLInputElement | null;
      const pace = document.getElementById('pref_pace') as HTMLInputElement | null;
      if (dm) dm.value = existing.preferences?.decisionMaking ?? '';
      if (comm) comm.value = existing.preferences?.communication ?? '';
      if (pace) pace.value = existing.preferences?.pace ?? '';
    });
  });
</script>

<svelte:head>
  <title>{isUpdate ? 'Edit' : 'Submit'} Interests — Co-op Source</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
  <div>
    <a href="/alignment" class="text-sm text-gray-500 hover:text-gray-700">&larr; Alignment</a>
    <h1 class="mt-1 text-xl font-semibold text-gray-900">
      {isUpdate ? 'Edit My Interests' : 'Submit My Interests'}
    </h1>
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
    class="space-y-6"
  >
    {#if isUpdate}
      <input type="hidden" name="_action" value="update" />
    {/if}

    <!-- Interests -->
    <fieldset class="space-y-3">
      <legend class="text-sm font-medium text-gray-900">Interests & Goals</legend>
      <input type="hidden" name="interestCount" value={interestCount} />

      {#each Array(interestCount) as _, i}
        <div class="rounded-md border border-gray-200 p-3 space-y-2">
          <div class="grid grid-cols-3 gap-2">
            <div>
              <label for="interest_category_{i}" class="block text-xs text-gray-600">Category</label>
              <input
                id="interest_category_{i}"
                name="interest_category_{i}"
                type="text"
                required
                maxlength="100"
                class="mt-0.5 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label for="interest_priority_{i}" class="block text-xs text-gray-600">Priority (1-5)</label>
              <input
                id="interest_priority_{i}"
                name="interest_priority_{i}"
                type="number"
                min="1"
                max="5"
                value="3"
                class="mt-0.5 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label for="interest_scope_{i}" class="block text-xs text-gray-600">Scope</label>
              <select
                id="interest_scope_{i}"
                name="interest_scope_{i}"
                class="mt-0.5 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
              >
                <option value="">—</option>
                <option value="short-term" selected={existing?.interests[i]?.scope === 'short-term'}>Short-term</option>
                <option value="medium-term" selected={existing?.interests[i]?.scope === 'medium-term'}>Medium-term</option>
                <option value="long-term" selected={existing?.interests[i]?.scope === 'long-term'}>Long-term</option>
              </select>
            </div>
          </div>
          <div>
            <label for="interest_description_{i}" class="block text-xs text-gray-600">Description</label>
            <textarea
              id="interest_description_{i}"
              name="interest_description_{i}"
              required
              maxlength="2000"
              rows="2"
              class="mt-0.5 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
            >{existing?.interests[i]?.description ?? ''}</textarea>
          </div>
        </div>
      {/each}

      <button
        type="button"
        onclick={() => interestCount++}
        class="text-xs text-indigo-600 hover:text-indigo-700"
      >
        + Add Interest
      </button>
    </fieldset>

    <!-- Contributions -->
    <fieldset class="space-y-3">
      <legend class="text-sm font-medium text-gray-900">Contributions (optional)</legend>
      <input type="hidden" name="contributionCount" value={contributionCount} />

      {#each Array(contributionCount) as _, i}
        <div class="rounded-md border border-gray-200 p-3 space-y-2">
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label for="contribution_type_{i}" class="block text-xs text-gray-600">Type</label>
              <select
                id="contribution_type_{i}"
                name="contribution_type_{i}"
                class="mt-0.5 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
              >
                <option value="skill" selected={existing?.contributions[i]?.type === 'skill'}>Skill</option>
                <option value="resource" selected={existing?.contributions[i]?.type === 'resource'}>Resource</option>
                <option value="capital" selected={existing?.contributions[i]?.type === 'capital'}>Capital</option>
                <option value="network" selected={existing?.contributions[i]?.type === 'network'}>Network</option>
                <option value="time" selected={existing?.contributions[i]?.type === 'time'}>Time</option>
              </select>
            </div>
            <div>
              <label for="contribution_capacity_{i}" class="block text-xs text-gray-600">Capacity</label>
              <input
                id="contribution_capacity_{i}"
                name="contribution_capacity_{i}"
                type="text"
                maxlength="500"
                class="mt-0.5 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
              />
            </div>
          </div>
          <div>
            <label for="contribution_description_{i}" class="block text-xs text-gray-600">Description</label>
            <textarea
              id="contribution_description_{i}"
              name="contribution_description_{i}"
              maxlength="2000"
              rows="2"
              class="mt-0.5 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
            >{existing?.contributions[i]?.description ?? ''}</textarea>
          </div>
        </div>
      {/each}

      <button
        type="button"
        onclick={() => contributionCount++}
        class="text-xs text-indigo-600 hover:text-indigo-700"
      >
        + Add Contribution
      </button>
    </fieldset>

    <!-- Constraints -->
    <fieldset class="space-y-3">
      <legend class="text-sm font-medium text-gray-900">Constraints (optional)</legend>
      <input type="hidden" name="constraintCount" value={constraintCount} />

      {#each Array(constraintCount) as _, i}
        <div class="rounded-md border border-gray-200 p-3 space-y-2">
          <div>
            <label for="constraint_description_{i}" class="block text-xs text-gray-600">Description</label>
            <textarea
              id="constraint_description_{i}"
              name="constraint_description_{i}"
              maxlength="2000"
              rows="2"
              class="mt-0.5 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
            >{existing?.constraints[i]?.description ?? ''}</textarea>
          </div>
          <label class="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              name="constraint_hard_{i}"
              checked={existing?.constraints[i]?.hardConstraint ?? false}
              class="rounded border-gray-300"
            />
            Hard constraint (non-negotiable)
          </label>
        </div>
      {/each}

      <button
        type="button"
        onclick={() => constraintCount++}
        class="text-xs text-indigo-600 hover:text-indigo-700"
      >
        + Add Constraint
      </button>
    </fieldset>

    <!-- Red Lines -->
    <fieldset class="space-y-3">
      <legend class="text-sm font-medium text-gray-900">Red Lines (optional)</legend>
      <input type="hidden" name="redLineCount" value={redLineCount} />

      {#each Array(redLineCount) as _, i}
        <div class="rounded-md border border-red-100 p-3 space-y-2">
          <div>
            <label for="redline_description_{i}" class="block text-xs text-gray-600">Description</label>
            <textarea
              id="redline_description_{i}"
              name="redline_description_{i}"
              maxlength="2000"
              rows="2"
              class="mt-0.5 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
            >{existing?.redLines[i]?.description ?? ''}</textarea>
          </div>
          <div>
            <label for="redline_reason_{i}" class="block text-xs text-gray-600">Reason (optional)</label>
            <input
              id="redline_reason_{i}"
              name="redline_reason_{i}"
              type="text"
              maxlength="2000"
              class="mt-0.5 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
            />
          </div>
        </div>
      {/each}

      <button
        type="button"
        onclick={() => redLineCount++}
        class="text-xs text-indigo-600 hover:text-indigo-700"
      >
        + Add Red Line
      </button>
    </fieldset>

    <!-- Work Preferences -->
    <fieldset class="space-y-3">
      <legend class="text-sm font-medium text-gray-900">Work Preferences (optional)</legend>

      <div>
        <label for="pref_decisionMaking" class="block text-xs text-gray-600">Decision Making</label>
        <input
          id="pref_decisionMaking"
          name="pref_decisionMaking"
          type="text"
          maxlength="500"
          placeholder="e.g., Consensus-based, majority vote"
          class="mt-0.5 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
        />
      </div>

      <div>
        <label for="pref_communication" class="block text-xs text-gray-600">Communication</label>
        <input
          id="pref_communication"
          name="pref_communication"
          type="text"
          maxlength="500"
          placeholder="e.g., Async-first, weekly syncs"
          class="mt-0.5 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
        />
      </div>

      <div>
        <label for="pref_pace" class="block text-xs text-gray-600">Pace</label>
        <input
          id="pref_pace"
          name="pref_pace"
          type="text"
          maxlength="500"
          placeholder="e.g., Steady iteration, rapid sprints"
          class="mt-0.5 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
        />
      </div>
    </fieldset>

    <div class="flex gap-3 pt-2">
      <button
        type="submit"
        disabled={submitting}
        class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {submitting ? 'Saving…' : isUpdate ? 'Update Interests' : 'Submit Interests'}
      </button>
      <a href="/alignment" class="rounded-md px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</a>
    </div>
  </form>
</div>
