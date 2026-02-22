<script lang="ts">
  let { data } = $props();

  function categoryBadgeClass(category: string): string {
    switch (category) {
      case 'financial': return 'bg-green-100 text-green-700';
      case 'social': return 'bg-blue-100 text-blue-700';
      case 'environmental': return 'bg-emerald-100 text-emerald-700';
      case 'governance': return 'bg-purple-100 text-purple-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  }
</script>

<svelte:head>
  <title>Alignment — Co-op Source</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-semibold text-gray-900">Alignment Discovery</h1>
  </div>

  <!-- My Interests Summary -->
  <div class="rounded-lg border border-gray-200 bg-white p-4">
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-medium text-gray-900">My Interests</h2>
      <a
        href="/alignment/interests"
        class="text-sm text-indigo-600 hover:text-indigo-700"
      >
        {data.myInterests ? 'Edit' : 'Submit Interests'}
      </a>
    </div>

    {#if data.myInterests}
      <div class="mt-3 space-y-2">
        <div class="flex flex-wrap gap-2">
          {#each data.myInterests.interests as interest}
            <span class="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
              {interest.category} (P{interest.priority})
            </span>
          {/each}
        </div>
        {#if data.myInterests.contributions.length > 0}
          <p class="text-xs text-gray-500">
            {data.myInterests.contributions.length} contribution{data.myInterests.contributions.length !== 1 ? 's' : ''} offered
          </p>
        {/if}
        {#if data.myInterests.redLines.length > 0}
          <p class="text-xs text-red-500">
            {data.myInterests.redLines.length} red line{data.myInterests.redLines.length !== 1 ? 's' : ''} declared
          </p>
        {/if}
      </div>
    {:else}
      <p class="mt-2 text-sm text-gray-500">You haven't submitted your interests yet.</p>
    {/if}
  </div>

  <!-- Desired Outcomes -->
  <div class="rounded-lg border border-gray-200 bg-white p-4">
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-medium text-gray-900">Desired Outcomes</h2>
      <a
        href="/alignment/outcomes/new"
        class="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
      >
        New Outcome
      </a>
    </div>

    {#if data.outcomes.length === 0}
      <p class="mt-2 text-sm text-gray-500">No desired outcomes proposed yet.</p>
    {:else}
      <div class="mt-3 space-y-2">
        {#each data.outcomes as outcome}
          <a
            href="/alignment/outcomes/{encodeURIComponent(outcome.uri)}"
            class="block rounded-md border border-gray-100 bg-gray-50 p-3 transition-colors hover:bg-gray-100"
          >
            <div class="flex items-start justify-between">
              <span class="text-sm font-medium text-gray-900">{outcome.title}</span>
              <span class="rounded-full px-2 py-0.5 text-xs font-medium {categoryBadgeClass(outcome.category)}">
                {outcome.category}
              </span>
            </div>
            {#if outcome.description}
              <p class="mt-1 text-xs text-gray-500 line-clamp-1">{outcome.description}</p>
            {/if}
            <div class="mt-1 flex gap-2 text-xs text-gray-400">
              <span>{outcome.status}</span>
              <span>{outcome.stakeholderSupport.length} supporter{outcome.stakeholderSupport.length !== 1 ? 's' : ''}</span>
            </div>
          </a>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Interest Map Preview -->
  <div class="rounded-lg border border-gray-200 bg-white p-4">
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-medium text-gray-900">Interest Map</h2>
      <a
        href="/alignment/map"
        class="text-sm text-indigo-600 hover:text-indigo-700"
      >
        View Full Map
      </a>
    </div>

    {#if data.map}
      <div class="mt-3 grid grid-cols-2 gap-4">
        <div>
          <p class="text-xs font-medium text-green-700">Alignment Zones</p>
          <p class="text-2xl font-bold text-green-600">{data.map.alignmentZones.length}</p>
        </div>
        <div>
          <p class="text-xs font-medium text-red-700">Conflict Zones</p>
          <p class="text-2xl font-bold text-red-600">{data.map.conflictZones.length}</p>
        </div>
      </div>
    {:else}
      <p class="mt-2 text-sm text-gray-500">No interest map generated yet.</p>
    {/if}
  </div>
</div>
