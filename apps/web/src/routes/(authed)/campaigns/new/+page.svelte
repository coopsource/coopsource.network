<script lang="ts">
  import { enhance } from '$app/forms';

  let { form } = $props();
  let submitting = $state(false);
</script>

<svelte:head>
  <title>New Campaign — Co-op Source</title>
</svelte:head>

<div class="mx-auto max-w-lg space-y-6">
  <h1 class="text-xl font-semibold text-gray-900">Create Campaign</h1>

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
        maxlength="256"
        class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
    </div>

    <div>
      <label for="description" class="block text-sm font-medium text-gray-700">Description</label>
      <textarea
        id="description"
        name="description"
        rows="3"
        maxlength="5000"
        class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      ></textarea>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="tier" class="block text-sm font-medium text-gray-700">Tier</label>
        <select id="tier" name="tier" class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
          <option value="cooperative">Cooperative</option>
          <option value="project">Project</option>
          <option value="network">Network</option>
        </select>
      </div>

      <div>
        <label for="campaignType" class="block text-sm font-medium text-gray-700">Type</label>
        <select id="campaignType" name="campaignType" class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
          <option value="donation">Donation</option>
          <option value="rewards">Rewards</option>
          <option value="patronage">Patronage</option>
          <option value="revenue_share">Revenue Share</option>
        </select>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="goalAmount" class="block text-sm font-medium text-gray-700">Goal Amount ($)</label>
        <input
          id="goalAmount"
          name="goalAmount"
          type="number"
          required
          min="1"
          step="1"
          class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label for="fundingModel" class="block text-sm font-medium text-gray-700">Funding Model</label>
        <select id="fundingModel" name="fundingModel" class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
          <option value="all_or_nothing">All or Nothing</option>
          <option value="keep_it_all">Keep It All</option>
        </select>
      </div>
    </div>

    <input type="hidden" name="goalCurrency" value="USD" />

    <div>
      <label for="endDate" class="block text-sm font-medium text-gray-700">End Date (optional)</label>
      <input
        id="endDate"
        name="endDate"
        type="date"
        class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
    </div>

    <div class="flex gap-3 pt-2">
      <button
        type="submit"
        disabled={submitting}
        class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {submitting ? 'Creating…' : 'Create Campaign'}
      </button>
      <a href="/campaigns" class="rounded-md px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</a>
    </div>
  </form>
</div>
