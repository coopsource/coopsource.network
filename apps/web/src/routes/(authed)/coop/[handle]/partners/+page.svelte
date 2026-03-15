<script lang="ts">
  import { enhance } from '$app/forms';
  import { Badge, EmptyState, Modal, Tabs } from '$lib/components/ui';

  let { data, form } = $props();

  let activeTab = $state('partners');
  let createOpen = $state(false);
  let submitting = $state(false);

  $effect(() => {
    if (form?.success) {
      createOpen = false;
    }
  });

  const tabs = [
    { id: 'partners', label: 'Partners', count: data.partners.length },
    { id: 'pending', label: 'Pending', count: data.links.filter((l) => l.status === 'pending').length },
    { id: 'all', label: 'All Links', count: data.links.length },
  ];

  function linkTypeToVariant(type: string): 'primary' | 'success' | 'warning' | 'default' {
    switch (type) {
      case 'partnership': return 'primary';
      case 'federation': return 'success';
      case 'supply_chain': return 'warning';
      default: return 'default';
    }
  }

  function statusToVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
    switch (status) {
      case 'active': return 'success';
      case 'pending': return 'warning';
      case 'dissolved': return 'danger';
      default: return 'default';
    }
  }

  const pendingLinks = $derived(data.links.filter((l) => l.status === 'pending'));
</script>

<svelte:head>
  <title>Partners — Co-op Source</title>
</svelte:head>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">Partners</h1>
    <button type="button" onclick={() => (createOpen = true)}
      class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]">
      Create link
    </button>
  </div>

  {#if form?.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}
  {#if form?.success}
    <div class="rounded-md bg-green-50 p-3 text-sm text-green-700">Updated successfully.</div>
  {/if}

  <Tabs {tabs} bind:active={activeTab} />

  {#if activeTab === 'partners'}
    {#if data.partners.length === 0}
      <EmptyState title="No partners" description="Create a cooperative link to establish partnerships." />
    {:else}
      <div class="space-y-2">
        {#each data.partners as partner}
          <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="font-medium text-[var(--cs-text)]">{partner.displayName}</h3>
                {#if partner.handle}
                  <p class="text-xs text-[var(--cs-text-muted)]">@{partner.handle}</p>
                {/if}
              </div>
              <div class="flex items-center gap-2">
                <Badge variant={linkTypeToVariant(partner.linkType)}>{partner.linkType}</Badge>
                <span class="text-xs text-[var(--cs-text-muted)]">
                  Since {new Date(partner.linkedSince).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  {#if activeTab === 'pending'}
    {#if pendingLinks.length === 0}
      <EmptyState title="No pending links" description="No cooperative link requests awaiting response." />
    {:else}
      <div class="space-y-2">
        {#each pendingLinks as link}
          <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-sm text-[var(--cs-text)]">
                  <strong>{link.initiatorDid}</strong> → <strong>{link.targetDid}</strong>
                </p>
                <p class="mt-1 text-xs text-[var(--cs-text-muted)]">
                  {link.linkType} · {new Date(link.initiatedAt).toLocaleDateString()}
                </p>
                {#if link.description}
                  <p class="mt-1 text-sm text-[var(--cs-text-secondary)]">{link.description}</p>
                {/if}
              </div>
              <div class="flex gap-2">
                <form method="POST" action="?/respond" use:enhance>
                  <input type="hidden" name="id" value={link.id} />
                  <input type="hidden" name="accept" value="true" />
                  <button type="submit" class="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700">Accept</button>
                </form>
                <form method="POST" action="?/respond" use:enhance>
                  <input type="hidden" name="id" value={link.id} />
                  <input type="hidden" name="accept" value="false" />
                  <button type="submit" class="rounded-md border border-[var(--cs-border)] px-3 py-1 text-xs text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]">Decline</button>
                </form>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  {#if activeTab === 'all'}
    {#if data.links.length === 0}
      <EmptyState title="No links" description="Create your first cooperative link." />
    {:else}
      <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-[var(--cs-border)] text-left">
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Initiator</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Target</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Type</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Status</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Date</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[var(--cs-border)]">
            {#each data.links as link}
              <tr>
                <td class="px-4 py-3 text-[var(--cs-text)] truncate max-w-[140px]">{link.initiatorDid}</td>
                <td class="px-4 py-3 text-[var(--cs-text)] truncate max-w-[140px]">{link.targetDid}</td>
                <td class="px-4 py-3"><Badge variant={linkTypeToVariant(link.linkType)}>{link.linkType}</Badge></td>
                <td class="px-4 py-3"><Badge variant={statusToVariant(link.status)}>{link.status}</Badge></td>
                <td class="px-4 py-3 text-[var(--cs-text-muted)]">{new Date(link.createdAt).toLocaleDateString()}</td>
                <td class="px-4 py-3 text-right">
                  {#if link.status === 'active'}
                    <form method="POST" action="?/dissolve" use:enhance class="inline">
                      <input type="hidden" name="id" value={link.id} />
                      <button type="submit" class="text-xs text-red-600 hover:underline">Dissolve</button>
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
</div>

<!-- Create Link Modal -->
<Modal open={createOpen} title="Create Cooperative Link" onclose={() => (createOpen = false)}>
  <form method="POST" action="?/create"
    use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }}
    class="space-y-4">
    <div>
      <label for="targetDid" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Target DID</label>
      <input id="targetDid" name="targetDid" type="text" required
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        placeholder="did:plc:..." />
    </div>
    <div>
      <label for="linkType" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Link Type</label>
      <select id="linkType" name="linkType" required
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]">
        <option value="">Select type…</option>
        <option value="partnership">Partnership</option>
        <option value="supply_chain">Supply Chain</option>
        <option value="shared_infrastructure">Shared Infrastructure</option>
        <option value="federation">Federation</option>
        <option value="other">Other</option>
      </select>
    </div>
    <div>
      <label for="linkDesc" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
        Description <span class="text-[var(--cs-text-muted)]">(optional)</span>
      </label>
      <textarea id="linkDesc" name="description" rows={2}
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"></textarea>
    </div>
    <div class="flex justify-end gap-3">
      <button type="button" onclick={() => (createOpen = false)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]">Cancel</button>
      <button type="submit" disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50">
        {submitting ? 'Creating…' : 'Create link'}
      </button>
    </div>
  </form>
</Modal>
