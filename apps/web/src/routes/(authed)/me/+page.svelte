<script lang="ts">
  import { Badge, EmptyState } from '$lib/components/ui';
  import Globe from '@lucide/svelte/icons/globe';
  import Building2 from '@lucide/svelte/icons/building-2';
  import Mail from '@lucide/svelte/icons/mail';

  let { data } = $props();

  // myCoops comes from the parent /me layout (includes both cooperatives and networks).
  // Re-derive the split for the cards. Filter out entities with null handles —
  // we can't render a working link without a handle, and linking to /coop/null
  // would be broken. Consistent with myCoopsNavSection's filtering in sidebar-nav.ts.
  const myCoops = $derived((data.myCoops ?? []).filter((c) => c.handle !== null));
  const cooperatives = $derived(myCoops.filter((c) => !c.isNetwork));
  const networks = $derived(myCoops.filter((c) => c.isNetwork));
  const invitations = $derived(data.invitations);
</script>

<svelte:head>
  <title>Home — Co-op Source</title>
</svelte:head>

<div class="space-y-8">
  <div>
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">Home</h1>
    <p class="mt-1 text-sm text-[var(--cs-text-secondary)]">
      Welcome back{data.user?.displayName ? `, ${data.user.displayName}` : ''}.
    </p>
  </div>

  <!-- My Cooperatives -->
  <section>
    <h2 class="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--cs-text-muted)]">
      My Cooperatives
    </h2>
    {#if cooperatives.length === 0}
      <EmptyState
        title="No cooperatives yet"
        description="Create or join a cooperative to get started."
      />
    {:else}
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {#each cooperatives as coop}
          <a
            href="/coop/{coop.handle}"
            class="cs-card p-5 hover:border-[var(--cs-primary)] cs-transition block"
          >
            <div class="flex items-start gap-3">
              <Building2 size={20} class="text-[var(--cs-primary)] mt-0.5" />
              <div class="min-w-0 flex-1">
                <h3 class="font-medium text-[var(--cs-text)]">{coop.displayName}</h3>
                {#if coop.handle}
                  <p class="text-xs text-[var(--cs-text-muted)] mt-0.5">@{coop.handle}</p>
                {/if}
                {#if coop.description}
                  <p class="text-xs text-[var(--cs-text-muted)] mt-1 line-clamp-2">{coop.description}</p>
                {/if}
              </div>
            </div>
          </a>
        {/each}
      </div>
    {/if}
  </section>

  <!-- My Networks -->
  {#if networks.length > 0}
    <section>
      <h2 class="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--cs-text-muted)]">
        My Networks
      </h2>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {#each networks as network}
          <a
            href="/coop/{network.handle}"
            class="cs-card p-5 hover:border-[var(--cs-primary)] cs-transition block"
          >
            <div class="flex items-start gap-3">
              <Globe size={20} class="text-violet-500 mt-0.5" />
              <div class="min-w-0 flex-1">
                <h3 class="font-medium text-[var(--cs-text)]">{network.displayName}</h3>
                {#if network.handle}
                  <p class="text-xs text-[var(--cs-text-muted)] mt-0.5">@{network.handle}</p>
                {/if}
              </div>
            </div>
          </a>
        {/each}
      </div>
    </section>
  {/if}

  <!-- Pending Invitations -->
  {#if invitations.length > 0}
    <section>
      <h2 class="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--cs-text-muted)]">
        Pending Invitations
      </h2>
      <div class="space-y-2">
        {#each invitations as inv}
          <div class="cs-card p-3 flex items-center gap-3">
            <Mail size={16} class="text-[var(--cs-text-muted)]" />
            <div class="min-w-0 flex-1">
              <p class="text-sm text-[var(--cs-text)]">{inv.email}</p>
              {#if inv.message}
                <p class="text-xs text-[var(--cs-text-muted)] italic">"{inv.message}"</p>
              {/if}
            </div>
            <Badge variant="warning">pending</Badge>
          </div>
        {/each}
      </div>
    </section>
  {/if}
</div>
