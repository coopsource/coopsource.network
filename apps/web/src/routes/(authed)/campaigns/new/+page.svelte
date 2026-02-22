<script lang="ts">
  import { goto } from '$app/navigation';

  let title = $state('');
  let description = $state('');
  let tier = $state<'network' | 'cooperative' | 'project'>('cooperative');
  let campaignType = $state<'rewards' | 'patronage' | 'donation' | 'revenue_share'>('donation');
  let goalAmount = $state(0);
  let goalCurrency = $state('USD');
  let fundingModel = $state<'all_or_nothing' | 'keep_it_all'>('all_or_nothing');
  let endDate = $state('');
  let submitting = $state(false);
  let error = $state('');

  async function handleSubmit() {
    if (!title.trim() || goalAmount <= 0) return;
    submitting = true;
    error = '';

    try {
      const res = await fetch('/api/v1/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          beneficiaryUri: 'self',
          title: title.trim(),
          description: description.trim() || undefined,
          tier,
          campaignType,
          goalAmount: Math.round(goalAmount * 100), // Convert dollars to cents
          goalCurrency,
          fundingModel,
          endDate: endDate || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        error = body.error ?? `Error ${res.status}`;
        return;
      }

      const campaign = await res.json() as { uri: string };
      goto(`/campaigns/${encodeURIComponent(campaign.uri)}`);
    } catch {
      error = 'Failed to create campaign';
    } finally {
      submitting = false;
    }
  }
</script>

<svelte:head>
  <title>New Campaign — Co-op Source</title>
</svelte:head>

<div class="mx-auto max-w-lg space-y-6">
  <h1 class="text-xl font-semibold text-gray-900">Create Campaign</h1>

  {#if error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
  {/if}

  <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-4">
    <div>
      <label for="title" class="block text-sm font-medium text-gray-700">Title</label>
      <input
        id="title"
        type="text"
        bind:value={title}
        required
        maxlength="256"
        class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
    </div>

    <div>
      <label for="description" class="block text-sm font-medium text-gray-700">Description</label>
      <textarea
        id="description"
        bind:value={description}
        rows="3"
        maxlength="5000"
        class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      ></textarea>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="tier" class="block text-sm font-medium text-gray-700">Tier</label>
        <select id="tier" bind:value={tier} class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
          <option value="cooperative">Cooperative</option>
          <option value="project">Project</option>
          <option value="network">Network</option>
        </select>
      </div>

      <div>
        <label for="campaignType" class="block text-sm font-medium text-gray-700">Type</label>
        <select id="campaignType" bind:value={campaignType} class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
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
          type="number"
          bind:value={goalAmount}
          required
          min="1"
          step="1"
          class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label for="fundingModel" class="block text-sm font-medium text-gray-700">Funding Model</label>
        <select id="fundingModel" bind:value={fundingModel} class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
          <option value="all_or_nothing">All or Nothing</option>
          <option value="keep_it_all">Keep It All</option>
        </select>
      </div>
    </div>

    <div>
      <label for="endDate" class="block text-sm font-medium text-gray-700">End Date (optional)</label>
      <input
        id="endDate"
        type="date"
        bind:value={endDate}
        class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
    </div>

    <div class="flex gap-3 pt-2">
      <button
        type="submit"
        disabled={submitting || !title.trim() || goalAmount <= 0}
        class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {submitting ? 'Creating…' : 'Create Campaign'}
      </button>
      <a href="/campaigns" class="rounded-md px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</a>
    </div>
  </form>
</div>
