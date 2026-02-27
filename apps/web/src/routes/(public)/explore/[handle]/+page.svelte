<script lang="ts">
  import { Badge } from '$lib/components/ui';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Users from '@lucide/svelte/icons/users';
  import Globe from '@lucide/svelte/icons/globe';
  import ExternalLink from '@lucide/svelte/icons/external-link';

  let { data } = $props();

  const coop = $derived(data.cooperative);

  function coopTypeVariant(cooperativeType: string): 'default' | 'primary' | 'success' | 'warning' {
    switch (cooperativeType) {
      case 'worker': return 'primary';
      case 'consumer': return 'success';
      case 'producer': return 'warning';
      default: return 'default';
    }
  }
</script>

<svelte:head>
  <title>{coop.displayName} — Co-op Source</title>
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

  <!-- Header -->
  <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-6">
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-3">
          <h1 class="text-xl font-semibold text-[var(--cs-text)]">{coop.displayName}</h1>
          <Badge variant={coopTypeVariant(coop.cooperativeType)}>
            {coop.cooperativeType}
          </Badge>
        </div>
        {#if coop.handle}
          <p class="mt-0.5 text-sm text-[var(--cs-text-muted)]">@{coop.handle}</p>
        {/if}
        {#if coop.description}
          <p class="mt-3 text-sm text-[var(--cs-text-secondary)] leading-relaxed">{coop.description}</p>
        {/if}
        {#if coop.website}
          <a
            href={coop.website}
            target="_blank"
            rel="noopener noreferrer"
            class="mt-3 inline-flex items-center gap-1.5 text-sm text-[var(--cs-primary)] hover:underline"
          >
            <ExternalLink class="h-3.5 w-3.5" />
            {coop.website}
          </a>
        {/if}
      </div>
    </div>

    <!-- Stats -->
    <div class="mt-6 flex gap-6 border-t border-[var(--cs-border)] pt-4">
      <div class="flex items-center gap-2 text-sm">
        <Users class="h-4 w-4 text-[var(--cs-text-muted)]" />
        <span class="font-medium text-[var(--cs-text)]">{coop.memberCount}</span>
        <span class="text-[var(--cs-text-secondary)]">member{coop.memberCount !== 1 ? 's' : ''}</span>
      </div>
      {#if coop.networks.length > 0}
        <div class="flex items-center gap-2 text-sm">
          <Globe class="h-4 w-4 text-[var(--cs-text-muted)]" />
          <span class="font-medium text-[var(--cs-text)]">{coop.networks.length}</span>
          <span class="text-[var(--cs-text-secondary)]">network{coop.networks.length !== 1 ? 's' : ''}</span>
        </div>
      {/if}
    </div>
  </div>

  <!-- Networks section -->
  {#if coop.networks.length > 0}
    <section>
      <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--cs-text-muted)]">
        Networks
      </h2>
      <div class="space-y-2">
        {#each coop.networks as network}
          <div class="flex items-center gap-3 rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-3">
            <div class="rounded-md bg-[var(--cs-primary-soft)] p-1.5">
              <Globe class="h-4 w-4 text-[var(--cs-primary)]" />
            </div>
            <span class="font-medium text-[var(--cs-text)]">{network.displayName}</span>
          </div>
        {/each}
      </div>
    </section>
  {/if}
</div>
