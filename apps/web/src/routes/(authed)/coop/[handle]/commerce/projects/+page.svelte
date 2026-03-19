<script lang="ts">
  import { enhance } from '$app/forms';
  import { Badge, EmptyState, Modal } from '$lib/components/ui';
  import { workspacePrefix } from '$lib/utils/workspace.js';
  import type { CollaborativeProject, IntercoopAgreement } from '$lib/api/types.js';

  let { data, form } = $props();

  let showProjectForm = $state(false);
  let showAgreementForm = $state(false);
  let submitting = $state(false);
  let activeTab = $state<'projects' | 'agreements'>('projects');

  $effect(() => {
    if (form?.success) {
      showProjectForm = false;
      showAgreementForm = false;
    }
  });

  const statusFilters = [
    { value: '', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'proposed', label: 'Proposed' },
    { value: 'completed', label: 'Completed' },
  ];

  function projectStatusVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
    switch (status) {
      case 'active': return 'success';
      case 'proposed': return 'warning';
      case 'completed': return 'default';
      case 'cancelled': return 'danger';
      default: return 'default';
    }
  }

  function agreementStatusVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
    switch (status) {
      case 'active': case 'accepted': return 'success';
      case 'proposed': case 'pending': return 'warning';
      case 'rejected': case 'terminated': return 'danger';
      default: return 'default';
    }
  }
</script>

<svelte:head>
  <title>Projects & Agreements — Co-op Source</title>
</svelte:head>

<div class="space-y-4">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">Projects & Agreements</h1>
    <div class="flex gap-2">
      <button
        type="button"
        onclick={() => (showAgreementForm = true)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
      >New Agreement</button>
      <button
        type="button"
        onclick={() => (showProjectForm = true)}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]"
      >New Project</button>
    </div>
  </div>

  {#if form?.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}

  <!-- Tab Toggle -->
  <div class="flex rounded-md border border-[var(--cs-border)] bg-[var(--cs-bg-card)] w-fit">
    <button
      type="button"
      onclick={() => (activeTab = 'projects')}
      class="px-4 py-1.5 text-sm font-medium transition-colors {activeTab === 'projects' ? 'bg-[var(--cs-primary)] text-[var(--cs-text-on-primary)]' : 'text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)]'} rounded-l-md"
    >Projects ({data.projects.length})</button>
    <button
      type="button"
      onclick={() => (activeTab = 'agreements')}
      class="px-4 py-1.5 text-sm font-medium transition-colors {activeTab === 'agreements' ? 'bg-[var(--cs-primary)] text-[var(--cs-text-on-primary)]' : 'text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)]'} rounded-r-md"
    >Agreements ({data.agreements.length})</button>
  </div>

  <!-- Status Filters -->
  <div class="flex gap-1">
    {#each statusFilters as filter}
      <a
        href={filter.value
          ? `${$workspacePrefix}/commerce/projects?status=${filter.value}`
          : `${$workspacePrefix}/commerce/projects`}
        class="px-3 py-1.5 text-xs font-medium rounded-full transition-colors
          {data.filterStatus === filter.value
            ? 'bg-[var(--cs-primary)] text-[var(--cs-text-on-primary)]'
            : 'bg-[var(--cs-bg-inset)] text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)]'}"
      >{filter.label}</a>
    {/each}
  </div>

  <!-- Projects Tab -->
  {#if activeTab === 'projects'}
    {#if data.projects.length === 0}
      <EmptyState title="No collaborative projects" description="Start a project to work jointly with other cooperatives." />
    {:else}
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {#each data.projects as project (project.id)}
          <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4 hover:border-[var(--cs-border-hover)] transition-colors">
            <div class="flex items-start justify-between gap-2">
              <h3 class="font-medium text-[var(--cs-text)]">{project.title}</h3>
              <Badge variant={projectStatusVariant(project.status)}>{project.status}</Badge>
            </div>
            {#if project.description}
              <p class="mt-1 text-sm text-[var(--cs-text-secondary)] line-clamp-2">{project.description}</p>
            {/if}
            <div class="mt-3 flex items-center gap-3 text-xs text-[var(--cs-text-muted)]">
              <span class="rounded-full bg-[var(--cs-bg-inset)] px-2 py-0.5">
                {project.participantDids.length} participant{project.participantDids.length !== 1 ? 's' : ''}
              </span>
              <span>{new Date(project.createdAt).toLocaleDateString()}</span>
            </div>
            {#if project.revenueSplit}
              <div class="mt-2 text-xs text-[var(--cs-text-muted)]">
                Revenue split configured
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  <!-- Agreements Tab -->
  {#if activeTab === 'agreements'}
    {#if data.agreements.length === 0}
      <EmptyState title="No inter-coop agreements" description="Create an agreement to formalize trade with another cooperative." />
    {:else}
      <div class="space-y-3">
        {#each data.agreements as agreement (agreement.id)}
          <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4 hover:border-[var(--cs-border-hover)] transition-colors">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <h3 class="font-medium text-[var(--cs-text)]">{agreement.title}</h3>
                  <Badge variant={agreementStatusVariant(agreement.status)}>{agreement.status}</Badge>
                </div>
                {#if agreement.description}
                  <p class="mt-1 text-sm text-[var(--cs-text-secondary)] line-clamp-2">{agreement.description}</p>
                {/if}
                <div class="mt-2 flex items-center gap-3 text-xs text-[var(--cs-text-muted)]">
                  <span class="rounded bg-[var(--cs-bg-inset)] px-1.5 py-0.5">{agreement.agreementType}</span>
                  <span>{new Date(agreement.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              {#if agreement.status === 'proposed' || agreement.status === 'pending'}
                <div class="flex gap-1">
                  <form method="POST" action="?/respondToAgreement" use:enhance class="inline">
                    <input type="hidden" name="id" value={agreement.id} />
                    <input type="hidden" name="accept" value="true" />
                    <button type="submit" class="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100">Accept</button>
                  </form>
                  <form method="POST" action="?/respondToAgreement" use:enhance class="inline">
                    <input type="hidden" name="id" value={agreement.id} />
                    <input type="hidden" name="accept" value="false" />
                    <button type="submit" class="rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100">Decline</button>
                  </form>
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<!-- Create Project Modal -->
<Modal open={showProjectForm} title="New Collaborative Project" onclose={() => (showProjectForm = false)}>
  <form
    method="POST"
    action="?/createProject"
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
      <label for="proj-title" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Title</label>
      <input
        id="proj-title"
        name="title"
        type="text"
        required
        placeholder="Project name..."
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      />
    </div>

    <div>
      <label for="proj-description" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Description</label>
      <textarea
        id="proj-description"
        name="description"
        rows="3"
        placeholder="Describe the project..."
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      ></textarea>
    </div>

    <div>
      <label for="proj-participants" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Participant DIDs</label>
      <input
        id="proj-participants"
        name="participantDids"
        type="text"
        placeholder="Comma-separated DIDs of participating cooperatives"
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      />
      <p class="mt-1 text-xs text-[var(--cs-text-muted)]">Enter the DIDs of cooperatives that will participate.</p>
    </div>

    <div class="flex justify-end gap-3">
      <button
        type="button"
        onclick={() => (showProjectForm = false)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
      >Cancel</button>
      <button
        type="submit"
        disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50"
      >{submitting ? 'Creating...' : 'Create Project'}</button>
    </div>
  </form>
</Modal>

<!-- Create Agreement Modal -->
<Modal open={showAgreementForm} title="New Inter-Coop Agreement" onclose={() => (showAgreementForm = false)}>
  <form
    method="POST"
    action="?/createAgreement"
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
      <label for="agmt-title" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Title</label>
      <input
        id="agmt-title"
        name="title"
        type="text"
        required
        placeholder="Agreement title..."
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      />
    </div>

    <div>
      <label for="agmt-responder" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Responder DID</label>
      <input
        id="agmt-responder"
        name="responderDid"
        type="text"
        required
        placeholder="did:plc:..."
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      />
      <p class="mt-1 text-xs text-[var(--cs-text-muted)]">The DID of the cooperative you want to create an agreement with.</p>
    </div>

    <div>
      <label for="agmt-type" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Agreement Type</label>
      <select
        id="agmt-type"
        name="agreementType"
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      >
        <option value="trade">Trade</option>
        <option value="service">Service</option>
        <option value="resource_sharing">Resource Sharing</option>
        <option value="joint_venture">Joint Venture</option>
      </select>
    </div>

    <div>
      <label for="agmt-description" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Description</label>
      <textarea
        id="agmt-description"
        name="description"
        rows="3"
        placeholder="Describe the terms of the agreement..."
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      ></textarea>
    </div>

    <div class="flex justify-end gap-3">
      <button
        type="button"
        onclick={() => (showAgreementForm = false)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
      >Cancel</button>
      <button
        type="submit"
        disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50"
      >{submitting ? 'Creating...' : 'Propose Agreement'}</button>
    </div>
  </form>
</Modal>
