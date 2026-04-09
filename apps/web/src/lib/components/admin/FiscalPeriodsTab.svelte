<script lang="ts">
  import { enhance } from '$app/forms';
  import { Badge, EmptyState, Modal } from '$lib/components/ui';
  import { canEditFiscalPeriod } from '$lib/utils/entity-permissions.js';
  import type { FiscalPeriod } from '$lib/api/types.js';

  let {
    fiscalPeriods,
    fiscalCursor,
    form,
  }: {
    fiscalPeriods: FiscalPeriod[];
    fiscalCursor: string | null;
    form: { success?: boolean; tab?: string; error?: string } | null;
  } = $props();

  let fiscalModalOpen = $state(false);
  let editingFiscal = $state<FiscalPeriod | null>(null);
  let confirmCloseFiscalId = $state<string | null>(null);
  let submitting = $state(false);

  $effect(() => {
    if (form?.success && form.tab === 'fiscal') {
      fiscalModalOpen = false;
      editingFiscal = null;
      confirmCloseFiscalId = null;
    }
  });

  function statusToVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
    switch (status) {
      case 'active': case 'completed': case 'closed': return 'success';
      case 'pending': case 'open': return 'warning';
      case 'overdue': return 'danger';
      default: return 'default';
    }
  }
</script>

<div class="mb-4 flex justify-end">
  <button type="button" onclick={() => (fiscalModalOpen = true)}
    class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]">
    New fiscal period
  </button>
</div>

{#if fiscalPeriods.length === 0}
  <EmptyState title="No fiscal periods" description="Create your first fiscal period." />
{:else}
  <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-[var(--cs-border)] text-left">
          <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Label</th>
          <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Start</th>
          <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">End</th>
          <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Status</th>
          <th class="px-4 py-3"></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-[var(--cs-border)]">
        {#each fiscalPeriods as period}
          <tr>
            <td class="px-4 py-3 font-medium text-[var(--cs-text)]">{period.label}</td>
            <td class="px-4 py-3 text-[var(--cs-text-muted)]">{new Date(period.startsAt).toLocaleDateString()}</td>
            <td class="px-4 py-3 text-[var(--cs-text-muted)]">{new Date(period.endsAt).toLocaleDateString()}</td>
            <td class="px-4 py-3">
              <Badge variant={statusToVariant(period.status)}>{period.status}</Badge>
            </td>
            <td class="px-4 py-3 text-right">
              {#if canEditFiscalPeriod(period)}
                <button type="button" onclick={() => { editingFiscal = period; }}
                  class="text-xs text-[var(--cs-primary)] hover:underline mr-2">Edit</button>
              {/if}
              {#if period.status === 'open'}
                <button type="button" onclick={() => (confirmCloseFiscalId = period.id)}
                  class="text-xs text-[var(--cs-primary)] hover:underline">Close period</button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if fiscalCursor}
    <div class="flex justify-center pt-2">
      <a href="?fiscalCursor={fiscalCursor}" class="text-sm text-[var(--cs-primary)] hover:underline">Load more</a>
    </div>
  {/if}
{/if}

<!-- Create / Edit Fiscal Period Modal -->
<Modal open={fiscalModalOpen || editingFiscal !== null} title={editingFiscal ? 'Edit Fiscal Period' : 'New Fiscal Period'} onclose={() => { fiscalModalOpen = false; editingFiscal = null; }}>
  {#key editingFiscal?.id ?? 'create'}
  <form method="POST" action={editingFiscal ? '?/updateFiscalPeriod' : '?/createFiscalPeriod'}
    use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }}
    class="space-y-4">
    {#if editingFiscal}<input type="hidden" name="id" value={editingFiscal.id} />{/if}
    <div>
      <label for="fiscalLabel" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Label</label>
      <input id="fiscalLabel" name="label" type="text" required
        value={editingFiscal?.label ?? ''}
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        placeholder="e.g. FY 2026" />
    </div>
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="startsAt" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Start Date</label>
        <input id="startsAt" name="startsAt" type="date" required
          value={editingFiscal?.startsAt?.slice(0, 10) ?? ''}
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
      </div>
      <div>
        <label for="endsAt" class="block text-sm font-medium text-[var(--cs-text-secondary)]">End Date</label>
        <input id="endsAt" name="endsAt" type="date" required
          value={editingFiscal?.endsAt?.slice(0, 10) ?? ''}
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
      </div>
    </div>
    <div class="flex justify-end gap-3">
      <button type="button" onclick={() => { fiscalModalOpen = false; editingFiscal = null; }}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]">Cancel</button>
      <button type="submit" disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50">
        {submitting ? 'Saving...' : editingFiscal ? 'Save changes' : 'Create'}
      </button>
    </div>
  </form>
  {/key}
</Modal>

<!-- Close Fiscal Period Confirmation -->
<Modal open={confirmCloseFiscalId !== null} title="Close Fiscal Period" onclose={() => (confirmCloseFiscalId = null)}>
  <p class="mb-4 text-sm text-[var(--cs-text-secondary)]">Are you sure you want to close this fiscal period? This action cannot be undone.</p>
  <form method="POST" action="?/closeFiscalPeriod" use:enhance>
    <input type="hidden" name="id" value={confirmCloseFiscalId ?? ''} />
    <div class="flex justify-end gap-3">
      <button type="button" onclick={() => (confirmCloseFiscalId = null)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]">Cancel</button>
      <button type="submit"
        class="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700">Close period</button>
    </div>
  </form>
</Modal>
