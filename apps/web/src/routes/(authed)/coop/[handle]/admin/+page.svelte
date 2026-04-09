<script lang="ts">
  import { enhance } from '$app/forms';
  import { Badge, EmptyState, Modal, Tabs } from '$lib/components/ui';
  import OfficersTab from '$lib/components/admin/OfficersTab.svelte';
  import Bot from '@lucide/svelte/icons/bot';
  import { workspacePrefix } from '$lib/utils/workspace.js';

  let { data, form } = $props();

  let activeTab = $state('officers');
  let complianceModalOpen = $state(false);
  let noticeModalOpen = $state(false);
  let fiscalModalOpen = $state(false);
  let submitting = $state(false);
  let confirmCompleteId = $state<string | null>(null);
  let confirmCloseFiscalId = $state<string | null>(null);

  const tabs = [
    { id: 'officers', label: 'Officers', count: data.officers.length },
    { id: 'compliance', label: 'Compliance', count: data.complianceItems.length },
    { id: 'notices', label: 'Notices', count: data.notices.length },
    { id: 'fiscal', label: 'Fiscal Periods', count: data.fiscalPeriods.length },
    { id: 'agents', label: 'Agents', count: data.agents.length },
  ];

  $effect(() => {
    if (form?.success) {
      complianceModalOpen = false;
      noticeModalOpen = false;
      fiscalModalOpen = false;
      confirmCompleteId = null;
      confirmCloseFiscalId = null;
      if (form.tab) activeTab = form.tab as string;
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

<svelte:head>
  <title>Admin — Co-op Source</title>
</svelte:head>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">Administration</h1>
    <div>
      {#if activeTab === 'compliance'}
        <button type="button" onclick={() => (complianceModalOpen = true)}
          class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]">
          New compliance item
        </button>
      {:else if activeTab === 'notices'}
        <button type="button" onclick={() => (noticeModalOpen = true)}
          class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]">
          Send notice
        </button>
      {:else if activeTab === 'fiscal'}
        <button type="button" onclick={() => (fiscalModalOpen = true)}
          class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]">
          New fiscal period
        </button>
      {:else if activeTab === 'agents'}
        <a href="{$workspacePrefix}/settings/agents"
          class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]">
          Configure
        </a>
      {/if}
    </div>
  </div>

  {#if form?.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}

  <Tabs {tabs} bind:active={activeTab} />

  <!-- Officers Tab -->
  {#if activeTab === 'officers'}
    <OfficersTab
      officers={data.officers}
      officersCursor={data.officersCursor}
      members={data.members}
      {form}
    />
  {/if}

  <!-- Compliance Tab -->
  {#if activeTab === 'compliance'}
    {#if data.complianceItems.length === 0}
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
            {#each data.complianceItems as item}
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
      {#if data.complianceCursor}
        <div class="flex justify-center pt-2">
          <a href="?complianceCursor={data.complianceCursor}" class="text-sm text-[var(--cs-primary)] hover:underline">Load more</a>
        </div>
      {/if}
    {/if}
  {/if}

  <!-- Notices Tab -->
  {#if activeTab === 'notices'}
    {#if data.notices.length === 0}
      <EmptyState title="No notices" description="Send your first member notice." />
    {:else}
      <div class="space-y-2">
        {#each data.notices as notice}
          <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <h3 class="font-medium text-[var(--cs-text)]">{notice.title}</h3>
                <p class="mt-1 line-clamp-2 text-sm text-[var(--cs-text-secondary)]">{notice.body}</p>
                <p class="mt-2 text-xs text-[var(--cs-text-muted)]">
                  {notice.noticeType} · {notice.targetAudience} ·
                  {new Date(notice.createdAt).toLocaleDateString()}
                </p>
              </div>
              {#if notice.sentAt}
                <Badge variant="success">Sent</Badge>
              {/if}
            </div>
          </div>
        {/each}
      </div>
      {#if data.noticesCursor}
        <div class="flex justify-center pt-2">
          <a href="?noticesCursor={data.noticesCursor}" class="text-sm text-[var(--cs-primary)] hover:underline">Load more</a>
        </div>
      {/if}
    {/if}
  {/if}

  <!-- Fiscal Periods Tab -->
  {#if activeTab === 'fiscal'}
    {#if data.fiscalPeriods.length === 0}
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
            {#each data.fiscalPeriods as period}
              <tr>
                <td class="px-4 py-3 font-medium text-[var(--cs-text)]">{period.label}</td>
                <td class="px-4 py-3 text-[var(--cs-text-muted)]">{new Date(period.startsAt).toLocaleDateString()}</td>
                <td class="px-4 py-3 text-[var(--cs-text-muted)]">{new Date(period.endsAt).toLocaleDateString()}</td>
                <td class="px-4 py-3">
                  <Badge variant={statusToVariant(period.status)}>{period.status}</Badge>
                </td>
                <td class="px-4 py-3 text-right">
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
      {#if data.fiscalCursor}
        <div class="flex justify-center pt-2">
          <a href="?fiscalCursor={data.fiscalCursor}" class="text-sm text-[var(--cs-primary)] hover:underline">Load more</a>
        </div>
      {/if}
    {/if}
  {/if}

  <!-- Agents Tab -->
  {#if activeTab === 'agents'}
    {#if data.agents.length === 0}
      <EmptyState
        title="No agents configured"
        description="Configure AI model providers and create agents to help your cooperative with governance, facilitation, and analysis."
      />
    {:else}
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {#each data.agents as agent}
          <a
            href="{$workspacePrefix}/agents/{agent.id}"
            class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-5 hover:border-[var(--cs-primary)] transition-colors block"
          >
            <div class="flex items-start gap-3">
              <div class="p-2 rounded-lg bg-[var(--cs-bg-inset)]">
                <Bot size={20} class="text-[var(--cs-primary)]" />
              </div>
              <div class="min-w-0 flex-1">
                <h3 class="font-medium text-[var(--cs-text)] truncate">{agent.name}</h3>
                <p class="text-xs text-[var(--cs-text-muted)] mt-0.5 capitalize">{agent.agentType}</p>
              </div>
              {#if !agent.enabled}
                <span class="text-xs px-2 py-0.5 rounded-full bg-[var(--cs-bg-inset)] text-[var(--cs-text-muted)]">
                  Disabled
                </span>
              {/if}
            </div>
            {#if agent.description}
              <p class="text-sm text-[var(--cs-text-secondary)] mt-3 line-clamp-2">{agent.description}</p>
            {/if}
            <div class="flex items-center gap-2 mt-3 text-xs text-[var(--cs-text-muted)]">
              <span>Model: {agent.modelConfig.chat.split(':').pop()}</span>
            </div>
          </a>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<!-- Create Compliance Item Modal -->
<Modal open={complianceModalOpen} title="New Compliance Item" onclose={() => (complianceModalOpen = false)}>
  <form method="POST" action="?/createCompliance"
    use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }}
    class="space-y-4">
    <div>
      <label for="compTitle" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Title</label>
      <input id="compTitle" name="title" type="text" required
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        placeholder="e.g. Annual Report Filing" />
    </div>
    <div>
      <label for="compDesc" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
        Description <span class="text-[var(--cs-text-muted)]">(optional)</span>
      </label>
      <textarea id="compDesc" name="description" rows={2}
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"></textarea>
    </div>
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="dueDate" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Due Date</label>
        <input id="dueDate" name="dueDate" type="date" required
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
      </div>
      <div>
        <label for="filingType" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Filing Type</label>
        <select id="filingType" name="filingType" required
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]">
          <option value="">Select type…</option>
          <option value="annual_report">Annual Report</option>
          <option value="tax_filing">Tax Filing</option>
          <option value="state_report">State Report</option>
          <option value="other">Other</option>
        </select>
      </div>
    </div>
    <div class="flex justify-end gap-3">
      <button type="button" onclick={() => (complianceModalOpen = false)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]">Cancel</button>
      <button type="submit" disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50">
        {submitting ? 'Creating…' : 'Create'}
      </button>
    </div>
  </form>
</Modal>

<!-- Send Notice Modal -->
<Modal open={noticeModalOpen} title="Send Member Notice" onclose={() => (noticeModalOpen = false)}>
  <form method="POST" action="?/createNotice"
    use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }}
    class="space-y-4">
    <div>
      <label for="noticeTitle" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Title</label>
      <input id="noticeTitle" name="title" type="text" required
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
    </div>
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="noticeType" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Type</label>
        <select id="noticeType" name="noticeType" required
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]">
          <option value="">Select type…</option>
          <option value="general">General</option>
          <option value="election">Election</option>
          <option value="meeting">Meeting</option>
          <option value="policy_change">Policy Change</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div>
        <label for="targetAudience" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Audience</label>
        <select id="targetAudience" name="targetAudience" required
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]">
          <option value="">Select audience…</option>
          <option value="all">All Members</option>
          <option value="board">Board</option>
          <option value="officers">Officers</option>
        </select>
      </div>
    </div>
    <div>
      <label for="noticeBody" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Body</label>
      <textarea id="noticeBody" name="body" rows={4} required
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        placeholder="Notice content…"></textarea>
    </div>
    <div class="flex justify-end gap-3">
      <button type="button" onclick={() => (noticeModalOpen = false)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]">Cancel</button>
      <button type="submit" disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50">
        {submitting ? 'Sending…' : 'Send notice'}
      </button>
    </div>
  </form>
</Modal>

<!-- Create Fiscal Period Modal -->
<Modal open={fiscalModalOpen} title="New Fiscal Period" onclose={() => (fiscalModalOpen = false)}>
  <form method="POST" action="?/createFiscalPeriod"
    use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }}
    class="space-y-4">
    <div>
      <label for="fiscalLabel" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Label</label>
      <input id="fiscalLabel" name="label" type="text" required
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        placeholder="e.g. FY 2026" />
    </div>
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="startsAt" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Start Date</label>
        <input id="startsAt" name="startsAt" type="date" required
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
      </div>
      <div>
        <label for="endsAt" class="block text-sm font-medium text-[var(--cs-text-secondary)]">End Date</label>
        <input id="endsAt" name="endsAt" type="date" required
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
      </div>
    </div>
    <div class="flex justify-end gap-3">
      <button type="button" onclick={() => (fiscalModalOpen = false)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]">Cancel</button>
      <button type="submit" disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50">
        {submitting ? 'Creating…' : 'Create'}
      </button>
    </div>
  </form>
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
