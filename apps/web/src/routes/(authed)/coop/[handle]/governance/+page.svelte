<script lang="ts">
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { Badge, EmptyState, Modal, Tabs } from '$lib/components/ui';
  import { workspacePrefix } from '$lib/utils/workspace.js';
  import type { Member } from '$lib/api/types.js';

  let { data, form } = $props();

  let activeTab = $state(data.activeTab ?? 'proposals');
  let delegationOpen = $state(false);
  let legalCreateOpen = $state(false);
  let submitting = $state(false);

  $effect(() => {
    if (form?.delegationSuccess) {
      delegationOpen = false;
    }
  });

  $effect(() => {
    if (form?.legalSuccess && form?.documentId) {
      legalCreateOpen = false;
      goto(`${$workspacePrefix}/legal/${form.documentId}`);
    }
  });

  const tabs = [
    { id: 'proposals', label: 'Proposals', count: data.proposals.length },
    { id: 'delegations', label: 'Delegations', count: data.delegations.length },
    { id: 'feed', label: 'Feed', count: data.actionItems.length },
    { id: 'agreements', label: 'Agreements', count: data.agreements.length },
    { id: 'legal', label: 'Legal', count: data.legalDocuments.length },
  ];

  const statusFilters = [
    { value: '', label: 'All' },
    { value: 'draft', label: 'Draft' },
    { value: 'open', label: 'Open' },
    { value: 'closed', label: 'Closed' },
    { value: 'resolved', label: 'Resolved' },
  ];

  const agreementStatusFilters = [
    { value: '', label: 'All' },
    { value: 'draft', label: 'Draft' },
    { value: 'open', label: 'Open' },
    { value: 'active', label: 'Active' },
    { value: 'terminated', label: 'Terminated' },
    { value: 'voided', label: 'Voided' },
  ];

  const legalStatusFilters = [
    { value: '', label: 'All' },
    { value: 'draft', label: 'Draft' },
    { value: 'active', label: 'Active' },
    { value: 'archived', label: 'Archived' },
  ];

  const legalTypeFilters = [
    { value: '', label: 'All types' },
    { value: 'bylaws', label: 'Bylaws' },
    { value: 'articles', label: 'Articles' },
    { value: 'policy', label: 'Policy' },
    { value: 'resolution', label: 'Resolution' },
    { value: 'other', label: 'Other' },
  ];

  function statusToVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
    switch (status) {
      case 'active': case 'accepted': case 'resolved': case 'signed': return 'success';
      case 'pending': case 'open': case 'closed': case 'amended': return 'warning';
      case 'revoked': case 'void': case 'voided': case 'terminated': return 'danger';
      default: return 'default';
    }
  }

  function getMemberName(did: string): string {
    const member = data.members.find((m: Member) => m.did === did);
    return member?.displayName ?? did;
  }
</script>

<svelte:head>
  <title>Governance — Co-op Source</title>
</svelte:head>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">Governance</h1>
    <div class="flex gap-2">
      {#if activeTab === 'delegations'}
        <button type="button" onclick={() => (delegationOpen = true)}
          class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]">
          New delegation
        </button>
      {:else if activeTab === 'proposals'}
        <a href="{$workspacePrefix}/governance/new"
          class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]">
          New proposal
        </a>
      {:else if activeTab === 'agreements'}
        <a href="{$workspacePrefix}/agreements/templates"
          class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text)] hover:bg-[var(--cs-bg-hover)]">
          Templates
        </a>
        <a href="{$workspacePrefix}/agreements/new"
          class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]">
          New agreement
        </a>
      {:else if activeTab === 'legal'}
        <a href="{$workspacePrefix}/legal/meetings"
          class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]">
          Meeting Records
        </a>
        <button type="button" onclick={() => (legalCreateOpen = true)}
          class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]">
          New document
        </button>
      {/if}
    </div>
  </div>

  {#if form?.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}

  <Tabs {tabs} bind:active={activeTab} />

  <!-- Proposals Tab -->
  {#if activeTab === 'proposals'}
    <div class="flex gap-1 border-b border-[var(--cs-border)]">
      {#each statusFilters as filter}
        <a
          href={filter.value ? `?status=${filter.value}` : `${$workspacePrefix}/governance`}
          class="px-3 py-2 text-sm font-medium transition-colors
            {data.filterStatus === filter.value
              ? 'border-b-2 border-[var(--cs-primary)] text-[var(--cs-primary)]'
              : 'text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)]'}"
        >
          {filter.label}
        </a>
      {/each}
    </div>

    {#if data.proposals.length === 0}
      <EmptyState
        title="No proposals"
        description="Create your first proposal to start a discussion."
      />
    {:else}
      <div class="space-y-2">
        {#each data.proposals as proposal}
          <a
            href="{$workspacePrefix}/governance/{proposal.id}"
            class="block rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4 hover:border-[var(--cs-border-hover)] hover:shadow-sm"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <h3 class="font-medium text-[var(--cs-text)]">{proposal.title}</h3>
                <p class="mt-1 line-clamp-2 text-sm text-[var(--cs-text-muted)]">{proposal.body}</p>
                <p class="mt-2 text-xs text-[var(--cs-text-muted)]">
                  {proposal.proposalType} · by {proposal.authorDisplayName} ·
                  {new Date(proposal.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Badge variant={statusToVariant(proposal.status)} class="shrink-0">{proposal.status}</Badge>
            </div>
          </a>
        {/each}
      </div>
    {/if}
  {/if}

  <!-- Delegations Tab -->
  {#if activeTab === 'delegations'}
    {#if data.delegations.length === 0}
      <EmptyState title="No delegations" description="Delegate your vote to another member." />
    {:else}
      <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-[var(--cs-border)] text-left">
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">From</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">To</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Scope</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Status</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Created</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[var(--cs-border)]">
            {#each data.delegations as del}
              <tr>
                <td class="px-4 py-3 font-medium text-[var(--cs-text)]">{getMemberName(del.delegatorDid)}</td>
                <td class="px-4 py-3 text-[var(--cs-text-secondary)]">{getMemberName(del.delegateeDid)}</td>
                <td class="px-4 py-3">
                  <span class="rounded bg-[var(--cs-bg-inset)] px-1.5 py-0.5 text-xs text-[var(--cs-text-secondary)]">{del.scope}</span>
                </td>
                <td class="px-4 py-3"><Badge variant={statusToVariant(del.status)}>{del.status}</Badge></td>
                <td class="px-4 py-3 text-[var(--cs-text-muted)]">{new Date(del.createdAt).toLocaleDateString()}</td>
                <td class="px-4 py-3 text-right">
                  {#if del.status === 'active'}
                    <form method="POST" action="?/revokeDelegation" use:enhance class="inline">
                      <input type="hidden" name="uri" value={del.uri} />
                      <button type="submit" class="text-xs text-red-600 hover:underline">Revoke</button>
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

  <!-- Feed Tab -->
  {#if activeTab === 'feed'}
    {#if data.actionItems.length === 0 && data.outcomes.length === 0}
      <EmptyState title="No activity" description="Governance activity will appear here." />
    {:else}
      {#if data.actionItems.length > 0}
        <h3 class="text-sm font-semibold text-[var(--cs-text)]">Action Items</h3>
        <div class="space-y-2">
          {#each data.actionItems as item}
            <a href="{$workspacePrefix}/governance/{item.proposalId}"
              class="block rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-3 hover:border-[var(--cs-border-hover)]">
              <div class="flex items-center justify-between">
                <div>
                  <span class="text-sm font-medium text-[var(--cs-text)]">{item.title}</span>
                  <span class="ml-2 text-xs text-[var(--cs-text-muted)]">{item.type}</span>
                </div>
                <Badge variant={statusToVariant(item.status)}>{item.status}</Badge>
              </div>
              {#if item.closesAt}
                <p class="mt-1 text-xs text-[var(--cs-text-muted)]">
                  Closes {new Date(item.closesAt).toLocaleDateString()}
                </p>
              {/if}
            </a>
          {/each}
        </div>
      {/if}

      {#if data.outcomes.length > 0}
        <h3 class="mt-4 text-sm font-semibold text-[var(--cs-text)]">Recent Outcomes</h3>
        <div class="space-y-2">
          {#each data.outcomes as item}
            <a href="{$workspacePrefix}/governance/{item.proposalId}"
              class="block rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-3 hover:border-[var(--cs-border-hover)]">
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium text-[var(--cs-text)]">{item.title}</span>
                {#if item.outcome}
                  <Badge variant={item.outcome === 'approved' ? 'success' : 'danger'}>{item.outcome}</Badge>
                {/if}
              </div>
            </a>
          {/each}
        </div>
      {/if}
    {/if}
  {/if}

  <!-- Agreements Tab -->
  {#if activeTab === 'agreements'}
    {#if data.agreements.length === 0}
      <EmptyState
        title="No agreements"
        description="Create your first agreement to get started."
      />
    {:else}
      <div class="space-y-2">
        {#each data.agreements as agreement}
          <a
            href="{$workspacePrefix}/agreements/{encodeURIComponent(agreement.uri)}"
            class="block rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4 hover:border-[var(--cs-border-hover)] hover:shadow-sm"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <h3 class="font-medium text-[var(--cs-text)]">{agreement.title}</h3>
                {#if agreement.purpose}
                  <p class="mt-1 line-clamp-2 text-sm text-[var(--cs-text-muted)]">{agreement.purpose}</p>
                {:else if agreement.body}
                  <p class="mt-1 line-clamp-2 text-sm text-[var(--cs-text-muted)]">{agreement.body}</p>
                {/if}
                <div class="mt-2 flex items-center gap-3 text-xs text-[var(--cs-text-muted)]">
                  <span>{agreement.agreementType}</span>
                  <span>v{agreement.version}</span>
                  <span>by {agreement.authorDisplayName}</span>
                  <span>{new Date(agreement.createdAt).toLocaleDateString()}</span>
                  {#if agreement.signatureCount > 0}
                    <span class="text-green-600">{agreement.signatureCount} signature{agreement.signatureCount !== 1 ? 's' : ''}</span>
                  {/if}
                  {#if agreement.effectiveDate}
                    <span class="text-green-600">Effective {new Date(agreement.effectiveDate).toLocaleDateString()}</span>
                  {/if}
                </div>
              </div>
              <Badge variant={statusToVariant(agreement.status)} class="shrink-0">{agreement.status}</Badge>
            </div>
          </a>
        {/each}
      </div>
    {/if}
  {/if}

  <!-- Legal Tab -->
  {#if activeTab === 'legal'}
    {#if data.legalDocuments.length === 0}
      <EmptyState
        title="No legal documents"
        description="Create your first legal document — bylaws, articles, policies, or resolutions."
      />
    {:else}
      <div class="space-y-2">
        {#each data.legalDocuments as doc}
          <a
            href="{$workspacePrefix}/legal/{doc.id}"
            class="block rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4 hover:border-[var(--cs-border-hover)] hover:shadow-sm"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <h3 class="font-medium text-[var(--cs-text)]">{doc.title}</h3>
                <p class="mt-2 text-xs text-[var(--cs-text-muted)]">
                  {doc.documentType} · v{doc.version} ·
                  {new Date(doc.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Badge variant={statusToVariant(doc.status)} class="shrink-0">{doc.status}</Badge>
            </div>
          </a>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<!-- Create Delegation Modal -->
<Modal open={delegationOpen} title="Delegate Vote" onclose={() => (delegationOpen = false)}>
  <form method="POST" action="?/createDelegation"
    use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }}
    class="space-y-4">
    <div>
      <label for="delegatee" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Delegate to</label>
      <select id="delegatee" name="delegateeDid" required
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]">
        <option value="">Select member…</option>
        {#each data.members as member}
          <option value={member.did}>{member.displayName}{member.handle ? ` (@${member.handle})` : ''}</option>
        {/each}
      </select>
    </div>
    <div>
      <label for="scope" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Scope</label>
      <select id="scope" name="scope"
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]">
        <option value="project">Project-wide</option>
        <option value="proposal">Single Proposal</option>
      </select>
    </div>
    <div class="flex justify-end gap-3">
      <button type="button" onclick={() => (delegationOpen = false)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]">Cancel</button>
      <button type="submit" disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50">
        {submitting ? 'Delegating…' : 'Delegate'}
      </button>
    </div>
  </form>
</Modal>

<!-- Create Legal Document Modal -->
<Modal open={legalCreateOpen} title="New Legal Document" onclose={() => (legalCreateOpen = false)}>
  {#if form?.error && activeTab === 'legal'}
    <div class="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}
  <form
    method="POST"
    action="?/createLegalDocument"
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
      <label for="docTitle" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Title</label>
      <input
        id="docTitle"
        name="title"
        type="text"
        required
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        placeholder="e.g. Cooperative Bylaws"
      />
    </div>
    <div>
      <label for="docType" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Document Type</label>
      <select
        id="docType"
        name="documentType"
        required
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      >
        <option value="">Select type...</option>
        <option value="bylaws">Bylaws</option>
        <option value="articles">Articles</option>
        <option value="policy">Policy</option>
        <option value="resolution">Resolution</option>
        <option value="other">Other</option>
      </select>
    </div>
    <div>
      <label for="docStatus" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Status</label>
      <select
        id="docStatus"
        name="status"
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      >
        <option value="draft">Draft</option>
        <option value="active">Active</option>
      </select>
    </div>
    <div>
      <label for="docBody" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Body</label>
      <textarea
        id="docBody"
        name="body"
        rows={6}
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        placeholder="Document content..."
      ></textarea>
    </div>
    <div class="flex justify-end gap-3">
      <button
        type="button"
        onclick={() => (legalCreateOpen = false)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50"
      >
        {submitting ? 'Creating...' : 'Create document'}
      </button>
    </div>
  </form>
</Modal>
