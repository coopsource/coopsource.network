<script lang="ts">
  import { EmptyState, Tabs } from '$lib/components/ui';
  import { workspacePrefix } from '$lib/utils/workspace.js';

  let { data } = $props();

  let activeTab = $state('overview');

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'patronage', label: 'Patronage', count: data.patronageConfigs.length },
    { id: 'capital', label: 'Capital Accounts' },
    { id: 'tax', label: 'Tax Forms' },
  ];

  function fmt(n: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  }
</script>

<svelte:head>
  <title>Finance — Co-op Source</title>
</svelte:head>

<div class="space-y-4">
  <h1 class="text-xl font-semibold text-[var(--cs-text)]">Finance</h1>

  <Tabs {tabs} bind:active={activeTab} />

  {#if activeTab === 'overview'}
    <!-- Summary Cards -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-5">
        <p class="text-sm text-[var(--cs-text-muted)]">Total Balance</p>
        <p class="mt-1 text-2xl font-semibold text-[var(--cs-text)]">
          {data.capitalSummary ? fmt(data.capitalSummary.totalBalance) : '—'}
        </p>
      </div>
      <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-5">
        <p class="text-sm text-[var(--cs-text-muted)]">Capital Accounts</p>
        <p class="mt-1 text-2xl font-semibold text-[var(--cs-text)]">
          {data.capitalSummary?.totalAccounts ?? 0}
        </p>
      </div>
      <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-5">
        <p class="text-sm text-[var(--cs-text-muted)]">Patronage Configs</p>
        <p class="mt-1 text-2xl font-semibold text-[var(--cs-text)]">
          {data.patronageConfigs.length}
        </p>
      </div>
    </div>

    {#if data.capitalSummary}
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-5">
          <p class="text-sm text-[var(--cs-text-muted)]">Total Contributions</p>
          <p class="mt-1 text-lg font-medium text-[var(--cs-text)]">{fmt(data.capitalSummary.totalContributions)}</p>
        </div>
        <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-5">
          <p class="text-sm text-[var(--cs-text-muted)]">Total Allocated</p>
          <p class="mt-1 text-lg font-medium text-[var(--cs-text)]">{fmt(data.capitalSummary.totalAllocated)}</p>
        </div>
        <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-5">
          <p class="text-sm text-[var(--cs-text-muted)]">Total Redeemed</p>
          <p class="mt-1 text-lg font-medium text-[var(--cs-text)]">{fmt(data.capitalSummary.totalRedeemed)}</p>
        </div>
      </div>
    {/if}

    <!-- Quick links -->
    <div class="flex gap-3">
      <a href="{$workspacePrefix}/finance/patronage"
        class="rounded-md border border-[var(--cs-border)] px-4 py-2 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]">
        Manage Patronage
      </a>
      <a href="{$workspacePrefix}/finance/capital-accounts"
        class="rounded-md border border-[var(--cs-border)] px-4 py-2 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]">
        Capital Accounts
      </a>
      <a href="{$workspacePrefix}/finance/tax-forms"
        class="rounded-md border border-[var(--cs-border)] px-4 py-2 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]">
        Tax Forms
      </a>
    </div>
  {/if}

  {#if activeTab === 'patronage'}
    {#if data.patronageConfigs.length === 0}
      <EmptyState title="No patronage configs" description="Set up patronage allocation rules." />
    {:else}
      <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-[var(--cs-border)] text-left">
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Stakeholder Class</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Metric Type</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Cash Payout %</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[var(--cs-border)]">
            {#each data.patronageConfigs as config}
              <tr>
                <td class="px-4 py-3 font-medium text-[var(--cs-text)]">{config.stakeholderClass}</td>
                <td class="px-4 py-3 text-[var(--cs-text-secondary)]">{config.metricType}</td>
                <td class="px-4 py-3 text-[var(--cs-text-secondary)]">{config.cashPayoutPct}%</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
    <a href="{$workspacePrefix}/finance/patronage"
      class="inline-block rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]">
      Manage patronage
    </a>
  {/if}

  {#if activeTab === 'capital'}
    <a href="{$workspacePrefix}/finance/capital-accounts"
      class="inline-block rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]">
      View all accounts
    </a>
  {/if}

  {#if activeTab === 'tax'}
    <a href="{$workspacePrefix}/finance/tax-forms"
      class="inline-block rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]">
      View tax forms
    </a>
  {/if}
</div>
