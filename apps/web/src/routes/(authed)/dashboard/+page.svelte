<script lang="ts">
  import { Badge } from '$lib/components/ui';

  let { data } = $props();

  const coop = $derived(data.cooperative);
  const proposals = $derived(data.proposals);
  const agreements = $derived(data.agreements);

  function statusToVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
    switch (status) {
      case 'active': case 'accepted': case 'resolved': case 'signed': return 'success';
      case 'pending': case 'open': case 'closed': return 'warning';
      case 'revoked': case 'void': case 'voided': return 'danger';
      default: return 'default';
    }
  }
</script>

<svelte:head>
  <title>Dashboard — Co-op Source</title>
</svelte:head>

<div class="space-y-6">
  <h1 class="text-xl font-semibold text-[var(--cs-text)]">Dashboard</h1>

  <!-- Co-op Info Card -->
  {#if coop}
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-5">
      <div class="flex items-start justify-between">
        <div>
          <h2 class="text-base font-semibold text-[var(--cs-text)]">{coop.displayName}</h2>
          {#if coop.handle}
            <p class="text-sm text-[var(--cs-text-muted)]">@{coop.handle}</p>
          {/if}
          {#if coop.description}
            <p class="mt-2 text-sm text-[var(--cs-text-secondary)]">{coop.description}</p>
          {/if}
          {#if coop.website}
            <a
              href={coop.website}
              target="_blank"
              rel="noreferrer"
              class="mt-1 block text-sm text-blue-600 hover:underline"
            >
              {coop.website}
            </a>
          {/if}
        </div>
        <Badge variant={statusToVariant(coop.status)}>{coop.status}</Badge>
      </div>
    </div>
  {/if}

  <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
    <!-- Recent Proposals -->
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
      <div class="flex items-center justify-between border-b border-[var(--cs-border)] px-5 py-4">
        <h2 class="text-sm font-semibold text-[var(--cs-text)]">Recent Proposals</h2>
        <a href="/proposals" class="text-xs text-blue-600 hover:underline">View all →</a>
      </div>
      {#if proposals.length === 0}
        <p class="px-5 py-6 text-sm text-[var(--cs-text-muted)]">No proposals yet.</p>
      {:else}
        <ul class="divide-y divide-[var(--cs-border)]">
          {#each proposals as proposal}
            <li class="px-5 py-3">
              <a href="/proposals/{proposal.id}" class="block hover:bg-[var(--cs-bg-inset)] -mx-5 px-5 py-1 rounded">
                <div class="flex items-center justify-between">
                  <span class="text-sm font-medium text-[var(--cs-text)] truncate">{proposal.title}</span>
                  <Badge variant={statusToVariant(proposal.status)} class="ml-2 shrink-0">{proposal.status}</Badge>
                </div>
                <p class="text-xs text-[var(--cs-text-muted)] mt-0.5">
                  by {proposal.authorDisplayName} ·
                  {new Date(proposal.createdAt).toLocaleDateString()}
                </p>
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <!-- Recent Agreements -->
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
      <div class="flex items-center justify-between border-b border-[var(--cs-border)] px-5 py-4">
        <h2 class="text-sm font-semibold text-[var(--cs-text)]">Recent Agreements</h2>
        <a href="/agreements" class="text-xs text-blue-600 hover:underline">View all →</a>
      </div>
      {#if agreements.length === 0}
        <p class="px-5 py-6 text-sm text-[var(--cs-text-muted)]">No agreements yet.</p>
      {:else}
        <ul class="divide-y divide-[var(--cs-border)]">
          {#each agreements as agreement}
            <li class="px-5 py-3">
              <a href="/agreements/{agreement.id}" class="block hover:bg-[var(--cs-bg-inset)] -mx-5 px-5 py-1 rounded">
                <div class="flex items-center justify-between">
                  <span class="text-sm font-medium text-[var(--cs-text)] truncate">{agreement.title}</span>
                  <Badge variant={statusToVariant(agreement.status)} class="ml-2 shrink-0">{agreement.status}</Badge>
                </div>
                <p class="text-xs text-[var(--cs-text-muted)] mt-0.5">
                  by {agreement.authorDisplayName} ·
                  {new Date(agreement.createdAt).toLocaleDateString()}
                </p>
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
</div>
