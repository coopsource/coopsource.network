<script lang="ts">
  import PublicNav from '$lib/components/layout/PublicNav.svelte';
  import Vote from '@lucide/svelte/icons/vote';
  import Handshake from '@lucide/svelte/icons/handshake';
  import Search from '@lucide/svelte/icons/search';
  import Globe from '@lucide/svelte/icons/globe';

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

    <div class="mt-10 grid max-w-2xl grid-cols-1 gap-x-10 gap-y-5 text-left sm:grid-cols-2">
      <div class="flex items-start gap-3">
        <Vote class="mt-0.5 size-5 shrink-0 text-[var(--cs-primary)]" />
        <div>
          <p class="text-sm font-medium text-[var(--cs-text)]">Governance</p>
          <p class="text-sm text-[var(--cs-text-muted)]">Vote on proposals and delegate authority</p>
        </div>
      </div>
      <div class="flex items-start gap-3">
        <Handshake class="mt-0.5 size-5 shrink-0 text-[var(--cs-primary)]" />
        <div>
          <p class="text-sm font-medium text-[var(--cs-text)]">Agreements</p>
          <p class="text-sm text-[var(--cs-text-muted)]">Draft, sign, and manage cooperative agreements</p>
        </div>
      </div>
      <div class="flex items-start gap-3">
        <Search class="mt-0.5 size-5 shrink-0 text-[var(--cs-primary)]" />
        <div>
          <p class="text-sm font-medium text-[var(--cs-text)]">Discovery</p>
          <p class="text-sm text-[var(--cs-text-muted)]">Find cooperatives and people aligned with your goals</p>
        </div>
      </div>
      <div class="flex items-start gap-3">
        <Globe class="mt-0.5 size-5 shrink-0 text-[var(--cs-primary)]" />
        <div>
          <p class="text-sm font-medium text-[var(--cs-text)]">Open protocols</p>
          <p class="text-sm text-[var(--cs-text-muted)]">Built on ATProto — your data is portable and yours</p>
        </div>
      </div>
    </div>

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
