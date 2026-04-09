<script lang="ts">
  import { enhance } from '$app/forms';
  import { Badge, ConfirmDialog, EmptyState, Modal } from '$lib/components/ui';
  import { workspacePrefix } from '$lib/utils/workspace.js';
  import { canEditExpense, canDeleteExpense } from '$lib/utils/entity-permissions.js';
  import type { Expense, ExpenseCategory } from '$lib/api/types.js';

  let { data, form } = $props();

  let showCreateForm = $state(false);
  let editingExpense = $state<Expense | null>(null);
  let confirmDeleteId = $state<string | null>(null);
  let submitting = $state(false);

  $effect(() => {
    if (form?.success) {
      showCreateForm = false;
      editingExpense = null;
    }
  });

  const statusFilters = [
    { value: '', label: 'All' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'reimbursed', label: 'Reimbursed' },
  ];

  function statusToVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
    switch (status) {
      case 'approved': case 'reimbursed': return 'success';
      case 'submitted': return 'warning';
      case 'rejected': return 'danger';
      default: return 'default';
    }
  }

  function formatCurrency(amount: number, currency: string = 'USD'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  }

  function getCategoryName(categoryId: string | null): string {
    if (!categoryId) return 'Uncategorized';
    const cat = data.categories.find((c: ExpenseCategory) => c.id === categoryId);
    return cat?.name ?? 'Unknown';
  }

  // Compute category spending totals
  let categoryTotals = $derived(
    data.categories.map((cat: ExpenseCategory) => {
      const catExpenses = data.expenses.filter((e: Expense) => e.categoryId === cat.id);
      const spent = catExpenses.reduce((sum: number, e: Expense) => sum + e.amount, 0);
      return {
        ...cat,
        spent,
        percentage: cat.budgetLimit ? Math.min(100, (spent / cat.budgetLimit) * 100) : 0,
      };
    }),
  );

  let totalExpenses = $derived(
    data.expenses.reduce((sum: number, e: Expense) => sum + e.amount, 0),
  );
</script>

<svelte:head>
  <title>Expenses — Co-op Source</title>
</svelte:head>

<div class="space-y-4">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-xl font-semibold text-[var(--cs-text)]">Expenses</h1>
      <p class="text-sm text-[var(--cs-text-muted)]">Total: {formatCurrency(totalExpenses)}</p>
    </div>
    <button
      type="button"
      onclick={() => (showCreateForm = true)}
      class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]"
    >Submit Expense</button>
  </div>

  {#if form?.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}

  <!-- Status Filter Tabs -->
  <div class="flex gap-1">
    {#each statusFilters as filter}
      <a
        href={filter.value
          ? `${$workspacePrefix}/expenses?status=${filter.value}${data.filterCategory ? `&categoryId=${data.filterCategory}` : ''}`
          : `${$workspacePrefix}/expenses${data.filterCategory ? `?categoryId=${data.filterCategory}` : ''}`}
        class="px-3 py-1.5 text-xs font-medium rounded-full transition-colors
          {data.filterStatus === filter.value
            ? 'bg-[var(--cs-primary)] text-[var(--cs-text-on-primary)]'
            : 'bg-[var(--cs-bg-inset)] text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)]'}"
      >{filter.label}</a>
    {/each}
  </div>

  <!-- Category Summary -->
  {#if categoryTotals.length > 0}
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {#each categoryTotals as cat}
        <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-3">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-[var(--cs-text)]">{cat.name}</span>
            <span class="text-xs text-[var(--cs-text-muted)]">
              {formatCurrency(cat.spent)}
              {#if cat.budgetLimit}
                / {formatCurrency(cat.budgetLimit)}
              {/if}
            </span>
          </div>
          {#if cat.budgetLimit}
            <div class="mt-2 h-1.5 rounded-full bg-[var(--cs-bg-inset)]">
              <div
                class="h-1.5 rounded-full transition-all {cat.percentage >= 90 ? 'bg-red-500' : cat.percentage >= 70 ? 'bg-orange-500' : 'bg-[var(--cs-primary)]'}"
                style="width: {cat.percentage}%"
              ></div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- Expense List -->
  {#if data.expenses.length === 0}
    <EmptyState title="No expenses" description="Submit your first expense report." />
  {:else}
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-[var(--cs-border)] text-left">
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Title</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Amount</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Category</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Status</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Date</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--cs-border)]">
          {#each data.expenses as expense (expense.id)}
            <tr class="hover:bg-[var(--cs-bg-inset)] transition-colors">
              <td class="px-4 py-3">
                <div>
                  <span class="font-medium text-[var(--cs-text)]">{expense.title}</span>
                  {#if expense.description}
                    <p class="mt-0.5 text-xs text-[var(--cs-text-muted)] line-clamp-1">{expense.description}</p>
                  {/if}
                </div>
              </td>
              <td class="px-4 py-3 font-medium text-[var(--cs-text)]">
                {formatCurrency(expense.amount, expense.currency)}
              </td>
              <td class="px-4 py-3">
                <span class="rounded bg-[var(--cs-bg-inset)] px-1.5 py-0.5 text-xs text-[var(--cs-text-secondary)]">
                  {getCategoryName(expense.categoryId)}
                </span>
              </td>
              <td class="px-4 py-3">
                <Badge variant={statusToVariant(expense.status)}>{expense.status}</Badge>
              </td>
              <td class="px-4 py-3 text-[var(--cs-text-muted)]">
                {new Date(expense.createdAt).toLocaleDateString()}
              </td>
              <td class="px-4 py-3 text-right">
                {#if canEditExpense(expense, data.user?.did)}
                  <button type="button" onclick={() => { editingExpense = expense; }} class="text-xs text-[var(--cs-primary)] hover:underline mr-2">Edit</button>
                {/if}
                {#if canDeleteExpense(expense, data.user?.did)}
                  <button type="button" onclick={() => (confirmDeleteId = expense.id)} class="text-xs text-red-600 hover:underline">Delete</button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<!-- Submit / Edit Expense Modal -->
<Modal open={showCreateForm || editingExpense !== null} title={editingExpense ? 'Edit Expense' : 'Submit Expense'} onclose={() => { showCreateForm = false; editingExpense = null; }}>
  {#key editingExpense?.id ?? 'create'}
  <form
    method="POST"
    action={editingExpense ? '?/updateExpense' : '?/submitExpense'}
    use:enhance={() => {
      submitting = true;
      return async ({ update }) => {
        submitting = false;
        await update();
      };
    }}
    class="space-y-4"
  >
    {#if editingExpense}
      <input type="hidden" name="id" value={editingExpense.id} />
    {/if}

    <div>
      <label for="exp-title" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Title</label>
      <input
        id="exp-title"
        name="title"
        type="text"
        required
        value={editingExpense?.title ?? ''}
        placeholder="Expense title..."
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      />
    </div>

    <div>
      <label for="exp-amount" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Amount</label>
      <input
        id="exp-amount"
        name="amount"
        type="number"
        step="0.01"
        min="0.01"
        required
        value={editingExpense?.amount ?? ''}
        placeholder="0.00"
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      />
    </div>

    <div>
      <label for="exp-category" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Category</label>
      <select
        id="exp-category"
        name="categoryId"
        value={editingExpense?.categoryId ?? ''}
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      >
        <option value="">No category</option>
        {#each data.categories as cat}
          <option value={cat.id}>{cat.name}</option>
        {/each}
      </select>
    </div>

    <div>
      <label for="exp-desc" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Description</label>
      <textarea
        id="exp-desc"
        name="description"
        rows="3"
        placeholder="Describe the expense..."
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      >{editingExpense?.description ?? ''}</textarea>
    </div>

    <div class="flex justify-end gap-3">
      <button
        type="button"
        onclick={() => { showCreateForm = false; editingExpense = null; }}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
      >Cancel</button>
      <button
        type="submit"
        disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50"
      >{submitting ? 'Saving...' : editingExpense ? 'Save changes' : 'Submit Expense'}</button>
    </div>
  </form>
  {/key}
</Modal>

<!-- Delete Expense Confirmation -->
<ConfirmDialog
  open={confirmDeleteId !== null}
  title="Delete Expense"
  message="This will permanently delete this expense. This cannot be undone."
  confirmLabel="Delete"
  variant="danger"
  onconfirm={() => { (document.getElementById('delete-expense-form') as HTMLFormElement)?.requestSubmit(); }}
  oncancel={() => (confirmDeleteId = null)}
/>
<form id="delete-expense-form" method="POST" action="?/deleteExpense" use:enhance class="hidden">
  <input type="hidden" name="id" value={confirmDeleteId ?? ''} />
</form>
