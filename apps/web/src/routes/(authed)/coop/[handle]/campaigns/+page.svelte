<script lang="ts">
  import { workspacePrefix } from '$lib/utils/workspace.js';

  let { data } = $props();

  const statusFilters = [
    { value: '', label: 'All' },
    { value: 'draft', label: 'Draft' },
    { value: 'active', label: 'Active' },
    { value: 'funded', label: 'Funded' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  function statusBadgeClass(status: string): string {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700';
      case 'funded': return 'bg-blue-100 text-blue-700';
      case 'completed': return 'bg-gray-100 text-gray-700';
      case 'cancelled': return 'bg-red-100 text-red-700';
      default: return 'bg-yellow-100 text-yellow-700';
    }
  }

  function formatCurrency(cents: number, currency: string): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format(cents / 100);
  }

  function progressPercent(raised: number, goal: number): number {
    if (goal <= 0) return 0;
    return Math.min(100, Math.round((raised / goal) * 100));
  }
</script>

<svelte:head>
  <title>Campaigns — Co-op Source</title>
</svelte:head>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">Funding Campaigns</h1>
    <a href="{$workspacePrefix}/campaigns/new" class="rounded-md bg-[var(--cs-primary)] px-3 py-2 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]">New Campaign</a>
  </div>

  <div class="flex gap-2">
    {#each statusFilters as filter}
      <a
        href="{$workspacePrefix}/campaigns{filter.value ? `?status=${filter.value}` : ''}"
        class="rounded-full px-3 py-1 text-xs font-medium transition-colors {data.filterStatus === filter.value ? 'bg-[var(--cs-primary)] text-[var(--cs-text-on-primary)]' : 'bg-[var(--cs-bg-inset)] text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-hover)]'}"
      >
        {filter.label}
      </a>
    {/each}
  </div>

  {#if data.campaigns.length === 0}
    <div class="rounded-lg border border-dashed border-[var(--cs-border)] p-8 text-center">
      <p class="text-sm text-[var(--cs-text-muted)]">No campaigns yet.</p>
    </div>
  {:else}
    <div class="space-y-3">
      {#each data.campaigns as campaign}
        <a href="{$workspacePrefix}/campaigns/{encodeURIComponent(campaign.uri)}" class="block rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4 transition-shadow hover:shadow-sm">
          <div class="flex items-start justify-between">
            <div class="space-y-1">
              <h2 class="font-medium text-[var(--cs-text)]">{campaign.title}</h2>
              {#if campaign.description}
                <p class="text-sm text-[var(--cs-text-muted)] line-clamp-2">{campaign.description}</p>
              {/if}
            </div>
            <span class="rounded-full px-2 py-0.5 text-xs font-medium {statusBadgeClass(campaign.status)}">{campaign.status}</span>
          </div>
          <div class="mt-3">
            <div class="flex items-center justify-between text-sm">
              <span class="text-[var(--cs-text-secondary)]">{formatCurrency(campaign.amountRaised, campaign.goalCurrency)} of {formatCurrency(campaign.goalAmount, campaign.goalCurrency)}</span>
              <span class="text-[var(--cs-text-muted)]">{campaign.backerCount} backers</span>
            </div>
            <div class="mt-1 h-2 overflow-hidden rounded-full bg-[var(--cs-bg-inset)]">
              <div class="h-full rounded-full bg-[var(--cs-primary)] transition-all" style="width: {progressPercent(campaign.amountRaised, campaign.goalAmount)}%"></div>
            </div>
          </div>
          <div class="mt-2 flex gap-3 text-xs text-[var(--cs-text-muted)]">
            <span>{campaign.tier}</span>
            <span>{campaign.campaignType}</span>
            <span>{campaign.fundingModel.replace('_', ' ')}</span>
          </div>
        </a>
      {/each}
    </div>
  {/if}

  {#if data.cursor}
    <div class="text-center">
      <a href="?cursor={data.cursor}{data.filterStatus ? `&status=${data.filterStatus}` : ''}" class="text-sm text-[var(--cs-primary)] hover:text-[var(--cs-primary-hover)]">Load more</a>
    </div>
  {/if}
</div>
