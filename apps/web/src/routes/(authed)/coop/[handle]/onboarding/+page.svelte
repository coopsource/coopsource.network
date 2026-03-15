<script lang="ts">
  import { enhance } from '$app/forms';
  import { Badge, EmptyState, Modal, Tabs } from '$lib/components/ui';
  import { workspacePrefix } from '$lib/utils/workspace.js';
  import type { Member } from '$lib/api/types.js';

  let { data, form } = $props();

  let activeTab = $state('progress');
  let startModalOpen = $state(false);
  let submitting = $state(false);
  let selectedMemberDid = $state('');

  // Milestones editor state
  let milestones = $state<Array<{ name: string; description: string; order: number }>>(
    data.config?.milestones?.map((m) => ({ name: m.name, description: m.description ?? '', order: m.order })) ?? []
  );

  const tabs = [
    { id: 'progress', label: 'Progress', count: data.progress.length },
    { id: 'config', label: 'Configuration' },
  ];

  $effect(() => {
    if (form?.success) {
      startModalOpen = false;
      if (form.tab) activeTab = form.tab as string;
    }
  });

  function statusToVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
    switch (status) {
      case 'completed': return 'success';
      case 'in_progress': case 'probation': return 'warning';
      case 'failed': return 'danger';
      default: return 'default';
    }
  }

  function getMemberName(did: string): string {
    const member = data.members.find((m: Member) => m.did === did);
    return member?.displayName ?? did;
  }

  function addMilestone() {
    milestones = [...milestones, { name: '', description: '', order: milestones.length + 1 }];
  }

  function removeMilestone(index: number) {
    milestones = milestones.filter((_, i) => i !== index).map((m, i) => ({ ...m, order: i + 1 }));
  }

  const statusFilters = [
    { value: '', label: 'All' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'probation', label: 'Probation' },
    { value: 'completed', label: 'Completed' },
  ];

  // Members not yet onboarding
  const availableMembers = $derived(
    data.members.filter((m: Member) => !data.progress.some((p) => p.memberDid === m.did))
  );
</script>

<svelte:head>
  <title>Onboarding — Co-op Source</title>
</svelte:head>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">Onboarding</h1>
    {#if activeTab === 'progress'}
      <button type="button" onclick={() => (startModalOpen = true)}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]">
        Start onboarding
      </button>
    {/if}
  </div>

  {#if form?.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}
  {#if form?.success}
    <div class="rounded-md bg-green-50 p-3 text-sm text-green-700">Saved successfully.</div>
  {/if}

  <Tabs {tabs} bind:active={activeTab} />

  <!-- Progress Tab -->
  {#if activeTab === 'progress'}
    <div class="flex gap-1 border-b border-[var(--cs-border)]">
      {#each statusFilters as filter}
        <a
          href={filter.value ? `?status=${filter.value}` : `${$workspacePrefix}/onboarding`}
          class="px-3 py-2 text-sm font-medium transition-colors
            {data.filterStatus === filter.value
              ? 'border-b-2 border-[var(--cs-primary)] text-[var(--cs-primary)]'
              : 'text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)]'}"
        >
          {filter.label}
        </a>
      {/each}
    </div>

    {#if data.progress.length === 0}
      <EmptyState
        title="No onboarding in progress"
        description={data.config ? 'Start onboarding for a new member.' : 'Configure onboarding settings first.'}
      />
    {:else}
      <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-[var(--cs-border)] text-left">
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Member</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Status</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Training</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Buy-in</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Milestones</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Started</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[var(--cs-border)]">
            {#each data.progress as prog}
              <tr>
                <td class="px-4 py-3 font-medium text-[var(--cs-text)]">{getMemberName(prog.memberDid)}</td>
                <td class="px-4 py-3"><Badge variant={statusToVariant(prog.status)}>{prog.status}</Badge></td>
                <td class="px-4 py-3">
                  {#if prog.trainingCompleted}
                    <span class="text-green-600">Done</span>
                  {:else}
                    <span class="text-[var(--cs-text-muted)]">Pending</span>
                  {/if}
                </td>
                <td class="px-4 py-3">
                  {#if prog.buyInCompleted}
                    <span class="text-green-600">Done</span>
                  {:else}
                    <span class="text-[var(--cs-text-muted)]">Pending</span>
                  {/if}
                </td>
                <td class="px-4 py-3 text-[var(--cs-text-muted)]">
                  {prog.milestonesCompleted.length}{#if data.config?.milestones?.length}/{data.config.milestones.length}{/if}
                </td>
                <td class="px-4 py-3 text-[var(--cs-text-muted)]">
                  {new Date(prog.createdAt).toLocaleDateString()}
                </td>
                <td class="px-4 py-3 text-right">
                  <a href="{$workspacePrefix}/onboarding/{encodeURIComponent(prog.memberDid)}"
                    class="text-xs text-[var(--cs-primary)] hover:underline">View</a>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}

  <!-- Config Tab -->
  {#if activeTab === 'config'}
    <form
      method="POST"
      action={data.config ? '?/updateConfig' : '?/createConfig'}
      use:enhance={() => {
        submitting = true;
        return async ({ update }) => {
          submitting = false;
          await update();
        };
      }}
      class="space-y-6 rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-6"
    >
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label for="probationDays" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Probation Duration (days)</label>
          <input id="probationDays" name="probationDurationDays" type="number" value={data.config?.probationDurationDays ?? 90}
            class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
        </div>
        <div>
          <label for="buyInAmount" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
            Buy-in Amount <span class="text-[var(--cs-text-muted)]">(optional)</span>
          </label>
          <input id="buyInAmount" name="buyInAmount" type="number" step="0.01" value={data.config?.buyInAmount ?? ''}
            class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
        </div>
      </div>

      <div class="flex flex-wrap gap-6">
        <div class="flex items-center gap-2">
          <input id="requireTraining" name="requireTraining" type="checkbox" checked={data.config?.requireTraining ?? false}
            class="rounded border-[var(--cs-input-border)]" />
          <label for="requireTraining" class="text-sm text-[var(--cs-text-secondary)]">Require training</label>
        </div>
        <div class="flex items-center gap-2">
          <input id="requireBuyIn" name="requireBuyIn" type="checkbox" checked={data.config?.requireBuyIn ?? false}
            class="rounded border-[var(--cs-input-border)]" />
          <label for="requireBuyIn" class="text-sm text-[var(--cs-text-secondary)]">Require buy-in</label>
        </div>
        <div class="flex items-center gap-2">
          <input id="buddySystem" name="buddySystemEnabled" type="checkbox" checked={data.config?.buddySystemEnabled ?? false}
            class="rounded border-[var(--cs-input-border)]" />
          <label for="buddySystem" class="text-sm text-[var(--cs-text-secondary)]">Enable buddy system</label>
        </div>
      </div>

      <!-- Milestones -->
      <div>
        <div class="mb-2 flex items-center justify-between">
          <h3 class="text-sm font-medium text-[var(--cs-text-secondary)]">Milestones</h3>
          <button type="button" onclick={addMilestone}
            class="text-xs text-[var(--cs-primary)] hover:underline">Add milestone</button>
        </div>
        {#if milestones.length === 0}
          <p class="text-sm text-[var(--cs-text-muted)]">No milestones defined.</p>
        {:else}
          <div class="space-y-2">
            {#each milestones as milestone, i}
              <div class="flex items-start gap-2 rounded-md border border-[var(--cs-border)] p-3">
                <span class="mt-1 text-xs text-[var(--cs-text-muted)]">#{milestone.order}</span>
                <div class="flex-1 space-y-1">
                  <input type="text" bind:value={milestone.name} placeholder="Milestone name" required
                    class="block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-2 py-1 text-sm text-[var(--cs-text)]" />
                  <input type="text" bind:value={milestone.description} placeholder="Description (optional)"
                    class="block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-2 py-1 text-xs text-[var(--cs-text)]" />
                </div>
                <button type="button" onclick={() => removeMilestone(i)}
                  class="text-xs text-red-600 hover:underline">Remove</button>
              </div>
            {/each}
          </div>
        {/if}
        <input type="hidden" name="milestones" value={JSON.stringify(milestones)} />
      </div>

      <div class="flex justify-end">
        <button type="submit" disabled={submitting}
          class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50">
          {submitting ? 'Saving…' : data.config ? 'Update configuration' : 'Create configuration'}
        </button>
      </div>
    </form>
  {/if}
</div>

<!-- Start Onboarding Modal -->
<Modal open={startModalOpen} title="Start Onboarding" onclose={() => (startModalOpen = false)}>
  <form method="POST" action="?/startOnboarding"
    use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }}
    class="space-y-4">
    <div>
      <label for="startMember" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Member</label>
      <select id="startMember" name="memberDid" required bind:value={selectedMemberDid}
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]">
        <option value="">Select member…</option>
        {#each availableMembers as member}
          <option value={member.did}>{member.displayName}{member.handle ? ` (@${member.handle})` : ''}</option>
        {/each}
      </select>
    </div>
    <div class="flex justify-end gap-3">
      <button type="button" onclick={() => (startModalOpen = false)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]">Cancel</button>
      <button type="submit" disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50">
        {submitting ? 'Starting…' : 'Start onboarding'}
      </button>
    </div>
  </form>
</Modal>
