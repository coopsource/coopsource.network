<script lang="ts">
  import { Badge, EmptyState } from '$lib/components/ui';
  import { workspacePrefix } from '$lib/utils/workspace.js';

  let { data } = $props();

  const threads = $derived(data.threads);

  function threadTypeVariant(threadType: string): 'default' | 'primary' | 'success' | 'warning' {
    switch (threadType) {
      case 'announcement': return 'warning';
      case 'direct': return 'primary';
      default: return 'default';
    }
  }
</script>

<svelte:head>
  <title>Posts — Co-op Source</title>
</svelte:head>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">Posts</h1>
    <a
      href="{$workspacePrefix}/posts/new"
      class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]"
    >
      New thread
    </a>
  </div>

  {#if threads.length === 0}
    <EmptyState
      title="No threads"
      description="Start a new thread to begin a conversation."
    />
  {:else}
    <div class="space-y-2">
      {#each threads as thread}
        <a
          href="{$workspacePrefix}/posts/{thread.id}"
          class="block rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4 hover:border-[var(--cs-border-hover)] hover:shadow-sm"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <h3 class="font-medium text-[var(--cs-text)]">
                {thread.title ?? 'Untitled thread'}
              </h3>
              <p class="mt-2 text-xs text-[var(--cs-text-muted)]">
                {thread.memberCount} member{thread.memberCount !== 1 ? 's' : ''} ·
                {new Date(thread.createdAt).toLocaleDateString()}
              </p>
            </div>
            <Badge variant={threadTypeVariant(thread.threadType)} class="shrink-0">
              {thread.threadType}
            </Badge>
          </div>
        </a>
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
