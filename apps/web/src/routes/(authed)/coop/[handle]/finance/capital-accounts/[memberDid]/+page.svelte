<script lang="ts">
  import { Badge } from '$lib/components/ui';
  import { workspacePrefix } from '$lib/utils/workspace.js';
  import type { Member } from '$lib/api/types.js';

  let { data } = $props();

  function getMemberName(did: string): string {
    const member = data.members.find((m: Member) => m.did === did);
    return member?.displayName ?? did;
  }

  function fmt(n: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  }

  function txTypeVariant(type: string): 'success' | 'warning' | 'danger' | 'default' {
    switch (type) {
      case 'contribution': case 'patronage_allocation': return 'success';
      case 'redemption': return 'danger';
      default: return 'default';
    }
  }
</script>

<svelte:head>
  <title>{getMemberName(data.memberDid)} — Capital Account — Co-op Source</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6">
  <div class="flex items-center gap-3">
    <a href="{$workspacePrefix}/finance/capital-accounts" class="text-sm text-[var(--cs-text-muted)] hover:text-[var(--cs-text-secondary)]">← Capital Accounts</a>
  </div>

  <!-- Account Summary -->
  <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-6">
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">{getMemberName(data.memberDid)}</h1>
    <div class="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div>
        <p class="text-xs text-[var(--cs-text-muted)]">Contribution</p>
        <p class="mt-1 text-lg font-semibold text-[var(--cs-text)]">{fmt(data.account.initialContribution)}</p>
      </div>
      <div>
        <p class="text-xs text-[var(--cs-text-muted)]">Patronage</p>
        <p class="mt-1 text-lg font-semibold text-[var(--cs-text)]">{fmt(data.account.totalPatronageAllocated)}</p>
      </div>
      <div>
        <p class="text-xs text-[var(--cs-text-muted)]">Redeemed</p>
        <p class="mt-1 text-lg font-semibold text-[var(--cs-text)]">{fmt(data.account.totalRedeemed)}</p>
      </div>
      <div>
        <p class="text-xs text-[var(--cs-text-muted)]">Balance</p>
        <p class="mt-1 text-lg font-semibold text-[var(--cs-text)]">{fmt(data.account.balance)}</p>
      </div>
    </div>
  </div>

  <!-- Transactions -->
  <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
    <h2 class="border-b border-[var(--cs-border)] px-5 py-4 text-sm font-semibold text-[var(--cs-text)]">
      Transactions ({data.transactions.length})
    </h2>
    {#if data.transactions.length === 0}
      <p class="px-5 py-4 text-sm text-[var(--cs-text-muted)]">No transactions yet.</p>
    {:else}
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-[var(--cs-border)] text-left">
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Date</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Type</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Description</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)] text-right">Amount</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--cs-border)]">
          {#each data.transactions as tx}
            <tr>
              <td class="px-4 py-3 text-[var(--cs-text-muted)]">{new Date(tx.createdAt).toLocaleDateString()}</td>
              <td class="px-4 py-3"><Badge variant={txTypeVariant(tx.transactionType)}>{tx.transactionType}</Badge></td>
              <td class="px-4 py-3 text-[var(--cs-text-secondary)]">{tx.description ?? '—'}</td>
              <td class="px-4 py-3 text-right font-medium text-[var(--cs-text)]">{fmt(tx.amount)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>
