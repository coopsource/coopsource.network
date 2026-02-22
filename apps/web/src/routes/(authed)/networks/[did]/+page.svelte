<script lang="ts">
  import { enhance } from '$app/forms';
  import { Badge, EmptyState } from '$lib/components/ui';

  let { data, form } = $props();

  const network = $derived(data.network);
  const members = $derived(data.members);
  const coopDid = $derived(data.cooperative?.did);
  const isMember = $derived(members.some((m: { did: string }) => m.did === coopDid));
</script>

<svelte:head>
  <title>{network.displayName} — Co-op Source</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6">
  <div class="flex items-center gap-3">
    <a href="/networks" class="text-sm text-[var(--cs-text-muted)] hover:text-[var(--cs-text-secondary)]">← Networks</a>
  </div>

  {#if form?.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}

  {#if form?.joinSuccess}
    <div class="rounded-md bg-green-50 p-3 text-sm text-green-700">Joined network successfully.</div>
  {/if}

  {#if form?.leaveSuccess}
    <div class="rounded-md bg-green-50 p-3 text-sm text-green-700">Left network successfully.</div>
  {/if}

  <!-- Network Header -->
  <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-6">
    <div class="mb-4 flex items-start justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold text-[var(--cs-text)]">{network.displayName}</h1>
        {#if network.description}
          <p class="mt-2 text-sm text-[var(--cs-text-secondary)]">{network.description}</p>
        {/if}
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <Badge variant="primary">{network.cooperativeType}</Badge>
        <Badge variant="outline">{network.memberCount} member{network.memberCount !== 1 ? 's' : ''}</Badge>
      </div>
    </div>

    {#if network.website}
      <p class="text-sm text-[var(--cs-text-muted)]">
        <a href={network.website} target="_blank" rel="noopener" class="hover:underline">{network.website}</a>
      </p>
    {/if}

    <div class="mt-4">
      {#if isMember}
        <form method="POST" action="?/leave" use:enhance>
          <button
            type="submit"
            class="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Leave network
          </button>
        </form>
      {:else}
        <form method="POST" action="?/join" use:enhance>
          <button
            type="submit"
            class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Join network
          </button>
        </form>
      {/if}
    </div>
  </div>

  <!-- Members Section -->
  <div>
    <h2 class="mb-3 text-base font-semibold text-[var(--cs-text)]">Member Cooperatives</h2>

    {#if members.length === 0}
      <EmptyState
        title="No members yet"
        description="This network has no cooperative members."
      />
    {:else}
      <div class="space-y-2">
        {#each members as member}
          <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <h3 class="font-medium text-[var(--cs-text)]">{member.displayName}</h3>
                {#if member.description}
                  <p class="mt-1 text-sm text-[var(--cs-text-secondary)]">{member.description}</p>
                {/if}
                {#if member.joinedAt}
                  <p class="mt-1 text-xs text-[var(--cs-text-muted)]">
                    Joined {new Date(member.joinedAt).toLocaleDateString()}
                  </p>
                {/if}
              </div>
              <Badge variant="default">{member.cooperativeType}</Badge>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
