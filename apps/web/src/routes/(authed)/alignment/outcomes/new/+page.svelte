<script lang="ts">
  import { enhance } from '$app/forms';

  let { form } = $props();
  let submitting = $state(false);
  let criteriaCount = $state(0);
</script>

<svelte:head>
  <title>New Outcome — Co-op Source</title>
</svelte:head>

<div class="mx-auto max-w-lg space-y-6">
  <div>
    <a href="/alignment" class="text-sm text-gray-500 hover:text-gray-700">&larr; Alignment</a>
    <h1 class="mt-1 text-xl font-semibold text-gray-900">Create Desired Outcome</h1>
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
    class="space-y-4"
  >
    <div>
      <label for="title" class="block text-sm font-medium text-gray-700">Title</label>
      <input
        id="title"
        name="title"
        type="text"
        required
        maxlength="255"
        class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
    </div>

    <div>
      <label for="description" class="block text-sm font-medium text-gray-700">Description</label>
      <textarea
        id="description"
        name="description"
        rows="3"
        maxlength="3000"
        class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      ></textarea>
    </div>

    <div>
      <label for="category" class="block text-sm font-medium text-gray-700">Category</label>
      <select
        id="category"
        name="category"
        class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
      >
        <option value="financial">Financial</option>
        <option value="social">Social</option>
        <option value="environmental">Environmental</option>
        <option value="governance">Governance</option>
        <option value="other">Other</option>
      </select>
    </div>

    <!-- Success Criteria -->
    <fieldset class="space-y-3">
      <legend class="text-sm font-medium text-gray-700">Success Criteria (optional)</legend>
      <input type="hidden" name="criteriaCount" value={criteriaCount} />

      {#each Array(criteriaCount) as _, i}
        <div class="rounded-md border border-gray-200 p-3 space-y-2">
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label for="criteria_metric_{i}" class="block text-xs text-gray-600">Metric</label>
              <input
                id="criteria_metric_{i}"
                name="criteria_metric_{i}"
                type="text"
                maxlength="500"
                class="mt-0.5 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label for="criteria_target_{i}" class="block text-xs text-gray-600">Target</label>
              <input
                id="criteria_target_{i}"
                name="criteria_target_{i}"
                type="text"
                maxlength="500"
                class="mt-0.5 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
              />
            </div>
          </div>
          <div>
            <label for="criteria_timeline_{i}" class="block text-xs text-gray-600">Timeline (optional)</label>
            <input
              id="criteria_timeline_{i}"
              name="criteria_timeline_{i}"
              type="text"
              maxlength="200"
              class="mt-0.5 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
            />
          </div>
        </div>
      {/each}

      <button
        type="button"
        onclick={() => criteriaCount++}
        class="text-xs text-indigo-600 hover:text-indigo-700"
      >
        + Add Criterion
      </button>
    </fieldset>

    <div class="flex gap-3 pt-2">
      <button
        type="submit"
        disabled={submitting}
        class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {submitting ? 'Creating…' : 'Create Outcome'}
      </button>
      <a href="/alignment" class="rounded-md px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</a>
    </div>
  </form>
</div>
