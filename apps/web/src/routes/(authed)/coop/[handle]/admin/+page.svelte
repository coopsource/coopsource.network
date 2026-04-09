<script lang="ts">
  import { enhance } from '$app/forms';
  import { Badge, EmptyState, Modal, Tabs } from '$lib/components/ui';
  import OfficersTab from '$lib/components/admin/OfficersTab.svelte';
  import ComplianceTab from '$lib/components/admin/ComplianceTab.svelte';
  import FiscalPeriodsTab from '$lib/components/admin/FiscalPeriodsTab.svelte';
  import Bot from '@lucide/svelte/icons/bot';
  import { workspacePrefix } from '$lib/utils/workspace.js';

  let { data, form } = $props();

  let activeTab = $state('officers');
  let noticeModalOpen = $state(false);
  let submitting = $state(false);

  const tabs = [
    { id: 'officers', label: 'Officers', count: data.officers.length },
    { id: 'compliance', label: 'Compliance', count: data.complianceItems.length },
    { id: 'notices', label: 'Notices', count: data.notices.length },
    { id: 'fiscal', label: 'Fiscal Periods', count: data.fiscalPeriods.length },
    { id: 'agents', label: 'Agents', count: data.agents.length },
  ];

  $effect(() => {
    if (form?.success) {
      noticeModalOpen = false;
      if (form.tab) activeTab = form.tab as string;
    }
  });
</script>

<svelte:head>
  <title>Admin — Co-op Source</title>
</svelte:head>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">Administration</h1>
    <div>
      {#if activeTab === 'notices'}
        <button type="button" onclick={() => (noticeModalOpen = true)}
          class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]">
          Send notice
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
    <ComplianceTab complianceItems={data.complianceItems} complianceCursor={data.complianceCursor} {form} />
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
    <FiscalPeriodsTab fiscalPeriods={data.fiscalPeriods} fiscalCursor={data.fiscalCursor} {form} />
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
