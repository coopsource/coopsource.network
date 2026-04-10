<script lang="ts">
  import { onMount } from 'svelte';
  import '../app.css';
  import { user } from '$lib/stores/user.js';

  let { data, children } = $props();

  // Keep store in sync with SSR data
  $effect(() => {
    user.set(data.user ?? null);
  });

  // Signal that Svelte 5 hydration is complete — event handlers are attached.
  // E2E tests wait for this before interacting with the page.
  onMount(() => {
    document.documentElement.dataset.hydrated = 'true';
  });
</script>

{@render children()}
