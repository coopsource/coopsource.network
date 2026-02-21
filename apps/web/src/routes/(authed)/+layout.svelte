<script lang="ts">
  import Sidebar from '$lib/components/Sidebar.svelte';
  import Navbar from '$lib/components/Navbar.svelte';

  let { data, children } = $props();
</script>

<div class="flex h-screen overflow-hidden bg-gray-50">
  <Sidebar />
  <div class="flex flex-1 flex-col overflow-hidden">
    <Navbar user={data.user} />
    <main class="flex-1 overflow-auto p-6">
      {@render children()}
    </main>
  </div>
</div>
