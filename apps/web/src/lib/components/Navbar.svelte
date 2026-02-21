<script lang="ts">
  import type { AuthUser } from '$lib/api/types.js';

  interface Props {
    user: AuthUser | null;
  }

  let { user }: Props = $props();

  let menuOpen = $state(false);
</script>

<header class="flex h-14 items-center justify-end border-b border-gray-200 bg-white px-4">
  {#if user}
    <div class="relative">
      <button
        type="button"
        onclick={() => (menuOpen = !menuOpen)}
        class="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
      >
        <span class="font-medium">{user.displayName}</span>
        <span class="text-gray-400">▾</span>
      </button>

      {#if menuOpen}
        <div class="absolute right-0 top-full z-10 mt-1 w-48 rounded-md border border-gray-200 bg-white shadow-lg">
          <div class="border-b border-gray-100 px-3 py-2">
            <p class="text-xs text-gray-500">{user.email}</p>
            {#if user.handle}
              <p class="text-xs text-gray-400">@{user.handle}</p>
            {/if}
          </div>
          <form method="POST" action="/logout">
            <button
              type="submit"
              class="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              onclick={() => (menuOpen = false)}
            >
              Sign out
            </button>
          </form>
        </div>
      {/if}
    </div>
  {/if}
</header>
