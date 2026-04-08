<svelte:head>
  <title>About — Co-op Source</title>
</svelte:head>

<article class="mx-auto max-w-3xl space-y-12 py-8">
  <header>
    <h1 class="text-3xl font-bold tracking-tight text-[var(--cs-text)]">About Co-op Source</h1>
    <p class="mt-2 text-[var(--cs-text-secondary)]">
      A platform for running cooperatives — built on open federation protocols.
    </p>
  </header>

  <section class="space-y-3">
    <h2 class="text-xl font-semibold text-[var(--cs-text)]">What is Co-op Source?</h2>
    <p class="text-[var(--cs-text-secondary)]">
      Co-op Source is software for cooperatives: governance, membership, agreements,
      finance, and operations. Cooperatives own their data, their identity, and their
      network presence. Nothing is locked in.
    </p>
  </section>

  <section class="space-y-3">
    <h2 class="text-xl font-semibold text-[var(--cs-text)]">The recursive cooperative model</h2>
    <p class="text-[var(--cs-text-secondary)]">
      Everything is an entity: a person or a cooperative. A network is just a
      cooperative whose members happen to be other cooperatives. The same membership,
      governance, and agreement machinery works at every level — from a small worker
      collective to a national mutual-aid network.
    </p>
  </section>

  <section class="space-y-3">
    <h2 class="text-xl font-semibold text-[var(--cs-text)]">Built on ATProto</h2>
    <p class="text-[var(--cs-text-secondary)]">
      Cooperatives are real ATProto accounts. Members bring their existing Bluesky
      identities. Governance records flow through the same relay network that carries
      Bluesky posts, Tangled commits, and Smoke Signal RSVPs. Your data lives in your
      own PDS — you can take it with you.
    </p>
  </section>

  <footer class="flex flex-wrap items-center gap-4 border-t border-[var(--cs-border)] pt-8">
    <a
      href="/explore"
      class="rounded-md bg-[var(--cs-primary)] px-4 py-2 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] cs-transition"
    >
      Explore cooperatives
    </a>
    <a
      href="/register"
      class="rounded-md border border-[var(--cs-border)] px-4 py-2 text-sm font-medium text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)] cs-transition"
    >
      Get started
    </a>
  </footer>
</article>
