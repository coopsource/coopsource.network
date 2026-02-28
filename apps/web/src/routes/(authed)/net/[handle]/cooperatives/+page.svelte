<script lang="ts">
  import { Badge, EmptyState } from '$lib/components/ui';

  let { data } = $props();

  const members = $derived(data.members);
</script>

<svelte:head>
  <title>Network Cooperatives — Co-op Source</title>
</svelte:head>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">Member Cooperatives</h1>
  </div>

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

  {#if data.cursor}
    <div class="flex justify-center pt-2">
      <a
        href="?cursor={data.cursor}"
        class="rounded-md border border-[var(--cs-border)] px-4 py-2 text-sm font-medium text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
      >
        Load more
      </a>
    </div>
  {/if}
</div>
