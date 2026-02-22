<script lang="ts">
  import { enhance } from '$app/forms';

  let { data, form } = $props();
  let supporting = $state(false);

  const o = $derived(data.outcome);

  function categoryBadgeClass(category: string): string {
    switch (category) {
      case 'financial': return 'bg-green-100 text-green-700';
      case 'social': return 'bg-blue-100 text-blue-700';
      case 'environmental': return 'bg-emerald-100 text-emerald-700';
      case 'governance': return 'bg-purple-100 text-purple-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  }

  function supportLevelClass(level: string): string {
    switch (level) {
      case 'strong': return 'text-green-700';
      case 'moderate': return 'text-blue-700';
      case 'conditional': return 'text-yellow-700';
      case 'neutral': return 'text-gray-500';
      case 'opposed': return 'text-red-700';
      default: return 'text-gray-500';
    }
  }
</script>

<svelte:head>
  <title>{o.title} — Co-op Source</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
  <div class="flex items-start justify-between">
    <div>
      <a href="/alignment" class="text-sm text-gray-500 hover:text-gray-700">&larr; Alignment</a>
      <h1 class="mt-1 text-xl font-semibold text-gray-900">{o.title}</h1>
    </div>
    <span class="rounded-full px-2.5 py-1 text-xs font-medium {categoryBadgeClass(o.category)}">
      {o.category}
    </span>
  </div>

  {#if o.description}
    <p class="text-sm text-gray-600">{o.description}</p>
  {/if}

  <div class="flex gap-3 text-xs text-gray-400">
    <span>Status: <strong class="text-gray-700">{o.status}</strong></span>
    <span>Created: {new Date(o.createdAt).toLocaleDateString()}</span>
  </div>

  <!-- Success Criteria -->
  {#if o.successCriteria.length > 0}
    <div class="rounded-lg border border-gray-200 bg-white p-4">
      <h2 class="text-sm font-medium text-gray-900">Success Criteria</h2>
      <div class="mt-2 space-y-2">
        {#each o.successCriteria as criterion}
          <div class="rounded-md bg-gray-50 p-2 text-sm">
            <span class="font-medium text-gray-700">{criterion.metric}:</span>
            <span class="text-gray-600">{criterion.target}</span>
            {#if criterion.timeline}
              <span class="text-xs text-gray-400"> ({criterion.timeline})</span>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Stakeholder Support -->
  <div class="rounded-lg border border-gray-200 bg-white p-4">
    <h2 class="text-sm font-medium text-gray-900">Stakeholder Support ({o.stakeholderSupport.length})</h2>

    {#if o.stakeholderSupport.length > 0}
      <div class="mt-2 space-y-1">
        {#each o.stakeholderSupport as entry}
          <div class="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-sm">
            <span class="text-gray-600">{entry.stakeholderDid.slice(0, 24)}…</span>
            <span class="font-medium {supportLevelClass(entry.supportLevel)}">{entry.supportLevel}</span>
          </div>
        {/each}
      </div>
    {:else}
      <p class="mt-2 text-sm text-gray-500">No support declarations yet.</p>
    {/if}

    <!-- Support Form -->
    <div class="mt-4 border-t border-gray-100 pt-4">
      <h3 class="text-xs font-medium text-gray-700">Declare Your Support</h3>
      {#if form?.error}
        <div class="mt-2 rounded-md bg-red-50 p-2 text-sm text-red-700">{form.error}</div>
      {/if}
      <form
        method="POST"
        action="?/support"
        use:enhance={() => {
          supporting = true;
          return async ({ update }) => {
            supporting = false;
            await update();
          };
        }}
        class="mt-2 space-y-3"
      >
        <div>
          <label for="level" class="block text-xs text-gray-600">Support Level</label>
          <select
            id="level"
            name="level"
            class="mt-0.5 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="strong">Strong</option>
            <option value="moderate">Moderate</option>
            <option value="conditional">Conditional</option>
            <option value="neutral" selected>Neutral</option>
            <option value="opposed">Opposed</option>
          </select>
        </div>
        <div>
          <label for="conditions" class="block text-xs text-gray-600">Conditions (optional)</label>
          <textarea
            id="conditions"
            name="conditions"
            rows="2"
            maxlength="2000"
            class="mt-0.5 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
          ></textarea>
        </div>
        <button
          type="submit"
          disabled={supporting}
          class="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {supporting ? 'Saving…' : 'Submit Support'}
        </button>
      </form>
    </div>
  </div>
</div>
