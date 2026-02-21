<script lang="ts">
  import '../app.css';
  import { user } from '$lib/stores/user.js';

  let { data, children } = $props();

  // Keep store in sync with SSR data
  $effect(() => {
    user.set(data.user ?? null);
  });
</script>

{@render children()}
