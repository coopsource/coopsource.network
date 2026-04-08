<script lang="ts">
  import { page } from '$app/stores';

  // V8.4 — authed users land on /me (was /dashboard before V8.2's reframing).
  const hasUser = $derived(!!$page.data?.user);
  const homeLink = $derived(hasUser ? '/me' : '/explore');
  const homeLinkText = $derived(hasUser ? 'Go to Home' : 'Go to Explore');
</script>

<svelte:head>
  <title>Error {$page.status} — Co-op Source</title>
</svelte:head>

<div class="flex min-h-[60vh] flex-col items-center justify-center text-center">
  <h1 class="text-4xl font-bold text-[var(--cs-text)]">{$page.status}</h1>
  <p class="mt-2 text-[var(--cs-text-secondary)]">{$page.error?.message ?? 'Something went wrong.'}</p>
  <a
    href={homeLink}
    class="mt-6 rounded-md bg-[var(--cs-primary)] px-4 py-2 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]"
  >
    {homeLinkText}
  </a>
</div>
