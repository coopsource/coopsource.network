<script lang="ts">
  import { enhance } from '$app/forms';
  import { workspacePrefix } from '$lib/utils/workspace.js';

  let { data, form } = $props();
  let generating = $state(false);
</script>

<svelte:head>
  <title>Interest Map — Co-op Source</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <a href="{$workspacePrefix}/alignment" class="text-sm text-[var(--cs-text-muted)] hover:text-[var(--cs-text)]">&larr; Alignment</a>
      <h1 class="mt-1 text-xl font-semibold text-[var(--cs-text)]">Interest Map</h1>
    </div>
    <form method="POST" action="?/generate" use:enhance={() => { generating = true; return async ({ update }) => { generating = false; await update(); }; }}>
      <button type="submit" disabled={generating} class="rounded-md bg-[var(--cs-primary)] px-3 py-2 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50">
        {generating ? 'Generating...' : data.map ? 'Regenerate Map' : 'Generate Map'}
      </button>
    </form>
  </div>

  {#if form?.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}

  <p class="text-sm text-[var(--cs-text-muted)]">{data.stakeholderCount} stakeholder{data.stakeholderCount !== 1 ? 's' : ''} have submitted interests.</p>

  {#if !data.map}
    <div class="rounded-lg border border-dashed border-[var(--cs-border)] p-8 text-center">
      <p class="text-sm text-[var(--cs-text-muted)]">No interest map has been generated yet.</p>
      <p class="mt-1 text-xs text-[var(--cs-text-muted)]">Click "Generate Map" to analyze stakeholder interests.</p>
    </div>
  {:else}
    <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
      <div>
        <h2 class="mb-3 text-sm font-medium text-green-700">Alignment Zones ({data.map.alignmentZones.length})</h2>
        {#if data.map.alignmentZones.length === 0}
          <p class="text-sm text-[var(--cs-text-muted)]">No alignment zones detected.</p>
        {:else}
          <div class="space-y-3">
            {#each data.map.alignmentZones as zone}
              <div class="rounded-lg border border-green-200 bg-green-50 p-3">
                <div class="flex items-start justify-between">
                  <p class="text-sm font-medium text-green-800">{zone.description}</p>
                  <span class="rounded-full bg-green-200 px-2 py-0.5 text-xs font-medium text-green-800">{zone.strength}%</span>
                </div>
                <p class="mt-1 text-xs text-green-600">{zone.participants.length} participant{zone.participants.length !== 1 ? 's' : ''}</p>
                {#if zone.interestsInvolved.length > 0}
                  <div class="mt-2 flex flex-wrap gap-1">
                    {#each zone.interestsInvolved.slice(0, 3) as interest}
                      <span class="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700 line-clamp-1">{interest.slice(0, 60)}{interest.length > 60 ? '...' : ''}</span>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div>
        <h2 class="mb-3 text-sm font-medium text-red-700">Conflict Zones ({data.map.conflictZones.length})</h2>
        {#if data.map.conflictZones.length === 0}
          <p class="text-sm text-[var(--cs-text-muted)]">No conflict zones detected.</p>
        {:else}
          <div class="space-y-3">
            {#each data.map.conflictZones as zone}
              <div class="rounded-lg border border-red-200 bg-red-50 p-3">
                <div class="flex items-start justify-between">
                  <p class="text-sm font-medium text-red-800">{zone.description}</p>
                  <span class="rounded-full px-2 py-0.5 text-xs font-medium {zone.severity === 'high' ? 'bg-red-200 text-red-800' : zone.severity === 'medium' ? 'bg-yellow-200 text-yellow-800' : 'bg-gray-200 text-gray-800'}">{zone.severity}</span>
                </div>
                <p class="mt-1 text-xs text-red-600">{zone.stakeholders.length} stakeholder{zone.stakeholders.length !== 1 ? 's' : ''} involved</p>
                {#if zone.potentialSolutions.length > 0}
                  <div class="mt-2">
                    <p class="text-xs font-medium text-red-700">Potential solutions:</p>
                    <ul class="mt-1 space-y-0.5">
                      {#each zone.potentialSolutions as solution}
                        <li class="text-xs text-red-600">• {solution}</li>
                      {/each}
                    </ul>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    {#if data.map.aiAnalysis}
      <div class="rounded-lg border border-purple-200 bg-purple-50 p-4">
        <h2 class="text-sm font-medium text-purple-800">AI Analysis</h2>
        <pre class="mt-2 whitespace-pre-wrap text-sm text-purple-700">{JSON.stringify(data.map.aiAnalysis, null, 2)}</pre>
      </div>
    {/if}

    <p class="text-xs text-[var(--cs-text-muted)]">Last generated: {new Date(data.map.createdAt).toLocaleString()}</p>
  {/if}
</div>
