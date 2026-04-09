<script lang="ts">
  import { EmptyState } from '$lib/components/ui';
  import { enhance } from '$app/forms';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import Building2 from '@lucide/svelte/icons/building-2';
  import User from '@lucide/svelte/icons/user';
  import Check from '@lucide/svelte/icons/check';
  import X from '@lucide/svelte/icons/x';
  import ExternalLink from '@lucide/svelte/icons/external-link';

  // V8.8 — renders both cooperative and person matches. Persons get a
  // distinguishing icon + subtitle (shared interests / shared coops).
  // V8.9 — person matches now link to /profiles/{handle}.

  let { data } = $props();

  const include = $derived(data.include);
  const matches = $derived(data.matches);
</script>

<svelte:head>
  <title>Matches — Co-op Source</title>
</svelte:head>

<div class="space-y-6">
  <!-- Header -->
  <div>
    <h1 class="flex items-center gap-2 text-2xl font-semibold text-[var(--cs-text)]">
      <Sparkles size={20} class="text-[var(--cs-primary)]" />
      Matches
    </h1>
    <p class="mt-1 text-sm text-[var(--cs-text-secondary)]">
      Cooperatives and people we think you'd want to connect with. Dismiss the ones that aren't a fit.
    </p>
  </div>

  <!-- Show-all toggle -->
  <div class="flex gap-2" role="tablist">
    <a
      href="?"
      role="tab"
      aria-selected={include === 'active'}
      class="rounded-full px-3 py-1 text-sm font-medium cs-transition
        {include === 'active'
          ? 'bg-[var(--cs-primary-soft)] text-[var(--cs-primary)]'
          : 'bg-[var(--cs-bg-card)] text-[var(--cs-text-secondary)] border border-[var(--cs-border)] hover:bg-[var(--cs-bg-inset)]'}"
    >
      Active
    </a>
    <a
      href="?show=all"
      role="tab"
      aria-selected={include === 'all'}
      class="rounded-full px-3 py-1 text-sm font-medium cs-transition
        {include === 'all'
          ? 'bg-[var(--cs-primary-soft)] text-[var(--cs-primary)]'
          : 'bg-[var(--cs-bg-card)] text-[var(--cs-text-secondary)] border border-[var(--cs-border)] hover:bg-[var(--cs-bg-inset)]'}"
    >
      All (incl. dismissed)
    </a>
  </div>

  {#if matches.length === 0}
    <EmptyState
      title={include === 'all' ? 'No matches yet' : 'No active matches'}
      description={include === 'all'
        ? "We haven't found anyone to suggest yet. Check back later."
        : "You're all caught up. Switch to All to see dismissed and acted-on matches."}
    />
  {:else}
    <div class="space-y-3">
      {#each matches as match (match.id)}
        <article
          class="cs-card cs-transition flex items-start gap-4 p-5
            {match.dismissedAt ? 'opacity-60' : ''}"
        >
          {#if match.matchType === 'person'}
            <User size={24} class="mt-1 flex-shrink-0 text-violet-500" />
          {:else}
            <Building2 size={24} class="mt-1 flex-shrink-0 text-[var(--cs-primary)]" />
          {/if}

          <div class="min-w-0 flex-1">
            <div class="flex items-start gap-2">
              <h3 class="font-medium text-[var(--cs-text)]">{match.displayName}</h3>
              {#if match.dismissedAt}
                <span class="rounded bg-[var(--cs-bg-inset)] px-2 py-0.5 text-xs text-[var(--cs-text-muted)]">
                  Dismissed
                </span>
              {/if}
              {#if match.actedOnAt}
                <span class="rounded bg-[var(--cs-success-soft)] px-2 py-0.5 text-xs text-[var(--cs-success)]">
                  Acted on
                </span>
              {/if}
            </div>
            {#if match.handle}
              <p class="mt-0.5 text-xs text-[var(--cs-text-muted)]">@{match.handle}</p>
            {/if}
            {#if match.description}
              <p class="mt-2 text-sm text-[var(--cs-text-secondary)]">{match.description}</p>
            {/if}
            {#if match.matchType === 'cooperative'}
              {#if match.memberCount !== null && match.memberCount > 0}
                <p class="mt-2 text-xs text-[var(--cs-text-muted)]">
                  {match.memberCount}
                  {match.memberCount === 1 ? 'member' : 'members'}
                  {#if match.cooperativeType} · {match.cooperativeType}{/if}
                </p>
              {/if}
            {:else}
              {#if match.sharedInterestCount !== null && match.sharedInterestCount > 0}
                <p class="mt-2 text-xs text-[var(--cs-text-muted)]">
                  {match.sharedInterestCount} shared interest{match.sharedInterestCount === 1 ? '' : 's'}
                  {#if match.sharedCoopCount && match.sharedCoopCount > 0} · {match.sharedCoopCount} shared coop{match.sharedCoopCount === 1 ? '' : 's'}{/if}
                </p>
              {/if}
            {/if}
          </div>

          <div class="flex flex-shrink-0 items-center gap-2">
            {#if match.handle}
              <a
                href={match.matchType === 'cooperative' ? `/explore/${match.handle}` : `/profiles/${match.handle}`}
                class="inline-flex items-center gap-1 rounded border border-[var(--cs-border)] px-3 py-1.5 text-xs font-medium text-[var(--cs-text)] hover:border-[var(--cs-primary)] hover:text-[var(--cs-primary)]"
              >
                <ExternalLink size={12} />
                View
              </a>
            {/if}
            {#if !match.actedOnAt}
              <form method="POST" action="?/act" use:enhance>
                <input type="hidden" name="id" value={match.id} />
                <button
                  type="submit"
                  class="inline-flex items-center gap-1 rounded bg-[var(--cs-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                  title="Mark as acted on"
                >
                  <Check size={12} />
                  Acted
                </button>
              </form>
            {/if}
            {#if !match.dismissedAt}
              <form method="POST" action="?/dismiss" use:enhance>
                <input type="hidden" name="id" value={match.id} />
                <button
                  type="submit"
                  class="inline-flex items-center gap-1 rounded border border-[var(--cs-border)] px-3 py-1.5 text-xs font-medium text-[var(--cs-text-muted)] hover:border-[var(--cs-text)] hover:text-[var(--cs-text)]"
                  title="Dismiss this suggestion"
                >
                  <X size={12} />
                  Dismiss
                </button>
              </form>
            {/if}
          </div>
        </article>
      {/each}
    </div>
  {/if}
</div>
