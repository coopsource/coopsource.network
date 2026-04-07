<script lang="ts">
  import { AppShell } from '$lib/components/layout/index.js';
  import { connect, disconnect, setUnreadCount } from '$lib/stores/events.svelte.js';
  import { createApiClient } from '$lib/api/client.js';
  import { browser } from '$app/environment';
  import { env } from '$env/dynamic/public';

  let { data, children } = $props();

  $effect(() => {
    if (browser) {
      disconnect();
      connect();
      createApiClient(fetch, undefined, env.PUBLIC_API_URL)
        .getUnreadCount()
        .then((r) => setUnreadCount(r.count))
        .catch(() => {});
      return () => disconnect();
    }
  });
</script>

<AppShell user={data.user} workspace={data.workspace} myCoops={data.myCoops}>
  {@render children()}
</AppShell>
