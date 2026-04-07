<script lang="ts">
  import BadgeCheck from '@lucide/svelte/icons/badge-check';
  import Avatar from '$lib/components/ui/Avatar.svelte';

  let { data } = $props();

  const profile = $derived(data.user?.profile ?? null);
  const profileDisplayName = $derived(profile?.displayName ?? data.user?.displayName ?? '—');
</script>

<svelte:head>
  <title>Profile — Co-op Source</title>
</svelte:head>

<div class="space-y-6 max-w-2xl">
  <div>
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">Profile</h1>
    <p class="mt-1 text-sm text-[var(--cs-text-secondary)]">Your identity on Co-op Source.</p>
  </div>

  <!-- V8.3 — Current Profile card. Read-only this phase; editing arrives in V8.10/V8.11. -->
  <section
    class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-5"
    data-testid="current-profile-card"
  >
    <header class="flex items-center justify-between mb-4">
      <h2 class="text-sm font-semibold text-[var(--cs-text)]">Current Profile</h2>
      <span class="text-[10px] font-medium uppercase tracking-wider text-[var(--cs-text-muted)]">
        default
      </span>
    </header>
    <div class="flex items-start gap-4">
      <Avatar name={profileDisplayName} size="lg" />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <p class="text-base font-semibold text-[var(--cs-text)] truncate">{profileDisplayName}</p>
          {#if profile?.verified}
            <BadgeCheck
              class="h-4 w-4 text-[var(--cs-text-muted)]"
              aria-label="Verified profile"
            />
          {/if}
        </div>
        {#if data.user?.handle}
          <p class="text-sm text-[var(--cs-text-muted)]">@{data.user.handle}</p>
        {/if}
        {#if profile?.bio}
          <p class="mt-2 text-sm text-[var(--cs-text)]">{profile.bio}</p>
        {/if}
      </div>
    </div>
  </section>

  <!-- Identity card — DID + email -->
  <section class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-5">
    <header class="mb-4">
      <h2 class="text-sm font-semibold text-[var(--cs-text)]">Identity</h2>
    </header>
    <dl class="space-y-4">
      <div>
        <dt class="text-xs font-medium uppercase tracking-wide text-[var(--cs-text-muted)]">Display Name</dt>
        <dd class="mt-1 text-sm text-[var(--cs-text)]">{data.user?.displayName ?? '—'}</dd>
      </div>
      <div>
        <dt class="text-xs font-medium uppercase tracking-wide text-[var(--cs-text-muted)]">Handle</dt>
        <dd class="mt-1 text-sm text-[var(--cs-text)]">
          {data.user?.handle ? `@${data.user.handle}` : '—'}
        </dd>
      </div>
      <div>
        <dt class="text-xs font-medium uppercase tracking-wide text-[var(--cs-text-muted)]">Email</dt>
        <dd class="mt-1 text-sm text-[var(--cs-text)]">{data.user?.email ?? '—'}</dd>
      </div>
      <div>
        <dt class="text-xs font-medium uppercase tracking-wide text-[var(--cs-text-muted)]">DID</dt>
        <dd class="mt-1 text-xs font-mono text-[var(--cs-text-muted)] break-all">{data.user?.did ?? '—'}</dd>
      </div>
    </dl>
  </section>

  <p class="text-xs text-[var(--cs-text-muted)]" data-testid="profile-future-note">
    More profiles coming soon — V8.3 ships with one verified default profile per account.
    Persona profiles arrive in a future release. Editing profile attributes will land in V8.10/V8.11.
  </p>
</div>
