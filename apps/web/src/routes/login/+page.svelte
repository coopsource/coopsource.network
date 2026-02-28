<script lang="ts">
  import { enhance } from '$app/forms';

  let { form } = $props();

  let submitting = $state(false);
  let atprotoHandle = $state('');
  let atprotoSubmitting = $state(false);
  let atprotoError = $state('');

  async function handleAtprotoLogin() {
    if (!atprotoHandle.trim()) return;
    atprotoSubmitting = true;
    atprotoError = '';
    try {
      const res = await fetch('/api/v1/auth/oauth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: atprotoHandle.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        atprotoError = body.error ?? `Error ${res.status}`;
        return;
      }
      const { redirectUrl } = (await res.json()) as { redirectUrl: string };
      window.location.href = redirectUrl;
    } catch {
      atprotoError = 'Failed to initiate ATProto login';
    } finally {
      atprotoSubmitting = false;
    }
  }
</script>

<svelte:head>
  <title>Sign In — Co-op Source</title>
</svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center bg-[var(--cs-bg-inset)] p-4">
  <div class="w-full max-w-sm">
    <div class="mb-8 text-center">
      <a href="/" class="text-2xl font-bold text-[var(--cs-text)] hover:text-[var(--cs-primary)] cs-transition">Co-op Source</a>
      <p class="mt-2 text-sm text-[var(--cs-text-secondary)]">Sign in to your account</p>
    </div>

    <div class="rounded-lg bg-[var(--cs-bg-card)] p-6 shadow-sm">
      {#if form?.error}
        <div class="mb-4 rounded-md bg-[var(--color-danger-light)] p-3 text-sm text-[var(--color-danger-dark)]">
          {form.error}
        </div>
      {/if}

      <form
        method="POST"
        use:enhance={() => {
          submitting = true;
          return async ({ update }) => {
            submitting = false;
            await update();
          };
        }}
        class="space-y-4"
      >
        <div>
          <label for="email" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autocomplete="email"
            class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label for="password" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autocomplete="current-password"
            class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          class="w-full rounded-md bg-[var(--cs-primary)] py-2 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div class="my-4 flex items-center gap-3">
        <div class="h-px flex-1 bg-[var(--cs-border)]"></div>
        <span class="text-xs text-[var(--cs-text-muted)]">or</span>
        <div class="h-px flex-1 bg-[var(--cs-border)]"></div>
      </div>

      <div class="space-y-3">
        {#if atprotoError}
          <div class="rounded-md bg-[var(--color-danger-light)] p-3 text-sm text-[var(--color-danger-dark)]">
            {atprotoError}
          </div>
        {/if}

        <label for="atproto-handle" class="block text-sm font-medium text-[var(--cs-text-secondary)]"
          >ATProto Handle</label
        >
        <input
          id="atproto-handle"
          type="text"
          bind:value={atprotoHandle}
          placeholder="you.bsky.social"
          class="block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        />
        <button
          type="button"
          onclick={handleAtprotoLogin}
          disabled={atprotoSubmitting || !atprotoHandle.trim()}
          class="w-full rounded-md bg-[var(--cs-primary)] py-2 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50"
        >
          {atprotoSubmitting ? 'Redirecting…' : 'Sign in with ATProto'}
        </button>
      </div>
    </div>

    <p class="mt-4 text-center text-sm text-[var(--cs-text-muted)]">
      Don't have an account?
      <a href="/register" class="text-[var(--cs-primary)] hover:underline">Create one</a>
      · <a href="/" class="text-[var(--cs-primary)] hover:underline">Back to home</a>
    </p>
  </div>
</div>
