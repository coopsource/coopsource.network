<script lang="ts">
  import { enhance } from '$app/forms';
  import { Badge, EmptyState, Modal, Tabs } from '$lib/components/ui';
  import { workspacePrefix } from '$lib/utils/workspace.js';
  import type { Member } from '$lib/api/types.js';

  let { data, form } = $props();

  let activeTab = $state('records');
  let configModalOpen = $state(false);
  let calcModalOpen = $state(false);
  let submitting = $state(false);

  // Dynamic metrics rows for calculation
  let metricRows = $state<Array<{ memberDid: string; metricValue: number; stakeholderClass: string }>>([]);

  $effect(() => {
    if (form?.success || form?.calcSuccess) {
      configModalOpen = false;
      calcModalOpen = false;
    }
  });

  const tabs = [
    { id: 'records', label: 'Records', count: data.records.length },
    { id: 'config', label: 'Configuration', count: data.configs.length },
  ];

  function getMemberName(did: string): string {
    const member = data.members.find((m: Member) => m.did === did);
    return member?.displayName ?? did;
  }

  function fmt(n: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  }

  function addMetricRow() {
    metricRows = [...metricRows, { memberDid: '', metricValue: 0, stakeholderClass: '' }];
  }

  function removeMetricRow(index: number) {
    metricRows = metricRows.filter((_, i) => i !== index);
  }

  const closedPeriods = $derived(data.fiscalPeriods.filter((p) => p.status === 'closed'));
</script>

<svelte:head>
  <title>Patronage — Co-op Source</title>
</svelte:head>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <a href="{$workspacePrefix}/finance" class="text-sm text-[var(--cs-text-muted)] hover:text-[var(--cs-text-secondary)]">← Finance</a>
      <h1 class="text-xl font-semibold text-[var(--cs-text)]">Patronage</h1>
    </div>
    <div class="flex gap-2">
      {#if activeTab === 'records'}
        <button type="button" onclick={() => (calcModalOpen = true)}
          class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]">
          Run calculation
        </button>
      {:else}
        <button type="button" onclick={() => (configModalOpen = true)}
          class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]">
          Add config
        </button>
      {/if}
    </div>
  </div>

  {#if form?.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}
  {#if form?.calcSuccess}
    <div class="rounded-md bg-green-50 p-3 text-sm text-green-700">Patronage calculation completed.</div>
  {/if}
  {#if form?.approveSuccess}
    <div class="rounded-md bg-green-50 p-3 text-sm text-green-700">{form.approved} records approved.</div>
  {/if}

  <Tabs {tabs} bind:active={activeTab} />

  {#if activeTab === 'records'}
    <!-- Fiscal Period Selector -->
    <div class="flex items-center gap-3">
      <label for="periodSelect" class="text-sm font-medium text-[var(--cs-text-secondary)]">Fiscal Period:</label>
      <select id="periodSelect"
        onchange={(e) => { const v = (e.target as HTMLSelectElement).value; window.location.href = v ? `?fiscalPeriodId=${v}` : `${$workspacePrefix}/finance/patronage`; }}
        class="rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-1.5 text-sm text-[var(--cs-text)]">
        <option value="">Select period…</option>
        {#each data.fiscalPeriods as period}
          <option value={period.id} selected={data.selectedFiscalPeriodId === period.id}>
            {period.label} ({period.status})
          </option>
        {/each}
      </select>
      {#if data.selectedFiscalPeriodId && data.records.length > 0}
        <form method="POST" action="?/approve" use:enhance class="inline">
          <input type="hidden" name="fiscalPeriodId" value={data.selectedFiscalPeriodId} />
          <button type="submit" class="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">
            Approve all
          </button>
        </form>
      {/if}
    </div>

    {#if !data.selectedFiscalPeriodId}
      <EmptyState title="Select a fiscal period" description="Choose a fiscal period above to view patronage records." />
    {:else if data.records.length === 0}
      <EmptyState title="No records" description="Run a patronage calculation for this period." />
    {:else}
      <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-[var(--cs-border)] text-left">
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Member</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Class</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)] text-right">Metric</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)] text-right">Allocation</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)] text-right">Cash</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)] text-right">Retained</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[var(--cs-border)]">
            {#each data.records as record}
              <tr>
                <td class="px-4 py-3 font-medium text-[var(--cs-text)]">{getMemberName(record.memberDid)}</td>
                <td class="px-4 py-3 text-[var(--cs-text-secondary)]">{record.stakeholderClass}</td>
                <td class="px-4 py-3 text-right text-[var(--cs-text-secondary)]">{record.metricValue}</td>
                <td class="px-4 py-3 text-right text-[var(--cs-text)]">{fmt(record.totalAllocation)}</td>
                <td class="px-4 py-3 text-right text-[var(--cs-text-secondary)]">{fmt(record.cashAmount)}</td>
                <td class="px-4 py-3 text-right text-[var(--cs-text-secondary)]">{fmt(record.retainedAmount)}</td>
                <td class="px-4 py-3">
                  <Badge variant={record.status === 'approved' ? 'success' : 'default'}>{record.status}</Badge>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}

  {#if activeTab === 'config'}
    {#if data.configs.length === 0}
      <EmptyState title="No patronage configs" description="Add allocation rules per stakeholder class." />
    {:else}
      <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-[var(--cs-border)] text-left">
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Stakeholder Class</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Metric Type</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Cash Payout %</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[var(--cs-border)]">
            {#each data.configs as config}
              <tr>
                <td class="px-4 py-3 font-medium text-[var(--cs-text)]">{config.stakeholderClass}</td>
                <td class="px-4 py-3 text-[var(--cs-text-secondary)]">{config.metricType}</td>
                <td class="px-4 py-3 text-[var(--cs-text-secondary)]">{config.cashPayoutPct}%</td>
                <td class="px-4 py-3 text-right">
                  <form method="POST" action="?/deleteConfig" use:enhance class="inline">
                    <input type="hidden" name="id" value={config.id} />
                    <button type="submit" class="text-xs text-red-600 hover:underline">Delete</button>
                  </form>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}
</div>

<!-- Add Config Modal -->
<Modal open={configModalOpen} title="New Patronage Config" onclose={() => (configModalOpen = false)}>
  <form method="POST" action="?/createConfig"
    use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }}
    class="space-y-4">
    <div>
      <label for="stakeholderClass" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Stakeholder Class</label>
      <input id="stakeholderClass" name="stakeholderClass" type="text" value="worker"
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
    </div>
    <div>
      <label for="metricType" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Metric Type</label>
      <select id="metricType" name="metricType" required
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]">
        <option value="">Select type…</option>
        <option value="hours_worked">Hours Worked</option>
        <option value="salary">Salary</option>
        <option value="combined">Combined</option>
        <option value="purchase_volume">Purchase Volume</option>
        <option value="supply_volume">Supply Volume</option>
        <option value="custom">Custom</option>
      </select>
    </div>
    <div>
      <label for="cashPayoutPct" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Cash Payout %</label>
      <input id="cashPayoutPct" name="cashPayoutPct" type="number" min="0" max="100" value="20"
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
    </div>
    <div class="flex justify-end gap-3">
      <button type="button" onclick={() => (configModalOpen = false)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]">Cancel</button>
      <button type="submit" disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50">
        {submitting ? 'Creating…' : 'Create'}
      </button>
    </div>
  </form>
</Modal>

<!-- Run Calculation Modal -->
<Modal open={calcModalOpen} title="Run Patronage Calculation" size="lg" onclose={() => (calcModalOpen = false)}>
  <form method="POST" action="?/calculate"
    use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }}
    class="space-y-4">
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="calcPeriod" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Fiscal Period</label>
        <select id="calcPeriod" name="fiscalPeriodId" required
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]">
          <option value="">Select period…</option>
          {#each closedPeriods as period}
            <option value={period.id}>{period.label}</option>
          {/each}
        </select>
      </div>
      <div>
        <label for="totalSurplus" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Total Surplus ($)</label>
        <input id="totalSurplus" name="totalSurplus" type="number" step="0.01" min="0" required
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
      </div>
    </div>

    <!-- Per-member metrics -->
    <div>
      <div class="mb-2 flex items-center justify-between">
        <h3 class="text-sm font-medium text-[var(--cs-text-secondary)]">Member Metrics</h3>
        <button type="button" onclick={addMetricRow} class="text-xs text-[var(--cs-primary)] hover:underline">Add row</button>
      </div>
      {#if metricRows.length === 0}
        <p class="text-sm text-[var(--cs-text-muted)]">Add at least one member metric row.</p>
      {:else}
        <div class="space-y-2">
          {#each metricRows as row, i}
            <div class="flex items-center gap-2">
              <select bind:value={row.memberDid} required
                class="flex-1 rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-2 py-1.5 text-sm text-[var(--cs-text)]">
                <option value="">Select member…</option>
                {#each data.members as member}
                  <option value={member.did}>{member.displayName}</option>
                {/each}
              </select>
              <input type="number" bind:value={row.metricValue} placeholder="Value" step="0.01" required
                class="w-24 rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-2 py-1.5 text-sm text-[var(--cs-text)]" />
              <input type="text" bind:value={row.stakeholderClass} placeholder="Class (opt)"
                class="w-28 rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-2 py-1.5 text-sm text-[var(--cs-text)]" />
              <button type="button" onclick={() => removeMetricRow(i)} class="text-xs text-red-600">&times;</button>
            </div>
          {/each}
        </div>
      {/if}
      <input type="hidden" name="metrics" value={JSON.stringify(metricRows.map((r) => ({
        memberDid: r.memberDid,
        metricValue: r.metricValue,
        ...(r.stakeholderClass ? { stakeholderClass: r.stakeholderClass } : {}),
      })))} />
    </div>

    <div class="flex justify-end gap-3">
      <button type="button" onclick={() => (calcModalOpen = false)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]">Cancel</button>
      <button type="submit" disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50">
        {submitting ? 'Calculating…' : 'Run calculation'}
      </button>
    </div>
  </form>
</Modal>
