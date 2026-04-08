<script lang="ts">
  import type { AuthUser } from '$lib/api/types.js';

  // V8.4 — shared anonymous-mode navbar.
  //
  // Used by both the root landing (`apps/web/src/routes/+page.svelte`,
  // which keeps a full-viewport hero outside any layout group) AND the
  // `(public)/+layout.svelte` group that wraps /explore, /about, etc.
  // Single source of truth so the anon-mode chrome stays consistent.
  //
  // Authed users see a "Home" → /me CTA. Anon users see Sign in / Sign up.

  interface Props {
    user?: AuthUser | null;
  }

  let { user = null }: Props = $props();
</script>

<nav class="border-b border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
  <div class="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
    <a href="/" class="flex items-center gap-2 font-semibold text-[var(--cs-text)]">
      <svg
        class="h-5 w-5 text-[var(--cs-primary)]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20" />
        <path
          d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
        />
      </svg>
      <span>Co-op Source</span>
    </a>

    <div class="flex items-center gap-4">
      <a
        href="/explore"
        class="text-[13px] text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)] cs-transition"
      >
        Explore
      </a>
      <a
        href="/about"
        class="text-[13px] text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)] cs-transition"
      >
        About
      </a>

      {#if user}
        <a
          href="/me"
          class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-[13px] font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] cs-transition"
        >
          Home
        </a>
      {:else}
        <a
          href="/login"
          class="text-[13px] text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)] cs-transition"
        >
          Sign in
        </a>
        <a
          href="/register"
          class="rounded-md bg-[var(--cs-primary)] px-4 py-1.5 text-[13px] font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] cs-transition"
        >
          Sign up
        </a>
      {/if}
    </div>
  </div>
</nav>
