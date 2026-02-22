<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { AuthUser } from '$lib/api/types.js';
  import Sidebar from './Sidebar.svelte';
  import Navbar from './Navbar.svelte';

  interface Props {
    user?: AuthUser | null;
    coopName?: string;
    children: Snippet;
  }

  let {
    user = null,
    coopName = 'Co-op Source',
    children,
  }: Props = $props();

  let collapsed = $state(
    typeof window !== 'undefined'
      ? localStorage.getItem('sidebar-collapsed') === 'true'
      : false,
  );

  // Persist sidebar state on change
  $effect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('sidebar-collapsed', String(collapsed));
    }
  });
</script>

<div class="flex h-screen overflow-hidden bg-[var(--cs-bg)]">
  <Sidebar {user} {coopName} bind:collapsed />
  <div class="flex flex-1 flex-col overflow-hidden min-w-0">
    <Navbar {user} />
    <main class="flex-1 overflow-auto p-6">
      {@render children()}
    </main>
  </div>
</div>
