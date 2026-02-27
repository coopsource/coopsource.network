<script lang="ts">
  let { data, children } = $props();
</script>

<div class="min-h-screen bg-[var(--cs-bg)]">
  <!-- Top navbar -->
  <nav class="border-b border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
    <div class="mx-auto flex h-12 max-w-6xl items-center justify-between px-4">
      <a href="/explore" class="flex items-center gap-2 font-semibold text-[var(--cs-text)]">
        <svg class="h-5 w-5 text-[var(--cs-primary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        Co-op Source
      </a>

      <div class="flex items-center gap-3">
        {#if data.user}
          <a
            href="/dashboard"
            class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] cs-transition"
          >
            Dashboard
          </a>
        {:else}
          <a
            href="/login"
            class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)] cs-transition"
          >
            Log in
          </a>
          <a
            href="/register"
            class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] cs-transition"
          >
            Sign up
          </a>
        {/if}
      </div>
    </div>
  </nav>

  <!-- Page content -->
  <main class="mx-auto max-w-6xl px-4 py-8">
    {@render children()}
  </main>
</div>
