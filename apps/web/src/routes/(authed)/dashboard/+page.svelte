<script lang="ts">
  import { Badge, EmptyState } from '$lib/components/ui';
  import Globe from '@lucide/svelte/icons/globe';
  import Building2 from '@lucide/svelte/icons/building-2';
  import Mail from '@lucide/svelte/icons/mail';

  let { data } = $props();

  const cooperatives = $derived(data.cooperatives);
  const networks = $derived(data.networks);
  const invitations = $derived(data.invitations);
</script>

<svelte:head>
  <title>Dashboard — Co-op Source</title>
</svelte:head>

<div class="space-y-8">
  <div>
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">Dashboard</h1>
    <p class="mt-1 text-sm text-[var(--cs-text-secondary)]">Welcome back{data.user?.displayName ? `, ${data.user.displayName}` : ''}.</p>
  </div>

  <!-- My Cooperatives -->
  <section>
    <h2 class="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--cs-text-muted)]">
      My Cooperatives
    </h2>
    {#if cooperatives.length === 0}
      <EmptyState
        title="No cooperatives"
        description="You're not a member of any cooperative yet."
      />
    {:else}
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {#each cooperatives as coop}
          <a
            href="/coop/{coop.handle ?? coop.did}"
            class="group rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-5 cs-transition hover:border-[var(--cs-border-hover)] hover:shadow-sm"
          >
            <div class="flex items-start gap-3">
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--cs-primary-soft)]">
                <Building2 class="h-5 w-5 text-[var(--cs-primary)]" />
              </div>
              <div class="min-w-0 flex-1">
                <h3 class="text-sm font-semibold text-[var(--cs-text)] truncate group-hover:text-[var(--cs-primary)]">
                  {coop.displayName}
                </h3>
                {#if coop.handle}
                  <p class="text-xs text-[var(--cs-text-muted)]">@{coop.handle}</p>
                {/if}
              </div>
            </div>
            {#if coop.description}
              <p class="mt-3 text-xs text-[var(--cs-text-secondary)] line-clamp-2">{coop.description}</p>
            {/if}
          </a>
        {/each}
      </div>
    {/if}
  </section>

  <!-- My Networks -->
  <section>
    <h2 class="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--cs-text-muted)]">
      My Networks
    </h2>
    {#if networks.length === 0}
      <EmptyState
        title="No networks"
        description="You're not part of any network yet."
      />
    {:else}
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {#each networks as network}
          <a
            href="/net/{network.handle ?? network.did}"
            class="group rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-5 cs-transition hover:border-[var(--cs-border-hover)] hover:shadow-sm"
          >
            <div class="flex items-start gap-3">
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--cs-primary-soft)]">
                <Globe class="h-5 w-5 text-[var(--cs-primary)]" />
              </div>
              <div class="min-w-0 flex-1">
                <h3 class="text-sm font-semibold text-[var(--cs-text)] truncate group-hover:text-[var(--cs-primary)]">
                  {network.displayName}
                </h3>
                {#if network.handle}
                  <p class="text-xs text-[var(--cs-text-muted)]">@{network.handle}</p>
                {/if}
              </div>
            </div>
            {#if network.description}
              <p class="mt-3 text-xs text-[var(--cs-text-secondary)] line-clamp-2">{network.description}</p>
            {/if}
          </a>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Pending Invitations -->
  {#if invitations.length > 0}
    <section>
      <h2 class="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--cs-text-muted)]">
        Pending Invitations
      </h2>
      <div class="space-y-3">
        {#each invitations.filter(i => i.status === 'pending') as inv}
          <div class="flex items-center justify-between rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] px-5 py-4">
            <div class="flex items-center gap-3">
              <Mail class="h-4 w-4 text-[var(--cs-text-muted)]" />
              <div>
                <p class="text-sm font-medium text-[var(--cs-text)]">{inv.email}</p>
                {#if inv.message}
                  <p class="text-xs text-[var(--cs-text-secondary)]">"{inv.message}"</p>
                {/if}
              </div>
            </div>
            <Badge variant="warning">pending</Badge>
          </div>
        {/each}
      </div>
    </section>
  {/if}
</div>
