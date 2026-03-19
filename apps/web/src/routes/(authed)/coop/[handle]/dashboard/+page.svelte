<script lang="ts">
  import { EmptyState } from '$lib/components/ui';
  import type { MemberEngagement, FinancialSummary, OperationalSummary } from '$lib/api/types.js';

  let { data } = $props();

  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  }

  function formatPercent(value: number): string {
    return `${Math.round(value * 100)}%`;
  }
</script>

<svelte:head>
  <title>Dashboard — Co-op Source</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">Dashboard</h1>
    <span class="text-sm text-[var(--cs-text-muted)]">{data.periodLabel}</span>
  </div>

  <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
    <!-- Engagement Card -->
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-5">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-[var(--cs-text-muted)]">Member Engagement</h2>
      <div class="mt-4 space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-sm text-[var(--cs-text-secondary)]">Voting Participation</span>
          <span class="text-sm font-medium text-[var(--cs-text)]">{formatPercent(data.engagement.votingParticipation)}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm text-[var(--cs-text-secondary)]">Proposals</span>
          <span class="text-sm font-medium text-[var(--cs-text)]">{data.engagement.proposalCount}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm text-[var(--cs-text-secondary)]">Agreements</span>
          <span class="text-sm font-medium text-[var(--cs-text)]">{data.engagement.agreementCount}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm text-[var(--cs-text-secondary)]">Total Members</span>
          <span class="text-sm font-medium text-[var(--cs-text)]">{data.engagement.memberCount}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm text-[var(--cs-text-secondary)]">Active Members</span>
          <span class="text-sm font-medium text-[var(--cs-text)]">{data.engagement.activeMemberCount}</span>
        </div>
      </div>
    </div>

    <!-- Financial Card -->
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-5">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-[var(--cs-text-muted)]">Financial Summary</h2>
      <div class="mt-4 space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-sm text-[var(--cs-text-secondary)]">Revenue</span>
          <span class="text-sm font-medium text-green-600">{formatCurrency(data.financial.totalRevenue)}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm text-[var(--cs-text-secondary)]">Expenses</span>
          <span class="text-sm font-medium text-red-600">{formatCurrency(data.financial.totalExpenses)}</span>
        </div>
        <div class="flex items-center justify-between border-t border-[var(--cs-border)] pt-2">
          <span class="text-sm font-medium text-[var(--cs-text-secondary)]">Net Income</span>
          <span class="text-sm font-semibold text-[var(--cs-text)]">{formatCurrency(data.financial.netIncome)}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm text-[var(--cs-text-secondary)]">Pending Expenses</span>
          <span class="text-sm font-medium text-orange-600">{formatCurrency(data.financial.pendingExpenses)}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm text-[var(--cs-text-secondary)]">Approved Expenses</span>
          <span class="text-sm font-medium text-[var(--cs-text)]">{formatCurrency(data.financial.approvedExpenses)}</span>
        </div>
      </div>
    </div>

    <!-- Operational Card -->
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-5">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-[var(--cs-text-muted)]">Operational Summary</h2>
      <div class="mt-4 space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-sm text-[var(--cs-text-secondary)]">Tasks Completed</span>
          <span class="text-sm font-medium text-green-600">{data.operational.tasksCompleted}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm text-[var(--cs-text-secondary)]">Tasks In Progress</span>
          <span class="text-sm font-medium text-blue-600">{data.operational.tasksInProgress}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm text-[var(--cs-text-secondary)]">Time Logged (hrs)</span>
          <span class="text-sm font-medium text-[var(--cs-text)]">{Math.round(data.operational.timeLogged / 60)}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm text-[var(--cs-text-secondary)]">Upcoming Compliance</span>
          <span class="text-sm font-medium {data.operational.upcomingCompliance > 0 ? 'text-orange-600' : 'text-[var(--cs-text)]'}">{data.operational.upcomingCompliance}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm text-[var(--cs-text-secondary)]">Active Agreements</span>
          <span class="text-sm font-medium text-[var(--cs-text)]">{data.operational.activeAgreements}</span>
        </div>
      </div>
    </div>
  </div>
</div>
