<script lang="ts">
  import { enhance } from '$app/forms';
  import { EmptyState, Modal } from '$lib/components/ui';
  import { workspacePrefix } from '$lib/utils/workspace.js';
  import type { Member } from '$lib/api/types.js';

  let { data, form } = $props();

  let contributeOpen = $state(false);
  let redeemOpen = $state(false);
  let submitting = $state(false);

  $effect(() => {
    if (form?.success) {
      contributeOpen = false;
      redeemOpen = false;
    }
  });

  function getMemberName(did: string): string {
    const member = data.members.find((m: Member) => m.did === did);
    return member?.displayName ?? did;
  }

  function fmt(n: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  }
</script>

<svelte:head>
  <title>Capital Accounts — Co-op Source</title>
</svelte:head>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <a href="{$workspacePrefix}/finance" class="text-sm text-[var(--cs-text-muted)] hover:text-[var(--cs-text-secondary)]">← Finance</a>
      <h1 class="text-xl font-semibold text-[var(--cs-text)]">Capital Accounts</h1>
    </div>
    <div class="flex gap-2">
      <button type="button" onclick={() => (contributeOpen = true)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]">
        Record contribution
      </button>
      <button type="button" onclick={() => (redeemOpen = true)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]">
        Redeem
      </button>
    </div>
  </div>

  {#if form?.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}
  {#if form?.success}
    <div class="rounded-md bg-green-50 p-3 text-sm text-green-700">Transaction recorded successfully.</div>
  {/if}

  <!-- Summary -->
  {#if data.summary}
    <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4">
        <p class="text-xs text-[var(--cs-text-muted)]">Total Balance</p>
        <p class="mt-1 text-lg font-semibold text-[var(--cs-text)]">{fmt(data.summary.totalBalance)}</p>
      </div>
      <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4">
        <p class="text-xs text-[var(--cs-text-muted)]">Contributions</p>
        <p class="mt-1 text-lg font-semibold text-[var(--cs-text)]">{fmt(data.summary.totalContributions)}</p>
      </div>
      <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4">
        <p class="text-xs text-[var(--cs-text-muted)]">Allocated</p>
        <p class="mt-1 text-lg font-semibold text-[var(--cs-text)]">{fmt(data.summary.totalAllocated)}</p>
      </div>
      <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4">
        <p class="text-xs text-[var(--cs-text-muted)]">Redeemed</p>
        <p class="mt-1 text-lg font-semibold text-[var(--cs-text)]">{fmt(data.summary.totalRedeemed)}</p>
      </div>
    </div>
  {/if}

  {#if data.accounts.length === 0}
    <EmptyState title="No capital accounts" description="Record a member contribution to create an account." />
  {:else}
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-[var(--cs-border)] text-left">
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Member</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)] text-right">Contribution</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)] text-right">Patronage</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)] text-right">Redeemed</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)] text-right">Balance</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--cs-border)]">
          {#each data.accounts as account}
            <tr>
              <td class="px-4 py-3 font-medium text-[var(--cs-text)]">{getMemberName(account.memberDid)}</td>
              <td class="px-4 py-3 text-right text-[var(--cs-text-secondary)]">{fmt(account.initialContribution)}</td>
              <td class="px-4 py-3 text-right text-[var(--cs-text-secondary)]">{fmt(account.totalPatronageAllocated)}</td>
              <td class="px-4 py-3 text-right text-[var(--cs-text-secondary)]">{fmt(account.totalRedeemed)}</td>
              <td class="px-4 py-3 text-right font-medium text-[var(--cs-text)]">{fmt(account.balance)}</td>
              <td class="px-4 py-3 text-right">
                <a href="{$workspacePrefix}/finance/capital-accounts/{encodeURIComponent(account.memberDid)}"
                  class="text-xs text-[var(--cs-primary)] hover:underline">Details</a>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if data.accountsCursor}
      <div class="flex justify-center pt-2">
        <a href="?cursor={data.accountsCursor}" class="text-sm text-[var(--cs-primary)] hover:underline">Load more</a>
      </div>
    {/if}
  {/if}
</div>

<!-- Contribute Modal -->
<Modal open={contributeOpen} title="Record Contribution" onclose={() => (contributeOpen = false)}>
  <form method="POST" action="?/contribute"
    use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }}
    class="space-y-4">
    <div>
      <label for="contribMember" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Member</label>
      <select id="contribMember" name="memberDid" required
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]">
        <option value="">Select member…</option>
        {#each data.members as member}
          <option value={member.did}>{member.displayName}</option>
        {/each}
      </select>
    </div>
    <div>
      <label for="contribAmount" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Amount ($)</label>
      <input id="contribAmount" name="amount" type="number" step="0.01" min="0.01" required
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
    </div>
    <div class="flex justify-end gap-3">
      <button type="button" onclick={() => (contributeOpen = false)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]">Cancel</button>
      <button type="submit" disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50">
        {submitting ? 'Recording…' : 'Record'}
      </button>
    </div>
  </form>
</Modal>

<!-- Redeem Modal -->
<Modal open={redeemOpen} title="Redeem Allocation" onclose={() => (redeemOpen = false)}>
  <form method="POST" action="?/redeem"
    use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }}
    class="space-y-4">
    <div>
      <label for="redeemMember" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Member</label>
      <select id="redeemMember" name="memberDid" required
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]">
        <option value="">Select member…</option>
        {#each data.accounts as account}
          <option value={account.memberDid}>{getMemberName(account.memberDid)} (bal: {fmt(account.balance)})</option>
        {/each}
      </select>
    </div>
    <div>
      <label for="redeemAmount" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Amount ($)</label>
      <input id="redeemAmount" name="amount" type="number" step="0.01" min="0.01" required
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
    </div>
    <div class="flex justify-end gap-3">
      <button type="button" onclick={() => (redeemOpen = false)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]">Cancel</button>
      <button type="submit" disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50">
        {submitting ? 'Redeeming…' : 'Redeem'}
      </button>
    </div>
  </form>
</Modal>
