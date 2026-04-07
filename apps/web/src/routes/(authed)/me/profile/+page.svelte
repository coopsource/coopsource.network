<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>Profile — Co-op Source</title>
</svelte:head>

<div class="space-y-6 max-w-2xl">
  <div>
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">Profile</h1>
    <p class="mt-1 text-sm text-[var(--cs-text-secondary)]">Your identity on Co-op Source.</p>
  </div>

  <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-5">
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
  </div>

  <p class="text-xs text-[var(--cs-text-muted)]">
    Profile editing, multi-profile support, and verification will be added in future phases.
  </p>
</div>
