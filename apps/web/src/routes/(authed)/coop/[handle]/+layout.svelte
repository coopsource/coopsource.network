<script lang="ts">
  import { AppShell } from '$lib/components/layout/index.js';
  import { connect, disconnect, setUnreadCount } from '$lib/stores/events.svelte.js';
  import { createApiClient } from '$lib/api/client.js';
  import { browser } from '$app/environment';
  import { env } from '$env/dynamic/public';

  let { data, children } = $props();

  $effect(() => {
    // Read workspace handle to create a reactive dependency — when the user
    // navigates between co-op workspaces, SvelteKit reuses this layout component
    // with new data. Reading data.workspace.handle ensures the effect re-runs.
    const _handle = data.workspace?.handle;
    if (browser) {
      disconnect();
      connect();
      createApiClient(fetch, undefined, env.PUBLIC_API_URL).getUnreadCount().then((r) => setUnreadCount(r.count)).catch(() => {});
      return () => disconnect();
    }
  });
</script>

<AppShell user={data.user} workspace={data.workspace}>
  {@render children()}
</AppShell>
