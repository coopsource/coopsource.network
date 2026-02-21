<script lang="ts">
  import { enhance } from '$app/forms';
  import { Badge } from '$lib/components/ui';

  let { data, form } = $props();

  const thread = $derived(data.thread);
  const posts = $derived(data.posts);
  const userDid = $derived(data.user?.did);

  let postBody = $state('');
  let submitting = $state(false);

  function truncateDid(did: string): string {
    if (did.length <= 24) return did;
    return did.slice(0, 16) + '…' + did.slice(-6);
  }

  function threadTypeVariant(threadType: string): 'default' | 'primary' | 'success' | 'warning' {
    switch (threadType) {
      case 'announcement': return 'warning';
      case 'direct': return 'primary';
      default: return 'default';
    }
  }
</script>

<svelte:head>
  <title>{thread.title ?? 'Untitled thread'} — Co-op Source</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6">
  <div class="flex items-center gap-3">
    <a href="/threads" class="text-sm text-[var(--cs-text-muted)] hover:text-[var(--cs-text-secondary)]">← Threads</a>
  </div>

  {#if form?.postError}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.postError}</div>
  {/if}

  {#if form?.postSuccess}
    <div class="rounded-md bg-green-50 p-3 text-sm text-green-700">Post created.</div>
  {/if}

  {#if form?.deleteSuccess}
    <div class="rounded-md bg-green-50 p-3 text-sm text-green-700">Post deleted.</div>
  {/if}

  <!-- Thread Header -->
  <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-6">
    <div class="mb-4 flex items-start justify-between gap-4">
      <h1 class="text-xl font-semibold text-[var(--cs-text)]">
        {thread.title ?? 'Untitled thread'}
      </h1>
      <div class="flex items-center gap-2 shrink-0">
        <Badge variant={threadTypeVariant(thread.threadType)}>{thread.threadType}</Badge>
        <Badge variant="outline">{thread.memberCount} member{thread.memberCount !== 1 ? 's' : ''}</Badge>
      </div>
    </div>

    <div class="flex flex-wrap gap-3 text-xs text-[var(--cs-text-muted)]">
      <span>Created {new Date(thread.createdAt).toLocaleDateString()}</span>
      <span>by {truncateDid(thread.createdBy)}</span>
    </div>
  </div>

  <!-- Posts List -->
  <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
    <h2 class="border-b border-[var(--cs-border)] px-5 py-4 text-sm font-semibold text-[var(--cs-text)]">
      Posts ({posts.length})
    </h2>

    {#if posts.length === 0}
      <p class="px-5 py-6 text-sm text-[var(--cs-text-muted)]">No posts yet. Start the conversation below.</p>
    {:else}
      <ul class="divide-y divide-[var(--cs-border)]">
        {#each posts as post}
          <li class="px-5 py-4">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-sm font-medium text-[var(--cs-text)]">{truncateDid(post.authorDid)}</span>
                  <span class="text-xs text-[var(--cs-text-muted)]">
                    {new Date(post.createdAt).toLocaleString()}
                  </span>
                  {#if post.editedAt}
                    <span class="text-xs text-[var(--cs-text-muted)] italic">(edited)</span>
                  {/if}
                </div>
                <div class="whitespace-pre-wrap text-sm text-[var(--cs-text-secondary)]">
                  {post.body}
                </div>
              </div>

              {#if post.authorDid === userDid}
                <form method="POST" action="?/deletePost" use:enhance>
                  <input type="hidden" name="postId" value={post.id} />
                  <button
                    type="submit"
                    class="shrink-0 rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    title="Delete post"
                  >
                    Delete
                  </button>
                </form>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <!-- New Post Form -->
  <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-5">
    <h2 class="mb-4 text-sm font-semibold text-[var(--cs-text)]">New Post</h2>
    <form
      method="POST"
      action="?/createPost"
      use:enhance={() => {
        submitting = true;
        return async ({ update }) => {
          submitting = false;
          postBody = '';
          await update();
        };
      }}
      class="space-y-4"
    >
      <textarea
        name="body"
        bind:value={postBody}
        required
        rows={4}
        class="block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        placeholder="Write your post…"
      ></textarea>
      <div class="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Posting…' : 'Post'}
        </button>
      </div>
    </form>
  </div>
</div>
