<script lang="ts">
  import PublicNav from '$lib/components/layout/PublicNav.svelte';

  let { data, children } = $props();
</script>

<div class="min-h-screen bg-[var(--cs-bg)]">
  <PublicNav user={data.user} />

  <!-- Page content -->
  <main class="mx-auto max-w-6xl px-4 py-8">
    {@render children()}
  </main>
</div>
