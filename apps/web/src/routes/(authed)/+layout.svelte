<script lang="ts">
  import { AppShell } from '$lib/components/layout/index.js';

  let { data, children } = $props();
</script>

<AppShell user={data.user} coopName={data.cooperative?.displayName ?? 'Co-op Source'}>
  {@render children()}
</AppShell>
