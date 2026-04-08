<script lang="ts">
  import PublicNav from '$lib/components/layout/PublicNav.svelte';

  let { data } = $props();
</script>

<svelte:head>
  <title>Co-op Source — Federated Collaboration for Cooperatives</title>
</svelte:head>

<div class="flex min-h-screen flex-col bg-[var(--cs-bg)]">
  <PublicNav user={data.user} />

  <!-- Hero -->
  <main class="flex flex-1 flex-col items-center justify-center px-6 text-center">
    <h1 class="max-w-2xl text-4xl font-bold tracking-tight text-[var(--cs-text)] sm:text-5xl">
      Federated collaboration for cooperatives
    </h1>
    <p class="mt-4 max-w-xl text-lg text-[var(--cs-text-secondary)]">
      Governance, agreements, and membership — built on open protocols.
      Your cooperative, your data, your network.
    </p>
    <div class="mt-8 flex items-center gap-4">
      <a
        href="/register"
        class="rounded-md bg-[var(--cs-primary)] px-6 py-2.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] cs-transition"
      >
        Get started
      </a>
      <a
        href="/explore"
        class="rounded-md border border-[var(--cs-border)] px-6 py-2.5 text-sm font-medium text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)] cs-transition"
      >
        Explore directory
      </a>
    </div>
  </main>
</div>
