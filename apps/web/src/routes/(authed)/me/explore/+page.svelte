<script lang="ts">
  import { Badge, EmptyState } from '$lib/components/ui';
  import Search from '@lucide/svelte/icons/search';
  import Users from '@lucide/svelte/icons/users';
  import User from '@lucide/svelte/icons/user';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import Info from '@lucide/svelte/icons/info';

  let { data } = $props();

  const q = $derived(data.q);
  const type = $derived(data.type);
  const cooperatives = $derived(data.cooperatives);
  const posts = $derived(data.posts);
  const postsUnavailable = $derived(data.postsUnavailable);
  const people = $derived(data.people);
  const peopleUnavailable = $derived(data.peopleUnavailable);

  const showCoops = $derived(type === 'all' || type === 'cooperatives');
  const showPeople = $derived(type === 'all' || type === 'people');
  const showPosts = $derived(type === 'all' || type === 'posts');
  const totalResults = $derived(cooperatives.length + posts.length + people.length);
  // Hide per-section "no results" messages when the global empty state shows,
  // so we don't double-render empty states. The global empty state only fires
  // under type === 'all' with all sections empty.
  const showGlobalEmpty = $derived(
    !!q &&
      totalResults === 0 &&
      !postsUnavailable &&
      !peopleUnavailable &&
      type === 'all',
  );

  const chips: Array<{
    value: 'all' | 'cooperatives' | 'people' | 'posts';
    label: string;
  }> = [
    { value: 'all', label: 'All' },
    { value: 'cooperatives', label: 'Cooperatives' },
    { value: 'people', label: 'People' },
    { value: 'posts', label: 'Posts' },
  ];

  function chipHref(chipValue: string): string {
    if (!q) return `?type=${chipValue}`;
    return `?q=${encodeURIComponent(q)}&type=${chipValue}`;
  }

  function coopTypeVariant(cooperativeType: string): 'default' | 'primary' | 'success' | 'warning' {
    switch (cooperativeType) {
      case 'worker': return 'primary';
      case 'consumer': return 'success';
      case 'producer': return 'warning';
      default: return 'default';
    }
  }

  function excerpt(body: string, maxChars = 200): string {
    if (body.length <= maxChars) return body;
    return `${body.slice(0, maxChars)}…`;
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString();
  }
</script>

<svelte:head>
  <title>Explore — Co-op Source</title>
</svelte:head>

<div class="space-y-6">
  <!-- Header -->
  <div>
    <h1 class="text-2xl font-semibold text-[var(--cs-text)]">Explore</h1>
    <p class="mt-1 text-sm text-[var(--cs-text-secondary)]">
      Search across cooperatives, people, and your conversations.
    </p>
  </div>

  <!-- Search input — preserves the active type filter on submit -->
  <form method="GET">
    <input type="hidden" name="type" value={type} />
    <div class="relative max-w-md">
      <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--cs-text-muted)] pointer-events-none" />
      <input
        type="search"
        name="q"
        value={q}
        placeholder="Search cooperatives, people, and posts..."
        class="w-full rounded-md border border-[var(--cs-border)] bg-[var(--cs-bg-card)] pl-9 pr-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-primary)] focus:outline-none"
      />
    </div>
  </form>

  <!-- Filter chips -->
  <div class="flex gap-2" role="tablist">
    {#each chips as chip}
      <a
        href={chipHref(chip.value)}
        role="tab"
        aria-selected={type === chip.value}
        class="rounded-full px-3 py-1 text-sm font-medium cs-transition
          {type === chip.value
            ? 'bg-[var(--cs-primary-soft)] text-[var(--cs-primary)]'
            : 'bg-[var(--cs-bg-card)] text-[var(--cs-text-secondary)] border border-[var(--cs-border)] hover:bg-[var(--cs-bg-inset)]'}"
      >
        {chip.label}
      </a>
    {/each}
  </div>

  {#if !q}
    <EmptyState
      icon={Search}
      title="Start searching"
      description="Type a query above to find cooperatives, people, or posts in conversations you're a member of."
    />
  {:else}
    <!-- Cooperatives section -->
    {#if showCoops && !showGlobalEmpty}
      <section>
        <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--cs-text-muted)]">
          Cooperatives
        </h2>
        {#if cooperatives.length === 0}
          <p class="text-sm text-[var(--cs-text-muted)]">No cooperatives match your search.</p>
        {:else}
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {#each cooperatives as coop}
              <a
                href="/explore/{coop.handle ?? encodeURIComponent(coop.did)}"
                class="block rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4 hover:border-[var(--cs-border-hover)] hover:shadow-sm cs-transition"
              >
                <div class="flex items-start justify-between gap-2">
                  <h3 class="font-medium text-[var(--cs-text)] truncate">{coop.displayName}</h3>
                  <Badge variant={coopTypeVariant(coop.cooperativeType)} class="shrink-0">
                    {coop.cooperativeType}
                  </Badge>
                </div>
                {#if coop.description}
                  <p class="mt-1.5 text-sm text-[var(--cs-text-secondary)] line-clamp-2">
                    {coop.description}
                  </p>
                {/if}
                {#if coop.memberCount !== null}
                  <div class="mt-3 flex items-center gap-1 text-xs text-[var(--cs-text-muted)]">
                    <Users class="h-3.5 w-3.5" />
                    {coop.memberCount} member{coop.memberCount !== 1 ? 's' : ''}
                  </div>
                {/if}
              </a>
            {/each}
          </div>
        {/if}
      </section>
    {/if}

    <!-- People section -->
    {#if showPeople && !showGlobalEmpty}
      <section>
        <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--cs-text-muted)]">
          People
        </h2>

        {#if peopleUnavailable}
          <div class="flex items-start gap-3 rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4">
            <Info class="h-4 w-4 mt-0.5 text-[var(--cs-text-muted)] shrink-0" />
            <div class="text-sm text-[var(--cs-text-secondary)]">
              People search requires an active cooperative membership.
            </div>
          </div>
        {:else if people.length === 0}
          <p class="text-sm text-[var(--cs-text-muted)]">No people match your search.</p>
        {:else}
          <div class="space-y-2">
            {#each people as person (person.did)}
              <div class="flex items-start gap-3 rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-3">
                <div class="rounded-md bg-[var(--cs-primary-soft)] p-1.5">
                  <User class="h-4 w-4 text-[var(--cs-primary)]" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <a href="/profiles/{person.handle}" class="text-sm font-medium text-[var(--cs-text)] truncate hover:underline">
                      {person.displayName}
                    </a>
                    {#if person.handle}
                      <span class="text-xs text-[var(--cs-text-muted)] truncate">
                        @{person.handle}
                      </span>
                    {/if}
                  </div>
                  {#if person.bio}
                    <p class="mt-1 text-sm text-[var(--cs-text-secondary)] line-clamp-2">
                      {person.bio}
                    </p>
                  {/if}
                  <div class="mt-1.5 flex items-center gap-1 text-xs text-[var(--cs-text-muted)]">
                    <Users class="h-3.5 w-3.5" />
                    Member of {person.membershipCount} co-op{person.membershipCount !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </section>
    {/if}

    <!-- Posts section -->
    {#if showPosts && !showGlobalEmpty}
      <section>
        <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--cs-text-muted)]">
          Posts
        </h2>

        {#if postsUnavailable}
          <div class="flex items-start gap-3 rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4">
            <Info class="h-4 w-4 mt-0.5 text-[var(--cs-text-muted)] shrink-0" />
            <div class="text-sm text-[var(--cs-text-secondary)]">
              Post search requires an active cooperative membership.
            </div>
          </div>
        {:else if posts.length === 0}
          <p class="text-sm text-[var(--cs-text-muted)]">No posts match your search.</p>
        {:else}
          <div class="space-y-2">
            {#each posts as post}
              <div class="flex items-start gap-3 rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-3">
                <div class="rounded-md bg-[var(--cs-primary-soft)] p-1.5">
                  <MessageSquare class="h-4 w-4 text-[var(--cs-primary)]" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 text-xs text-[var(--cs-text-muted)]">
                    <span class="font-medium text-[var(--cs-text-secondary)]">
                      {post.cooperativeDisplayName}
                    </span>
                    {#if post.threadTitle}
                      <span>·</span>
                      <span class="truncate">{post.threadTitle}</span>
                    {/if}
                    <span>·</span>
                    <span>{formatDate(post.createdAt)}</span>
                  </div>
                  <p class="mt-1 text-sm text-[var(--cs-text)] line-clamp-3">
                    {excerpt(post.body)}
                  </p>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </section>
    {/if}

    <!-- Combined empty state — only when the global flag is set -->
    {#if showGlobalEmpty}
      <EmptyState
        icon={Search}
        title="No results"
        description={`Nothing found for "${q}". Try a different keyword.`}
      />
    {/if}
  {/if}
</div>
