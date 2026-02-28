<script lang="ts">
  import { enhance } from '$app/forms';

  let { form } = $props();

  let submitting = $state(false);
  let displayName = $state('');
  let handle = $state('');

  function toHandle(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  $effect(() => {
    if (displayName && !handle) {
      handle = toHandle(displayName);
    }
  });
</script>

<svelte:head>
  <title>Register — Co-op Source</title>
</svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center bg-[var(--cs-bg-inset)] p-4">
  <div class="w-full max-w-sm">
    <div class="mb-8 text-center">
      <h1 class="text-2xl font-bold text-[var(--cs-text)]">Create Account</h1>
      <p class="mt-2 text-sm text-[var(--cs-text-secondary)]">Join your cooperative network</p>
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
        <input type="hidden" name="handle" value={handle} />

        <div>
          <label for="displayName" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
            Display Name
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            required
            bind:value={displayName}
            class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
            placeholder="Your Name"
          />
        </div>

        <div>
          <label for="handle" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Handle</label>
          <div class="mt-1 flex rounded-md border border-[var(--cs-border)] focus-within:border-[var(--cs-border-focus)] focus-within:ring-1 focus-within:ring-[var(--cs-ring)]">
            <span class="flex items-center pl-3 text-sm text-[var(--cs-text-muted)]">@</span>
            <input
              id="handle"
              type="text"
              required
              bind:value={handle}
              class="block w-full rounded-md px-2 py-2 text-sm focus:outline-none"
              placeholder="yourhandle"
            />
          </div>
        </div>

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
            minlength={8}
            autocomplete="new-password"
            class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
            placeholder="Min. 8 characters"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          class="w-full rounded-md bg-[var(--cs-primary)] py-2 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50"
        >
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p class="mt-4 text-center text-sm text-[var(--cs-text-muted)]">
        Already have an account?
        <a href="/login" class="text-[var(--cs-primary)] hover:underline">Sign in</a>
      </p>
    </div>
  </div>
</div>
