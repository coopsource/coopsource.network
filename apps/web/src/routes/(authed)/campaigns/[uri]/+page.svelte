<script lang="ts">
  import { enhance } from '$app/forms';

  let { data, form } = $props();
  let pledging = $state(false);
  let statusUpdating = $state(false);

  function formatCurrency(cents: number, currency: string): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
    }).format(cents / 100);
  }

  function progressPercent(raised: number, goal: number): number {
    if (goal <= 0) return 0;
    return Math.min(100, Math.round((raised / goal) * 100));
  }

  function statusBadgeClass(status: string): string {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700';
      case 'funded': return 'bg-blue-100 text-blue-700';
      case 'completed': return 'bg-gray-100 text-gray-700';
      case 'cancelled': return 'bg-red-100 text-red-700';
      default: return 'bg-yellow-100 text-yellow-700';
    }
  }

  const c = $derived(data.campaign);
  const progress = $derived(progressPercent(c.amountRaised, c.goalAmount));
</script>

<svelte:head>
  <title>{c.title} — Co-op Source</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
  <div class="flex items-start justify-between">
    <div>
      <a href="/campaigns" class="text-sm text-gray-500 hover:text-gray-700">&larr; Campaigns</a>
      <h1 class="mt-1 text-xl font-semibold text-gray-900">{c.title}</h1>
    </div>
    <span class="rounded-full px-2.5 py-1 text-xs font-medium {statusBadgeClass(c.status)}">
      {c.status}
    </span>
  </div>

  {#if c.description}
    <p class="text-sm text-gray-600">{c.description}</p>
  {/if}

  <!-- Progress -->
  <div class="rounded-lg border border-gray-200 bg-white p-4">
    <div class="flex items-end justify-between">
      <div>
        <p class="text-2xl font-bold text-gray-900">{formatCurrency(c.amountRaised, c.goalCurrency)}</p>
        <p class="text-sm text-gray-500">of {formatCurrency(c.goalAmount, c.goalCurrency)} goal</p>
      </div>
      <div class="text-right">
        <p class="text-lg font-semibold text-gray-900">{c.backerCount}</p>
        <p class="text-sm text-gray-500">backers</p>
      </div>
    </div>
    <div class="mt-3 h-3 overflow-hidden rounded-full bg-gray-100">
      <div
        class="h-full rounded-full bg-indigo-600 transition-all"
        style="width: {progress}%"
      ></div>
    </div>
    <p class="mt-1 text-right text-xs text-gray-400">{progress}% funded</p>
  </div>

  <!-- Details -->
  <div class="flex flex-wrap gap-4 text-sm text-gray-500">
    <span>Tier: <strong class="text-gray-700">{c.tier}</strong></span>
    <span>Type: <strong class="text-gray-700">{c.campaignType}</strong></span>
    <span>Model: <strong class="text-gray-700">{c.fundingModel.replace('_', ' ')}</strong></span>
    {#if c.endDate}
      <span>Ends: <strong class="text-gray-700">{new Date(c.endDate).toLocaleDateString()}</strong></span>
    {/if}
  </div>

  <!-- Status Actions -->
  {#if c.status === 'draft'}
    <form
      method="POST"
      action="?/updateStatus"
      use:enhance={() => {
        statusUpdating = true;
        return async ({ update }) => {
          statusUpdating = false;
          await update();
        };
      }}
    >
      <input type="hidden" name="status" value="active" />
      <button
        type="submit"
        disabled={statusUpdating}
        class="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
      >
        {statusUpdating ? 'Activating…' : 'Activate Campaign'}
      </button>
    </form>
  {/if}

  <!-- Pledge Form -->
  {#if c.status === 'active'}
    <div class="rounded-lg border border-gray-200 bg-white p-4">
      <h2 class="text-sm font-medium text-gray-900">Make a Pledge</h2>
      {#if form?.pledgeError}
        <div class="mt-2 rounded-md bg-red-50 p-2 text-sm text-red-700">{form.pledgeError}</div>
      {/if}
      <form
        method="POST"
        action="?/pledge"
        use:enhance={() => {
          pledging = true;
          return async ({ update }) => {
            pledging = false;
            await update();
          };
        }}
        class="mt-3 flex gap-3"
      >
        <div class="flex-1">
          <input
            name="amount"
            type="number"
            min="1"
            step="1"
            placeholder="Amount ($)"
            required
            class="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <button
          type="submit"
          disabled={pledging}
          class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {pledging ? 'Pledging…' : 'Pledge'}
        </button>
      </form>
    </div>
  {/if}

  <!-- Pledges List -->
  {#if data.pledges.length > 0}
    <div>
      <h2 class="mb-2 text-sm font-medium text-gray-900">Recent Pledges</h2>
      <div class="space-y-2">
        {#each data.pledges as pledge}
          <div class="flex items-center justify-between rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
            <span class="text-gray-600">{pledge.backerDid.slice(0, 20)}…</span>
            <div class="flex items-center gap-2">
              <span class="font-medium text-gray-900">{formatCurrency(pledge.amount, pledge.currency)}</span>
              <span class="rounded-full px-1.5 py-0.5 text-xs {pledge.paymentStatus === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}">
                {pledge.paymentStatus}
              </span>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
