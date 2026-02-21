<script lang="ts">
  import Badge from '$lib/components/Badge.svelte';

  let { data } = $props();

  const coop = $derived(data.cooperative);
  const proposals = $derived(data.proposals);
  const agreements = $derived(data.agreements);
</script>

<svelte:head>
  <title>Dashboard — Co-op Source</title>
</svelte:head>

<div class="space-y-6">
  <h1 class="text-xl font-semibold text-gray-900">Dashboard</h1>

  <!-- Co-op Info Card -->
  {#if coop}
    <div class="rounded-lg border border-gray-200 bg-white p-5">
      <div class="flex items-start justify-between">
        <div>
          <h2 class="text-base font-semibold text-gray-900">{coop.displayName}</h2>
          {#if coop.handle}
            <p class="text-sm text-gray-500">@{coop.handle}</p>
          {/if}
          {#if coop.description}
            <p class="mt-2 text-sm text-gray-600">{coop.description}</p>
          {/if}
          {#if coop.website}
            <a
              href={coop.website}
              target="_blank"
              rel="noreferrer"
              class="mt-1 block text-sm text-blue-600 hover:underline"
            >
              {coop.website}
            </a>
          {/if}
        </div>
        <Badge status={coop.status} />
      </div>
    </div>
  {/if}

  <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
    <!-- Recent Proposals -->
    <div class="rounded-lg border border-gray-200 bg-white">
      <div class="flex items-center justify-between border-b border-gray-200 px-5 py-4">
        <h2 class="text-sm font-semibold text-gray-900">Recent Proposals</h2>
        <a href="/proposals" class="text-xs text-blue-600 hover:underline">View all →</a>
      </div>
      {#if proposals.length === 0}
        <p class="px-5 py-6 text-sm text-gray-500">No proposals yet.</p>
      {:else}
        <ul class="divide-y divide-gray-100">
          {#each proposals as proposal}
            <li class="px-5 py-3">
              <a href="/proposals/{proposal.id}" class="block hover:bg-gray-50 -mx-5 px-5 py-1 rounded">
                <div class="flex items-center justify-between">
                  <span class="text-sm font-medium text-gray-900 truncate">{proposal.title}</span>
                  <Badge status={proposal.status} class="ml-2 shrink-0" />
                </div>
                <p class="text-xs text-gray-500 mt-0.5">
                  by {proposal.authorDisplayName} ·
                  {new Date(proposal.createdAt).toLocaleDateString()}
                </p>
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <!-- Recent Agreements -->
    <div class="rounded-lg border border-gray-200 bg-white">
      <div class="flex items-center justify-between border-b border-gray-200 px-5 py-4">
        <h2 class="text-sm font-semibold text-gray-900">Recent Agreements</h2>
        <a href="/agreements" class="text-xs text-blue-600 hover:underline">View all →</a>
      </div>
      {#if agreements.length === 0}
        <p class="px-5 py-6 text-sm text-gray-500">No agreements yet.</p>
      {:else}
        <ul class="divide-y divide-gray-100">
          {#each agreements as agreement}
            <li class="px-5 py-3">
              <a href="/agreements/{agreement.id}" class="block hover:bg-gray-50 -mx-5 px-5 py-1 rounded">
                <div class="flex items-center justify-between">
                  <span class="text-sm font-medium text-gray-900 truncate">{agreement.title}</span>
                  <Badge status={agreement.status} class="ml-2 shrink-0" />
                </div>
                <p class="text-xs text-gray-500 mt-0.5">
                  by {agreement.authorDisplayName} ·
                  {new Date(agreement.createdAt).toLocaleDateString()}
                </p>
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
</div>
