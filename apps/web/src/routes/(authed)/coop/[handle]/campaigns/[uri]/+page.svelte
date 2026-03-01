<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/stores';
  import { workspacePrefix } from '$lib/utils/workspace.js';

  let { data, form } = $props();
  let pledging = $state(false);
  let statusUpdating = $state(false);

  function formatCurrency(cents: number, currency: string): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format(cents / 100);
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
  const hasProviders = $derived(data.paymentProviders.length > 0);
  const paymentStatus = $derived($page.url.searchParams.get('payment'));
</script>

<svelte:head>
  <title>{c.title} — Co-op Source</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
  {#if paymentStatus === 'success'}
    <div class="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
      Payment completed successfully. Your pledge has been recorded.
    </div>
  {:else if paymentStatus === 'cancelled'}
    <div class="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
      Payment was cancelled. Your pledge remains pending.
    </div>
  {/if}

  <div class="flex items-start justify-between">
    <div>
      <a href="{$workspacePrefix}/campaigns" class="text-sm text-[var(--cs-text-muted)] hover:text-[var(--cs-text)]">&larr; Campaigns</a>
      <h1 class="mt-1 text-xl font-semibold text-[var(--cs-text)]">{c.title}</h1>
    </div>
    <span class="rounded-full px-2.5 py-1 text-xs font-medium {statusBadgeClass(c.status)}">{c.status}</span>
  </div>

  {#if c.description}
    <p class="text-sm text-[var(--cs-text-secondary)]">{c.description}</p>
  {/if}

  <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4">
    <div class="flex items-end justify-between">
      <div>
        <p class="text-2xl font-bold text-[var(--cs-text)]">{formatCurrency(c.amountRaised, c.goalCurrency)}</p>
        <p class="text-sm text-[var(--cs-text-muted)]">of {formatCurrency(c.goalAmount, c.goalCurrency)} goal</p>
      </div>
      <div class="text-right">
        <p class="text-lg font-semibold text-[var(--cs-text)]">{c.backerCount}</p>
        <p class="text-sm text-[var(--cs-text-muted)]">backers</p>
      </div>
    </div>
    <div class="mt-3 h-3 overflow-hidden rounded-full bg-[var(--cs-bg-inset)]">
      <div class="h-full rounded-full bg-[var(--cs-primary)] transition-all" style="width: {progress}%"></div>
    </div>
    <p class="mt-1 text-right text-xs text-[var(--cs-text-muted)]">{progress}% funded</p>
  </div>

  <div class="flex flex-wrap gap-4 text-sm text-[var(--cs-text-muted)]">
    <span>Tier: <strong class="text-[var(--cs-text-secondary)]">{c.tier}</strong></span>
    <span>Type: <strong class="text-[var(--cs-text-secondary)]">{c.campaignType}</strong></span>
    <span>Model: <strong class="text-[var(--cs-text-secondary)]">{c.fundingModel.replace('_', ' ')}</strong></span>
    {#if c.endDate}
      <span>Ends: <strong class="text-[var(--cs-text-secondary)]">{new Date(c.endDate).toLocaleDateString()}</strong></span>
    {/if}
  </div>

  {#if c.status === 'draft'}
    <form method="POST" action="?/updateStatus" use:enhance={() => { statusUpdating = true; return async ({ update }) => { statusUpdating = false; await update(); }; }}>
      <input type="hidden" name="status" value="active" />
      <button type="submit" disabled={statusUpdating} class="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
        {statusUpdating ? 'Activating...' : 'Activate Campaign'}
      </button>
    </form>
  {/if}

  {#if c.status === 'active'}
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4">
      <h2 class="text-sm font-medium text-[var(--cs-text)]">Make a Pledge</h2>
      {#if form?.pledgeError}
        <div class="mt-2 rounded-md bg-red-50 p-2 text-sm text-red-700">{form.pledgeError}</div>
      {/if}
      {#if form?.pledgeSuccess}
        <div class="mt-2 rounded-md bg-green-50 p-2 text-sm text-green-700">
          {#if form?.offlineMode}
            Pledge recorded. Payment will be handled separately by the cooperative.
          {:else}
            Pledge recorded successfully.
          {/if}
        </div>
      {/if}
      <form method="POST" action="?/pledge" use:enhance={({ formData }) => {
        pledging = true;
        return async ({ result, update }) => {
          pledging = false;
          if (result.type === 'success' && result.data?.checkoutUrl) {
            window.location.href = result.data.checkoutUrl;
            return;
          }
          await update();
        };
      }} class="mt-3 space-y-3">
        <div class="flex gap-3">
          <div class="flex-1">
            <input name="amount" type="number" min="1" step="1" placeholder="Amount ($)" required class="block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
          </div>
        </div>

        {#if hasProviders}
          <div>
            <p class="mb-2 text-xs text-[var(--cs-text-muted)]">Pay with:</p>
            <div class="flex flex-wrap gap-2">
              {#each data.paymentProviders as provider}
                <button type="submit" name="providerId" value={provider.id} disabled={pledging} class="rounded-md border border-[var(--cs-border)] bg-[var(--cs-bg)] px-4 py-2 text-sm font-medium text-[var(--cs-text)] hover:bg-[var(--cs-bg-inset)] disabled:opacity-50">
                  {pledging ? 'Processing...' : `Pay with ${provider.displayName}`}
                </button>
              {/each}
              <button type="submit" name="providerId" value="" disabled={pledging} class="rounded-md border border-[var(--cs-border)] bg-[var(--cs-bg)] px-4 py-2 text-sm text-[var(--cs-text-muted)] hover:bg-[var(--cs-bg-inset)] disabled:opacity-50">
                {pledging ? 'Processing...' : 'Pledge without payment'}
              </button>
            </div>
          </div>
        {:else}
          <button type="submit" name="providerId" value="" disabled={pledging} class="rounded-md bg-[var(--cs-primary)] px-4 py-2 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50">
            {pledging ? 'Pledging...' : 'Pledge'}
          </button>
          <p class="text-xs text-[var(--cs-text-muted)]">No online payment providers configured. Payment will be handled by the cooperative.</p>
        {/if}
      </form>
    </div>
  {/if}

  {#if data.pledges.length > 0}
    <div>
      <h2 class="mb-2 text-sm font-medium text-[var(--cs-text)]">Recent Pledges</h2>
      <div class="space-y-2">
        {#each data.pledges as pledge}
          <div class="flex items-center justify-between rounded-md border border-[var(--cs-border)] bg-[var(--cs-bg-inset)] px-3 py-2 text-sm">
            <span class="text-[var(--cs-text-secondary)]">{pledge.backerDid.slice(0, 20)}...</span>
            <div class="flex items-center gap-2">
              <span class="font-medium text-[var(--cs-text)]">{formatCurrency(pledge.amount, pledge.currency)}</span>
              <span class="rounded-full px-1.5 py-0.5 text-xs {pledge.paymentStatus === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}">{pledge.paymentStatus}</span>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
