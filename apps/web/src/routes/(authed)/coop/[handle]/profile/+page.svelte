<script lang="ts">
  import { Badge, EmptyState, Tabs } from '$lib/components/ui';
  import Building2 from '@lucide/svelte/icons/building-2';
  import Globe from '@lucide/svelte/icons/globe';
  import Mail from '@lucide/svelte/icons/mail';
  import User from '@lucide/svelte/icons/user';

  let { data } = $props();
  let activeTab = $state('activity');

  const cooperatives = $derived(data.cooperatives);
  const networks = $derived(data.networks);
  const invitations = $derived(data.invitations);

  const tabs = $derived([
    { id: 'activity', label: 'My Activity' },
    { id: 'profiles', label: 'My Profiles' },
    { id: 'cooperatives', label: 'My Cooperatives', count: cooperatives.length },
  ]);
</script>

<svelte:head>
  <title>Profile — Co-op Source</title>
</svelte:head>

<div class="space-y-6">
  <div>
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">Profile</h1>
    <p class="mt-1 text-sm text-[var(--cs-text-secondary)]">
      Your account, cooperatives, and activity.
    </p>
  </div>

  <Tabs {tabs} bind:active={activeTab} />

  <!-- My Activity -->
  {#if activeTab === 'activity'}
    <div class="space-y-8">
      <!-- Cooperatives -->
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

      <!-- Networks -->
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
  {/if}

  <!-- My Profiles -->
  {#if activeTab === 'profiles'}
    <div class="max-w-lg">
      <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-6">
        <div class="mb-4 flex items-center gap-3">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--cs-primary-soft)]">
            <User class="h-5 w-5 text-[var(--cs-primary)]" />
          </div>
          <div>
            <h2 class="text-sm font-semibold text-[var(--cs-text)]">
              {data.user?.displayName ?? 'Unknown'}
            </h2>
            <p class="text-xs text-[var(--cs-text-muted)]">ATProto Identity</p>
          </div>
        </div>

        <dl class="space-y-3 text-sm">
          <div class="flex justify-between">
            <dt class="text-[var(--cs-text-muted)]">Display Name</dt>
            <dd class="font-medium text-[var(--cs-text)]">{data.user?.displayName ?? '—'}</dd>
          </div>
          {#if data.user?.handle}
            <div class="flex justify-between">
              <dt class="text-[var(--cs-text-muted)]">Handle</dt>
              <dd class="font-medium text-[var(--cs-text)]">@{data.user.handle}</dd>
            </div>
          {/if}
          <div class="flex justify-between">
            <dt class="text-[var(--cs-text-muted)]">Email</dt>
            <dd class="font-medium text-[var(--cs-text)]">{data.user?.email ?? '—'}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-[var(--cs-text-muted)]">DID</dt>
            <dd class="font-mono text-xs text-[var(--cs-text-secondary)] truncate max-w-[240px]" title={data.user?.did}>
              {data.user?.did ?? '—'}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  {/if}

  <!-- My Cooperatives -->
  {#if activeTab === 'cooperatives'}
    {#if cooperatives.length === 0}
      <EmptyState
        icon={Building2}
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
  {/if}
</div>
