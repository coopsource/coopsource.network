<script lang="ts">
  import ThemeToggle from '$lib/components/ui/ThemeToggle.svelte';

  let { data } = $props();
</script>

<svelte:head>
  <title>Settings — Co-op Source</title>
</svelte:head>

<div class="space-y-6 max-w-2xl">
  <div>
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">Settings</h1>
    <p class="mt-1 text-sm text-[var(--cs-text-secondary)]">Your account settings.</p>
  </div>

  <!-- Appearance -->
  <section class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-5">
    <h2 class="text-sm font-semibold text-[var(--cs-text)] mb-3">Appearance</h2>
    <div class="flex items-center justify-between">
      <div>
        <p class="text-sm text-[var(--cs-text)]">Theme</p>
        <p class="text-xs text-[var(--cs-text-muted)]">Switch between light and dark mode.</p>
      </div>
      <ThemeToggle variant="icon" />
    </div>
  </section>

  <!-- Account -->
  <section class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-5">
    <h2 class="text-sm font-semibold text-[var(--cs-text)] mb-3">Account</h2>
    <dl class="space-y-3">
      <div>
        <dt class="text-xs font-medium uppercase tracking-wide text-[var(--cs-text-muted)]">Email</dt>
        <dd class="mt-1 text-sm text-[var(--cs-text)]">{data.user?.email ?? '—'}</dd>
      </div>
      <div>
        <dt class="text-xs font-medium uppercase tracking-wide text-[var(--cs-text-muted)]">Handle</dt>
        <dd class="mt-1 text-sm text-[var(--cs-text)]">
          {data.user?.handle ? `@${data.user.handle}` : '—'}
        </dd>
      </div>
    </dl>
    <p class="mt-4 text-xs text-[var(--cs-text-muted)]">
      To change your display name or avatar, visit <a href="/me/profile" class="text-[var(--cs-primary)] hover:underline">Profile</a>.
    </p>
  </section>

  <p class="text-xs text-[var(--cs-text-muted)]">
    Additional settings (notification preferences, password, 2FA) will be added in future phases.
  </p>
</div>
