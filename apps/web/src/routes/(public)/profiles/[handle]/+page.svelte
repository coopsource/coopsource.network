<script lang="ts">
  import { EmptyState } from '$lib/components/ui';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import User from '@lucide/svelte/icons/user';
  import Building2 from '@lucide/svelte/icons/building-2';

  let { data } = $props();

  const person = $derived(data.person);
</script>

<svelte:head>
  <title>{person.displayName} — Co-op Source</title>
</svelte:head>

<div class="space-y-6">
  <!-- Back link -->
  <a
    href="/explore"
    class="inline-flex items-center gap-1.5 text-sm text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)] cs-transition"
  >
    <ArrowLeft class="h-4 w-4" />
    Back to explore
  </a>

  <!-- Header card -->
  <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-6">
    <div class="flex items-start gap-4">
      <div class="rounded-full bg-[var(--cs-primary-soft)] p-3">
        <User class="h-6 w-6 text-[var(--cs-primary)]" />
      </div>
      <div class="min-w-0 flex-1">
        <h1 class="text-xl font-semibold text-[var(--cs-text)]">{person.displayName}</h1>
        <p class="mt-0.5 text-sm text-[var(--cs-text-muted)]">@{person.handle}</p>
        {#if person.bio}
          <p class="mt-3 text-sm text-[var(--cs-text-secondary)] leading-relaxed">{person.bio}</p>
        {/if}
      </div>
    </div>
  </div>

  <!-- Cooperatives section -->
  <section>
    <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--cs-text-muted)]">
      Cooperatives
    </h2>
    {#if person.cooperatives.length === 0}
      <EmptyState
        icon={Building2}
        title="No cooperatives"
        description="This person hasn't joined any public cooperatives yet."
      />
    {:else}
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {#each person.cooperatives as coop}
          <a
            href="/explore/{coop.handle}"
            class="flex items-center gap-3 rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4 hover:border-[var(--cs-border-hover)] hover:shadow-sm cs-transition"
          >
            <div class="rounded-md bg-[var(--cs-primary-soft)] p-1.5">
              <Building2 class="h-4 w-4 text-[var(--cs-primary)]" />
            </div>
            <span class="truncate font-medium text-[var(--cs-text)]">{coop.displayName}</span>
          </a>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Interests section -->
  <section>
    <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--cs-text-muted)]">
      Interests
    </h2>
    {#if person.interests.length === 0}
      <EmptyState
        title="No interests"
        description="This person hasn't listed any interests yet."
      />
    {:else}
      <div class="flex flex-wrap gap-2">
        {#each person.interests as interest}
          <span class="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium bg-[var(--cs-primary)]/10 text-[var(--cs-primary)]">
            {interest}
          </span>
        {/each}
      </div>
    {/if}
  </section>
</div>
