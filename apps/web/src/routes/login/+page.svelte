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

<div class="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
  <div class="w-full max-w-sm">
    <div class="mb-8 text-center">
      <h1 class="text-2xl font-bold text-gray-900">Co-op Source</h1>
      <p class="mt-2 text-sm text-gray-600">Sign in to your account</p>
    </div>

    <div class="rounded-lg bg-white p-6 shadow-sm">
      {#if form?.error}
        <div class="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
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
          <label for="email" class="block text-sm font-medium text-gray-700">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autocomplete="email"
            class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label for="password" class="block text-sm font-medium text-gray-700">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autocomplete="current-password"
            class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          class="w-full rounded-md bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div class="my-4 flex items-center gap-3">
        <div class="h-px flex-1 bg-gray-200"></div>
        <span class="text-xs text-gray-400">or</span>
        <div class="h-px flex-1 bg-gray-200"></div>
      </div>

      <div class="space-y-3">
        {#if atprotoError}
          <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {atprotoError}
          </div>
        {/if}

        <label for="atproto-handle" class="block text-sm font-medium text-gray-700"
          >ATProto Handle</label
        >
        <input
          id="atproto-handle"
          type="text"
          bind:value={atprotoHandle}
          placeholder="you.bsky.social"
          class="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button
          type="button"
          onclick={handleAtprotoLogin}
          disabled={atprotoSubmitting || !atprotoHandle.trim()}
          class="w-full rounded-md bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {atprotoSubmitting ? 'Redirecting…' : 'Sign in with ATProto'}
        </button>
      </div>
    </div>
  </div>
</div>
