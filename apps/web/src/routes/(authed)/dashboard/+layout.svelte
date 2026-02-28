<script lang="ts">
  import ThemeToggle from '$lib/components/ui/ThemeToggle.svelte';
  import LogOut from '@lucide/svelte/icons/log-out';

  let { data, children } = $props();
</script>

<div class="min-h-screen bg-[var(--cs-bg)]">
  <nav class="border-b border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
    <div class="mx-auto flex h-12 max-w-6xl items-center justify-between px-4">
      <a href="/dashboard" class="text-[15px] font-semibold text-[var(--cs-text)]">Co-op Source</a>
      <div class="flex items-center gap-3">
        <a href="/explore" class="text-[13px] text-[var(--cs-text-muted)] hover:text-[var(--cs-text-secondary)] cs-transition">
          Explore
        </a>
        <ThemeToggle variant="icon" />
        {#if data.user}
          <span class="text-[13px] font-medium text-[var(--cs-text-secondary)]">{data.user.displayName}</span>
          <form method="POST" action="/logout" class="inline">
            <button
              type="submit"
              class="p-1 rounded-[var(--radius-sm)] text-[var(--cs-text-muted)] hover:text-[var(--color-danger)] cs-transition cursor-pointer"
              title="Sign out"
            >
              <LogOut class="h-4 w-4" />
            </button>
          </form>
        {/if}
      </div>
    </div>
  </nav>
  <main class="mx-auto max-w-6xl px-4 py-8">
    {@render children()}
  </main>
</div>
