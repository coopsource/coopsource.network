<script lang="ts">
  import { enhance } from '$app/forms';
  import { Badge, EmptyState, Modal, Tabs } from '$lib/components/ui';
  import { workspacePrefix } from '$lib/utils/workspace.js';
  import type { Member } from '$lib/api/types.js';

  let { data, form } = $props();

  let activeTab = $state(data.activeTab ?? 'members');
  let inviteOpen = $state(false);
  let submitting = $state(false);
  let confirmRemoveDid = $state<string | null>(null);

  // Onboarding state
  let obSubTab = $state('progress');
  let startModalOpen = $state(false);
  let selectedMemberDid = $state('');
  let milestones = $state<Array<{ name: string; description: string; order: number }>>(
    data.onboardingConfig?.milestones?.map((m) => ({ name: m.name, description: m.description ?? '', order: m.order })) ?? []
  );

  const tabs = $derived([
    { id: 'members', label: 'Members', count: data.members.length },
    { id: 'invitations', label: 'Invitations', count: data.invitations.length },
    { id: 'onboarding', label: 'Onboarding', count: data.onboardingProgress.length },
  ]);

  const obSubTabs = $derived([
    { id: 'progress', label: 'Progress', count: data.onboardingProgress.length },
    { id: 'config', label: 'Configuration' },
  ]);

  const statusFilters = [
    { value: '', label: 'All' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'probation', label: 'Probation' },
    { value: 'completed', label: 'Completed' },
  ];

  // Members not yet onboarding
  const availableMembers = $derived(
    data.allMembers.filter((m: Member) => !data.onboardingProgress.some((p) => p.memberDid === m.did))
  );

  $effect(() => {
    if (form?.inviteSuccess) {
      inviteOpen = false;
    }
    if (form?.onboardingSuccess || form?.configSuccess) {
      startModalOpen = false;
      if (form?.activeTab) activeTab = form.activeTab as string;
    }
  });

  function memberStatusToVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
    switch (status) {
      case 'active': case 'accepted': case 'resolved': case 'signed': return 'success';
      case 'pending': case 'open': case 'closed': return 'warning';
      case 'revoked': case 'void': case 'voided': return 'danger';
      default: return 'default';
    }
  }

  function obStatusToVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
    switch (status) {
      case 'completed': return 'success';
      case 'in_progress': case 'probation': return 'warning';
      case 'failed': return 'danger';
      default: return 'default';
    }
  }

  function getMemberName(did: string): string {
    const member = data.allMembers.find((m: Member) => m.did === did);
    return member?.displayName ?? did;
  }

  function addMilestone() {
    milestones = [...milestones, { name: '', description: '', order: milestones.length + 1 }];
  }

  function removeMilestone(index: number) {
    milestones = milestones.filter((_, i) => i !== index).map((m, i) => ({ ...m, order: i + 1 }));
  }
</script>

<svelte:head>
  <title>Members — Co-op Source</title>
</svelte:head>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">Members</h1>
    {#if activeTab === 'members'}
      <button
        type="button"
        onclick={() => (inviteOpen = true)}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]"
      >
        Invite member
      </button>
    {:else if activeTab === 'onboarding' && obSubTab === 'progress'}
      <button type="button" onclick={() => (startModalOpen = true)}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]">
        Start onboarding
      </button>
    {/if}
  </div>

  <Tabs {tabs} bind:active={activeTab} />

  <!-- ═══ Members Tab ═══ -->
  {#if activeTab === 'members'}
    {#if form?.removeError}
      <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.removeError}</div>
    {/if}

    {#if data.members.length === 0}
      <EmptyState title="No members yet" description="Invite someone to join your cooperative." />
    {:else}
      <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-[var(--cs-border)] text-left">
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Name</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Roles</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Status</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Joined</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[var(--cs-border)]">
            {#each data.members as member}
              <tr>
                <td class="px-4 py-3">
                  <div class="font-medium text-[var(--cs-text)]">{member.displayName}</div>
                  {#if member.handle}
                    <div class="text-xs text-[var(--cs-text-muted)]">@{member.handle}</div>
                  {/if}
                  {#if member.email}
                    <div class="text-xs text-[var(--cs-text-muted)]">{member.email}</div>
                  {/if}
                </td>
                <td class="px-4 py-3">
                  {#if member.roles.length > 0}
                    <div class="flex flex-wrap gap-1">
                      {#each member.roles as role}
                        <span class="rounded bg-[var(--cs-bg-inset)] px-1.5 py-0.5 text-xs text-[var(--cs-text-secondary)]"
                          >{role}</span
                        >
                      {/each}
                    </div>
                  {:else}
                    <span class="text-[var(--cs-text-muted)]">—</span>
                  {/if}
                </td>
                <td class="px-4 py-3">
                  <Badge variant={memberStatusToVariant(member.status)}>{member.status}</Badge>
                </td>
                <td class="px-4 py-3 text-[var(--cs-text-muted)]">
                  {new Date(member.joinedAt).toLocaleDateString()}
                </td>
                <td class="px-4 py-3 text-right">
                  <button
                    type="button"
                    onclick={() => (confirmRemoveDid = member.did)}
                    class="text-xs text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}

  <!-- ═══ Invitations Tab ═══ -->
  {#if activeTab === 'invitations'}
    {#if form?.revokeError}
      <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.revokeError}</div>
    {/if}
    {#if form?.revokeSuccess}
      <div class="rounded-md bg-green-50 p-3 text-sm text-green-700">Invitation revoked.</div>
    {/if}

    {#if data.invitations.length === 0}
      <EmptyState
        title="No pending invitations"
        description="Invitations will appear here after you invite members."
      />
    {:else}
      <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-[var(--cs-border)] text-left">
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Email</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Roles</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Status</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Expires</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[var(--cs-border)]">
            {#each data.invitations as invitation}
              <tr>
                <td class="px-4 py-3">
                  <div class="font-medium text-[var(--cs-text)]">{invitation.email}</div>
                  {#if invitation.message}
                    <div class="text-xs text-[var(--cs-text-muted)] italic">"{invitation.message}"</div>
                  {/if}
                </td>
                <td class="px-4 py-3">
                  {#if invitation.roles.length > 0}
                    <div class="flex flex-wrap gap-1">
                      {#each invitation.roles as role}
                        <span class="rounded bg-[var(--cs-bg-inset)] px-1.5 py-0.5 text-xs text-[var(--cs-text-secondary)]">
                          {role}
                        </span>
                      {/each}
                    </div>
                  {:else}
                    <span class="text-[var(--cs-text-muted)]">—</span>
                  {/if}
                </td>
                <td class="px-4 py-3">
                  <Badge variant={memberStatusToVariant(invitation.status)}>{invitation.status}</Badge>
                </td>
                <td class="px-4 py-3 text-[var(--cs-text-muted)]">
                  {new Date(invitation.expiresAt).toLocaleDateString()}
                </td>
                <td class="px-4 py-3 text-right">
                  {#if invitation.status === 'pending'}
                    <form method="POST" action="?/revoke" use:enhance class="inline">
                      <input type="hidden" name="id" value={invitation.id} />
                      <button type="submit" class="text-xs text-red-600 hover:underline">
                        Revoke
                      </button>
                    </form>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}

  <!-- ═══ Onboarding Tab ═══ -->
  {#if activeTab === 'onboarding'}
    {#if form?.onboardingError}
      <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.onboardingError}</div>
    {/if}
    {#if form?.configError}
      <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.configError}</div>
    {/if}
    {#if form?.configSuccess}
      <div class="rounded-md bg-green-50 p-3 text-sm text-green-700">Saved successfully.</div>
    {/if}
    {#if form?.onboardingSuccess}
      <div class="rounded-md bg-green-50 p-3 text-sm text-green-700">Onboarding started.</div>
    {/if}

    <Tabs tabs={obSubTabs} bind:active={obSubTab} />

    <!-- Progress Sub-Tab -->
    {#if obSubTab === 'progress'}
      <div class="flex gap-1 border-b border-[var(--cs-border)]">
        {#each statusFilters as filter}
          <a
            href={filter.value ? `?tab=onboarding&status=${filter.value}` : `?tab=onboarding`}
            class="px-3 py-2 text-sm font-medium transition-colors
              {data.onboardingFilterStatus === filter.value
                ? 'border-b-2 border-[var(--cs-primary)] text-[var(--cs-primary)]'
                : 'text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)]'}"
          >
            {filter.label}
          </a>
        {/each}
      </div>

      {#if data.onboardingProgress.length === 0}
        <EmptyState
          title="No onboarding in progress"
          description={data.onboardingConfig ? 'Start onboarding for a new member.' : 'Configure onboarding settings first.'}
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
              {#each data.onboardingProgress as prog}
                <tr>
                  <td class="px-4 py-3 font-medium text-[var(--cs-text)]">{getMemberName(prog.memberDid)}</td>
                  <td class="px-4 py-3"><Badge variant={obStatusToVariant(prog.status)}>{prog.status}</Badge></td>
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
                    {prog.milestonesCompleted.length}{#if data.onboardingConfig?.milestones?.length}/{data.onboardingConfig.milestones.length}{/if}
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
        {#if data.onboardingProgressCursor}
          <div class="flex justify-center pt-2">
            <a href="?tab=onboarding&cursor={data.onboardingProgressCursor}{data.onboardingFilterStatus ? `&status=${data.onboardingFilterStatus}` : ''}"
              class="text-sm text-[var(--cs-primary)] hover:underline">Load more</a>
          </div>
        {/if}
      {/if}
    {/if}

    <!-- Configuration Sub-Tab -->
    {#if obSubTab === 'config'}
      <form
        method="POST"
        action={data.onboardingConfig ? '?/updateConfig' : '?/createConfig'}
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
            <input id="probationDays" name="probationDurationDays" type="number" value={data.onboardingConfig?.probationDurationDays ?? 90}
              class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
          </div>
          <div>
            <label for="buyInAmount" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
              Buy-in Amount <span class="text-[var(--cs-text-muted)]">(optional)</span>
            </label>
            <input id="buyInAmount" name="buyInAmount" type="number" step="0.01" value={data.onboardingConfig?.buyInAmount ?? ''}
              class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
          </div>
        </div>

        <div class="flex flex-wrap gap-6">
          <div class="flex items-center gap-2">
            <input id="requireTraining" name="requireTraining" type="checkbox" checked={data.onboardingConfig?.requireTraining ?? false}
              class="rounded border-[var(--cs-input-border)]" />
            <label for="requireTraining" class="text-sm text-[var(--cs-text-secondary)]">Require training</label>
          </div>
          <div class="flex items-center gap-2">
            <input id="requireBuyIn" name="requireBuyIn" type="checkbox" checked={data.onboardingConfig?.requireBuyIn ?? false}
              class="rounded border-[var(--cs-input-border)]" />
            <label for="requireBuyIn" class="text-sm text-[var(--cs-text-secondary)]">Require buy-in</label>
          </div>
          <div class="flex items-center gap-2">
            <input id="buddySystem" name="buddySystemEnabled" type="checkbox" checked={data.onboardingConfig?.buddySystemEnabled ?? false}
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
            {submitting ? 'Saving...' : data.onboardingConfig ? 'Update configuration' : 'Create configuration'}
          </button>
        </div>
      </form>
    {/if}
  {/if}
</div>

<!-- Invite Modal -->
<Modal open={inviteOpen} title="Invite Member" onclose={() => (inviteOpen = false)}>
  {#if form?.inviteError}
    <div class="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{form.inviteError}</div>
  {/if}
  <form
    method="POST"
    action="?/invite"
    use:enhance={() => {
      submitting = true;
      return async ({ update }) => {
        submitting = false;
        await update();
      };
    }}
    class="space-y-4"
  >
    <div>
      <label for="inviteEmail" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Email</label>
      <input
        id="inviteEmail"
        name="email"
        type="email"
        required
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        placeholder="member@example.com"
      />
    </div>
    <div>
      <label for="inviteRoles" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
        Roles <span class="text-[var(--cs-text-muted)]">(comma-separated)</span>
      </label>
      <input
        id="inviteRoles"
        name="roles"
        type="text"
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        placeholder="member, admin"
      />
    </div>
    <div>
      <label for="inviteMessage" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
        Message <span class="text-[var(--cs-text-muted)]">(optional)</span>
      </label>
      <textarea
        id="inviteMessage"
        name="message"
        rows={2}
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        placeholder="Welcome to our co-op!"
      ></textarea>
    </div>
    <div class="flex justify-end gap-3">
      <button
        type="button"
        onclick={() => (inviteOpen = false)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50"
      >
        {submitting ? 'Sending...' : 'Send invitation'}
      </button>
    </div>
  </form>
</Modal>

<!-- Confirm Remove Modal -->
<Modal
  open={confirmRemoveDid !== null}
  title="Remove Member"
  onclose={() => (confirmRemoveDid = null)}
>
  <p class="mb-4 text-sm text-[var(--cs-text-secondary)]">
    Are you sure you want to remove this member from the cooperative?
  </p>
  <form method="POST" action="?/remove" use:enhance>
    <input type="hidden" name="did" value={confirmRemoveDid ?? ''} />
    <div class="flex justify-end gap-3">
      <button
        type="button"
        onclick={() => (confirmRemoveDid = null)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
      >
        Cancel
      </button>
      <button
        type="submit"
        class="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
      >
        Remove
      </button>
    </div>
  </form>
</Modal>

<!-- Start Onboarding Modal -->
<Modal open={startModalOpen} title="Start Onboarding" onclose={() => (startModalOpen = false)}>
  <form method="POST" action="?/startOnboarding"
    use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }}
    class="space-y-4">
    <div>
      <label for="startMember" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Member</label>
      <select id="startMember" name="memberDid" required bind:value={selectedMemberDid}
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]">
        <option value="">Select member...</option>
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
        {submitting ? 'Starting...' : 'Start onboarding'}
      </button>
    </div>
  </form>
</Modal>
