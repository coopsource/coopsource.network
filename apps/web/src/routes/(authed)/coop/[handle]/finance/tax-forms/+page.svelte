<script lang="ts">
  import { enhance } from '$app/forms';
  import { Badge, EmptyState, Modal } from '$lib/components/ui';
  import { workspacePrefix } from '$lib/utils/workspace.js';
  import type { Member } from '$lib/api/types.js';

  let { data, form } = $props();

  let generateOpen = $state(false);
  let submitting = $state(false);

  $effect(() => {
    if (form?.success) {
      generateOpen = false;
    }
  });

  function getMemberName(did: string): string {
    const member = data.members.find((m: Member) => m.did === did);
    return member?.displayName ?? did;
  }

  function fmt(n: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  }

  function statusToVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
    switch (status) {
      case 'sent': case 'paid': return 'success';
      case 'generated': return 'warning';
      case 'pending': return 'default';
      default: return 'default';
    }
  }

  const closedPeriods = $derived(data.fiscalPeriods.filter((p) => p.status === 'closed'));
</script>

<svelte:head>
  <title>Tax Forms 1099-PATR — Co-op Source</title>
</svelte:head>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <a href="{$workspacePrefix}/finance" class="text-sm text-[var(--cs-text-muted)] hover:text-[var(--cs-text-secondary)]">← Finance</a>
      <h1 class="text-xl font-semibold text-[var(--cs-text)]">1099-PATR Tax Forms</h1>
    </div>
    <button type="button" onclick={() => (generateOpen = true)}
      class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]">
      Generate forms
    </button>
  </div>

  {#if form?.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}
  {#if form?.success}
    <div class="rounded-md bg-green-50 p-3 text-sm text-green-700">Tax forms updated.</div>
  {/if}

  <!-- Deadlines -->
  {#if data.deadlines.length > 0}
    <div class="rounded-md border border-yellow-200 bg-yellow-50 p-4">
      <h3 class="text-sm font-medium text-yellow-800">Upcoming Deadlines</h3>
      <ul class="mt-2 space-y-1">
        {#each data.deadlines as dl}
          <li class="text-sm text-yellow-700">
            {getMemberName(dl.memberDid)} — Cash deadline: {dl.cashDeadline ? new Date(dl.cashDeadline).toLocaleDateString() : '—'}
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if data.forms.length === 0}
    <EmptyState title="No tax forms" description="Generate 1099-PATR forms for a fiscal period." />
  {:else}
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-[var(--cs-border)] text-left">
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Member</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Year</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)] text-right">Dividends</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)] text-right">Cash Paid</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Status</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--cs-border)]">
          {#each data.forms as tf}
            <tr>
              <td class="px-4 py-3 font-medium text-[var(--cs-text)]">{getMemberName(tf.memberDid)}</td>
              <td class="px-4 py-3 text-[var(--cs-text-secondary)]">{tf.taxYear}</td>
              <td class="px-4 py-3 text-right text-[var(--cs-text-secondary)]">{fmt(tf.patronageDividends)}</td>
              <td class="px-4 py-3 text-right text-[var(--cs-text-secondary)]">{fmt(tf.cashPaid)}</td>
              <td class="px-4 py-3">
                <Badge variant={statusToVariant(tf.generationStatus)}>{tf.generationStatus}</Badge>
              </td>
              <td class="px-4 py-3 text-right">
                <div class="flex justify-end gap-2">
                  {#if tf.generationStatus === 'pending'}
                    <form method="POST" action="?/markGenerated" use:enhance class="inline">
                      <input type="hidden" name="id" value={tf.id} />
                      <button type="submit" class="text-xs text-[var(--cs-primary)] hover:underline">Mark generated</button>
                    </form>
                  {/if}
                  {#if tf.generationStatus === 'generated'}
                    <form method="POST" action="?/markSent" use:enhance class="inline">
                      <input type="hidden" name="id" value={tf.id} />
                      <button type="submit" class="text-xs text-[var(--cs-primary)] hover:underline">Mark sent</button>
                    </form>
                  {/if}
                  {#if tf.generationStatus === 'sent' && !tf.cashPaidAt}
                    <form method="POST" action="?/recordPayment" use:enhance class="inline">
                      <input type="hidden" name="id" value={tf.id} />
                      <button type="submit" class="text-xs text-green-600 hover:underline">Record payment</button>
                    </form>
                  {/if}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<!-- Generate Forms Modal -->
<Modal open={generateOpen} title="Generate 1099-PATR Forms" onclose={() => (generateOpen = false)}>
  <form method="POST" action="?/generate"
    use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }}
    class="space-y-4">
    <div>
      <label for="genPeriod" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Fiscal Period</label>
      <select id="genPeriod" name="fiscalPeriodId" required
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]">
        <option value="">Select period…</option>
        {#each closedPeriods as period}
          <option value={period.id}>{period.label}</option>
        {/each}
      </select>
    </div>
    <div>
      <label for="taxYear" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Tax Year</label>
      <input id="taxYear" name="taxYear" type="number" min="2020" max="2099" value={new Date().getFullYear()} required
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
    </div>
    <div class="flex justify-end gap-3">
      <button type="button" onclick={() => (generateOpen = false)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]">Cancel</button>
      <button type="submit" disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50">
        {submitting ? 'Generating…' : 'Generate'}
      </button>
    </div>
  </form>
</Modal>
