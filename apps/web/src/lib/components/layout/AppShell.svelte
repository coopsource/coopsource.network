<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { AuthUser, WorkspaceContext, CoopEntity } from '$lib/api/types.js';
  import Sidebar from './Sidebar.svelte';
  import Navbar from './Navbar.svelte';

  interface Props {
    user?: AuthUser | null;
    workspace?: WorkspaceContext | null;
    myCoops?: CoopEntity[];
    children: Snippet;
  }

  let {
    user = null,
    workspace = null,
    myCoops = [],
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

  // Display label: "Home" for home workspace, cooperative name for coop, "Co-op Source" otherwise
  const displayLabel = $derived(
    workspace?.type === 'home'
      ? 'Home'
      : workspace?.cooperative?.displayName ?? 'Co-op Source'
  );
</script>

<div class="flex h-screen overflow-hidden bg-[var(--cs-bg)]">
  <Sidebar {user} workspaceLabel={displayLabel} {myCoops} bind:collapsed {workspace} />
  <div class="flex flex-1 flex-col overflow-hidden min-w-0">
    <Navbar {user} {workspace} />
    <main class="flex-1 overflow-auto p-6">
      {@render children()}
    </main>
  </div>
</div>
