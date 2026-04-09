<script lang="ts">
  import ThemeToggle from '$lib/components/ui/ThemeToggle.svelte';
  import { enhance } from '$app/forms';

  let { data, form } = $props();

  // V8.8 — local state for the discoverability checkbox. We compute the
  // current value from the form action result (if present) or fall back to
  // the loader's value, so it stays in sync after reload/invalidation.
  const discoverable = $derived(
    form && 'discoverable' in form && typeof form.discoverable === 'boolean'
      ? form.discoverable
      : data.discoverable,
  );
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

  <!-- Discovery (V8.8) -->
  <section class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-5">
    <h2 class="text-sm font-semibold text-[var(--cs-text)] mb-3">Discovery</h2>
    <form method="POST" action="?/setDiscoverable" use:enhance>
      <label class="flex items-start gap-3">
        <input
          type="checkbox"
          name="discoverable"
          checked={discoverable}
          class="mt-0.5"
        />
        <div>
          <p class="text-sm text-[var(--cs-text)]">
            Allow other co-op members to find me in People search
          </p>
          <p class="mt-1 text-xs text-[var(--cs-text-muted)]">
            When enabled, your profile appears in People search and as a match suggestion to others.
            Sharing alignment data (submitting interests for any co-op) automatically opts you in,
            even if this setting is off.
          </p>
        </div>
      </label>
      <button
        type="submit"
        class="mt-3 rounded-md bg-[var(--cs-primary)] px-4 py-2 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]"
      >
        Save
      </button>
    </form>
    {#if form?.success}
      <p class="mt-2 text-xs text-green-600">Saved.</p>
    {:else if form && 'error' in form && form.error}
      <p class="mt-2 text-xs text-red-600">{form.error}</p>
    {/if}
  </section>

  <p class="text-xs text-[var(--cs-text-muted)]">
    Additional settings (notification preferences, password, 2FA) will be added in future phases.
  </p>
</div>
