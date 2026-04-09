<script lang="ts">
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import Building2 from '@lucide/svelte/icons/building-2';
  import User from '@lucide/svelte/icons/user';
  import X from '@lucide/svelte/icons/x';
  import { enhance } from '$app/forms';
  import type { MatchSuggestion } from '$lib/api/types.js';

  // V8.7 — Suggested Matches widget for /me Home.
  //
  // Hides itself entirely when there are no matches (an empty card on a
  // busy Home page is worse than no card). The score badge is intentionally
  // hidden in V8.7 — the stub scoring is meaningless to users; V8.8 will
  // bring it back when scoring is real.
  //
  // V8.8 — renders both cooperative and person matches. Persons get a
  // distinguishing icon + subtitle (shared interests / shared coops). Person
  // names are rendered as plain text since there's no public person profile
  // page yet (V8.9 polish will add a destination).

  let { matches }: { matches: MatchSuggestion[] } = $props();
</script>

{#if matches.length > 0}
  <section>
    <h2 class="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-[var(--cs-text-muted)]">
      <Sparkles size={14} class="text-[var(--cs-primary)]" />
      Suggested for You
    </h2>
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each matches as match (match.id)}
        <div class="cs-card cs-transition relative p-5 hover:border-[var(--cs-primary)]">
          {#if match.matchType === 'cooperative'}
            <a
              href={match.handle ? `/explore/${match.handle}` : `#`}
              class="block"
              aria-label="View {match.displayName}"
            >
              <div class="flex items-start gap-3">
                <Building2 size={20} class="mt-0.5 text-[var(--cs-primary)]" />
                <div class="min-w-0 flex-1 pr-6">
                  <h3 class="font-medium text-[var(--cs-text)]">{match.displayName}</h3>
                  {#if match.handle}
                    <p class="mt-0.5 text-xs text-[var(--cs-text-muted)]">@{match.handle}</p>
                  {/if}
                  {#if match.description}
                    <p class="mt-1 line-clamp-2 text-xs text-[var(--cs-text-muted)]">
                      {match.description}
                    </p>
                  {/if}
                  {#if match.memberCount !== null && match.memberCount > 0}
                    <p class="mt-2 text-xs text-[var(--cs-text-muted)]">
                      {match.memberCount}
                      {match.memberCount === 1 ? 'member' : 'members'}
                      {#if match.cooperativeType} · {match.cooperativeType}{/if}
                    </p>
                  {/if}
                </div>
              </div>
            </a>
          {:else}
            <!-- V8.8: person matches have no public profile page yet — render as plain text. -->
            <!-- TODO(V8.9): link to a person profile page once it exists. -->
            <div class="flex items-start gap-3">
              <User size={20} class="mt-0.5 text-violet-500" />
              <div class="min-w-0 flex-1 pr-6">
                <h3 class="font-medium text-[var(--cs-text)]">{match.displayName}</h3>
                {#if match.handle}
                  <p class="mt-0.5 text-xs text-[var(--cs-text-muted)]">@{match.handle}</p>
                {/if}
                {#if match.description}
                  <p class="mt-1 line-clamp-2 text-xs text-[var(--cs-text-muted)]">
                    {match.description}
                  </p>
                {/if}
                {#if match.sharedInterestCount !== null && match.sharedInterestCount > 0}
                  <p class="mt-2 text-xs text-[var(--cs-text-muted)]">
                    {match.sharedInterestCount} shared interest{match.sharedInterestCount === 1 ? '' : 's'}
                    {#if match.sharedCoopCount && match.sharedCoopCount > 0} · {match.sharedCoopCount} shared coop{match.sharedCoopCount === 1 ? '' : 's'}{/if}
                  </p>
                {/if}
              </div>
            </div>
          {/if}
          <form method="POST" action="?/dismissMatch" use:enhance class="absolute right-2 top-2">
            <input type="hidden" name="id" value={match.id} />
            <button
              type="submit"
              class="rounded p-1 text-[var(--cs-text-muted)] hover:bg-[var(--cs-bg-muted)] hover:text-[var(--cs-text)]"
              aria-label="Dismiss this suggestion"
              title="Dismiss"
            >
              <X size={14} />
            </button>
          </form>
        </div>
      {/each}
    </div>
  </section>
{/if}
