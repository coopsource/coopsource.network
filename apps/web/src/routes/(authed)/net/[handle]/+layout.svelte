<script lang="ts">
  import { AppShell } from '$lib/components/layout/index.js';

  let { data, children } = $props();
</script>

<AppShell user={data.user} workspace={data.workspace} myCoops={data.myCoops}>
  {@render children()}
</AppShell>
