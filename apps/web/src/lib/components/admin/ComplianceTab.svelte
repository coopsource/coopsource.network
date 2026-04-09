<script lang="ts">
  import { enhance } from '$app/forms';
  import { Badge, EmptyState, Modal } from '$lib/components/ui';
  import { canEditComplianceItem } from '$lib/utils/entity-permissions.js';
  import type { ComplianceItem } from '$lib/api/types.js';

  let {
    complianceItems,
    complianceCursor,
    form,
  }: {
    complianceItems: ComplianceItem[];
    complianceCursor: string | null;
    form: { success?: boolean; tab?: string; error?: string } | null;
  } = $props();

  let complianceModalOpen = $state(false);
  let editingCompliance = $state<ComplianceItem | null>(null);
  let confirmCompleteId = $state<string | null>(null);
  let submitting = $state(false);

  $effect(() => {
    if (form?.success && form.tab === 'compliance') {
      complianceModalOpen = false;
      editingCompliance = null;
      confirmCompleteId = null;
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
  <button type="button" onclick={() => (complianceModalOpen = true)}
    class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]">
    New compliance item
  </button>
</div>

{#if complianceItems.length === 0}
  <EmptyState title="No compliance items" description="Create your first compliance calendar item." />
{:else}
  <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-[var(--cs-border)] text-left">
          <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Title</th>
          <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Filing Type</th>
          <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Due Date</th>
          <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Status</th>
          <th class="px-4 py-3"></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-[var(--cs-border)]">
        {#each complianceItems as item}
          <tr>
            <td class="px-4 py-3">
              <div class="font-medium text-[var(--cs-text)]">{item.title}</div>
              {#if item.description}
                <div class="text-xs text-[var(--cs-text-muted)]">{item.description}</div>
              {/if}
            </td>
            <td class="px-4 py-3">
              <span class="rounded bg-[var(--cs-bg-inset)] px-1.5 py-0.5 text-xs text-[var(--cs-text-secondary)]">
                {item.filingType}
              </span>
            </td>
            <td class="px-4 py-3 text-[var(--cs-text-muted)]">
              {new Date(item.dueDate).toLocaleDateString()}
            </td>
            <td class="px-4 py-3">
              <Badge variant={statusToVariant(item.status)}>{item.status}</Badge>
            </td>
            <td class="px-4 py-3 text-right">
              {#if canEditComplianceItem(item)}
                <button type="button" onclick={() => { editingCompliance = item; }}
                  class="text-xs text-[var(--cs-primary)] hover:underline mr-2">Edit</button>
              {/if}
              {#if item.status !== 'completed'}
                <button type="button" onclick={() => (confirmCompleteId = item.id)}
                  class="text-xs text-green-600 hover:underline">Mark complete</button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if complianceCursor}
    <div class="flex justify-center pt-2">
      <a href="?complianceCursor={complianceCursor}" class="text-sm text-[var(--cs-primary)] hover:underline">Load more</a>
    </div>
  {/if}
{/if}

<!-- Create / Edit Compliance Item Modal -->
<Modal open={complianceModalOpen || editingCompliance !== null} title={editingCompliance ? 'Edit Compliance Item' : 'New Compliance Item'} onclose={() => { complianceModalOpen = false; editingCompliance = null; }}>
  {#key editingCompliance?.id ?? 'create'}
  <form method="POST" action={editingCompliance ? '?/updateCompliance' : '?/createCompliance'}
    use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }}
    class="space-y-4">
    {#if editingCompliance}<input type="hidden" name="id" value={editingCompliance.id} />{/if}
    <div>
      <label for="compTitle" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Title</label>
      <input id="compTitle" name="title" type="text" required
        value={editingCompliance?.title ?? ''}
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        placeholder="e.g. Annual Report Filing" />
    </div>
    <div>
      <label for="compDesc" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
        Description <span class="text-[var(--cs-text-muted)]">(optional)</span>
      </label>
      <textarea id="compDesc" name="description" rows={2}
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      >{editingCompliance?.description ?? ''}</textarea>
    </div>
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="dueDate" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Due Date</label>
        <input id="dueDate" name="dueDate" type="date" required
          value={editingCompliance?.dueDate?.slice(0, 10) ?? ''}
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
      </div>
      <div>
        <label for="filingType" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Filing Type</label>
        <select id="filingType" name="filingType" required
          value={editingCompliance?.filingType ?? ''}
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]">
          <option value="">Select type...</option>
          <option value="annual_report">Annual Report</option>
          <option value="tax_filing">Tax Filing</option>
          <option value="state_report">State Report</option>
          <option value="other">Other</option>
        </select>
      </div>
    </div>
    <div class="flex justify-end gap-3">
      <button type="button" onclick={() => { complianceModalOpen = false; editingCompliance = null; }}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]">Cancel</button>
      <button type="submit" disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50">
        {submitting ? 'Saving...' : editingCompliance ? 'Save changes' : 'Create'}
      </button>
    </div>
  </form>
  {/key}
</Modal>

<!-- Complete Compliance Confirmation -->
<Modal open={confirmCompleteId !== null} title="Mark Complete" onclose={() => (confirmCompleteId = null)}>
  <p class="mb-4 text-sm text-[var(--cs-text-secondary)]">Mark this compliance item as completed?</p>
  <form method="POST" action="?/completeCompliance" use:enhance>
    <input type="hidden" name="id" value={confirmCompleteId ?? ''} />
    <div class="flex justify-end gap-3">
      <button type="button" onclick={() => (confirmCompleteId = null)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]">Cancel</button>
      <button type="submit"
        class="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">Mark complete</button>
    </div>
  </form>
</Modal>
