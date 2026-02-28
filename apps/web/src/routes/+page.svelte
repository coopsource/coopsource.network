<svelte:head>
  <title>Co-op Source — Federated Collaboration for Cooperatives</title>
</svelte:head>

<div class="flex min-h-screen flex-col bg-[var(--cs-bg)]">
  <!-- Nav -->
  <nav class="border-b border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
    <div class="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
      <span class="text-[15px] font-bold text-[var(--cs-text)]">Co-op Source</span>
      <div class="flex items-center gap-4">
        <a href="/explore" class="text-[13px] text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)] cs-transition">
          Explore
        </a>
        <a href="/login" class="text-[13px] text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)] cs-transition">
          Sign in
        </a>
        <a
          href="/join"
          class="rounded-md bg-[var(--cs-primary)] px-4 py-1.5 text-[13px] font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] cs-transition"
        >
          Get Started
        </a>
      </div>
    </div>
  </nav>

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
        href="/join"
        class="rounded-md bg-[var(--cs-primary)] px-6 py-2.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] cs-transition"
      >
        Create a Cooperative
      </a>
      <a
        href="/explore"
        class="rounded-md border border-[var(--cs-border)] px-6 py-2.5 text-sm font-medium text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)] cs-transition"
      >
        Explore Directory
      </a>
    </div>
  </main>
</div>
