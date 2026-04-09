<script lang="ts">
  import Home from '@lucide/svelte/icons/home';
  import Search from '@lucide/svelte/icons/search';
  import Building2 from '@lucide/svelte/icons/building-2';
  import X from '@lucide/svelte/icons/x';
  import { enhance } from '$app/forms';
</script>

<aside
  role="complementary"
  aria-label="Getting started guide"
  class="cs-card relative border-l-4 border-[var(--cs-primary)] p-5"
>
  <form method="POST" action="?/dismissGetStarted" use:enhance class="absolute right-2 top-2">
    <button
      type="submit"
      class="rounded p-1 text-[var(--cs-text-muted)] hover:bg-[var(--cs-bg-muted)] hover:text-[var(--cs-text)]"
      aria-label="Dismiss getting started guide"
      title="Dismiss"
    >
      <X size={14} />
    </button>
  </form>

  <h2 class="mb-4 text-base font-semibold text-[var(--cs-text)]">Welcome to Co-op Source</h2>

  <div class="space-y-4">
    <div class="flex items-start gap-3">
      <Home size={20} class="mt-0.5 text-[var(--cs-primary)]" />
      <div class="min-w-0 flex-1">
        <p class="text-sm text-[var(--cs-text-secondary)]">
          This is your Home — your personal hub for cooperatives, matches, and invitations.
        </p>
      </div>
    </div>

    <div class="flex items-start gap-3">
      <Search size={20} class="mt-0.5 text-[var(--cs-primary)]" />
      <div class="min-w-0 flex-1">
        <p class="text-sm text-[var(--cs-text-secondary)]">
          Explore the <a href="/me/explore" class="font-medium text-[var(--cs-primary)] hover:underline">directory</a> to find cooperatives and people.
        </p>
      </div>
    </div>

    <div class="flex items-start gap-3">
      <Building2 size={20} class="mt-0.5 text-[var(--cs-primary)]" />
      <div class="min-w-0 flex-1">
        <p class="text-sm text-[var(--cs-text-secondary)]">
          <a href="/me/explore" class="font-medium text-[var(--cs-primary)] hover:underline">Create or join</a> a cooperative to get started.
        </p>
      </div>
    </div>
  </div>
</aside>
