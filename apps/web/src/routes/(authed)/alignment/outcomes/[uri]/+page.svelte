<script lang="ts">
  import { enhance } from '$app/forms';

  let { data, form } = $props();
  let supporting = $state(false);
  let updatingStatus = $state(false);

  const o = $derived(data.outcome);

  const nextStatuses: Record<string, string[]> = {
    proposed: ['endorsed', 'abandoned'],
    endorsed: ['active', 'abandoned'],
    active: ['achieved', 'abandoned'],
  };

  const statusButtonClass: Record<string, string> = {
    endorsed: 'bg-blue-600 hover:bg-blue-700 text-white',
    active: 'bg-green-600 hover:bg-green-700 text-white',
    achieved: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    abandoned: 'bg-gray-500 hover:bg-gray-600 text-white',
  };

  function categoryBadgeClass(category: string): string {
    switch (category) {
      case 'financial': return 'bg-green-100 text-green-700';
      case 'social': return 'bg-blue-100 text-blue-700';
      case 'environmental': return 'bg-emerald-100 text-emerald-700';
      case 'governance': return 'bg-purple-100 text-purple-700';
      default: return 'bg-[var(--cs-bg-inset)] text-[var(--cs-text-secondary)]';
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
      <a href="/alignment" class="text-sm text-[var(--cs-text-muted)] hover:text-[var(--cs-text)]">&larr; Alignment</a>
      <h1 class="mt-1 text-xl font-semibold text-[var(--cs-text)]">{o.title}</h1>
    </div>
    <span class="rounded-full px-2.5 py-1 text-xs font-medium {categoryBadgeClass(o.category)}">
      {o.category}
    </span>
  </div>

  {#if o.description}
    <p class="text-sm text-[var(--cs-text-secondary)]">{o.description}</p>
  {/if}

  <div class="flex gap-3 text-xs text-[var(--cs-text-muted)]">
    <span>Status: <strong class="text-[var(--cs-text-secondary)]">{o.status}</strong></span>
    <span>Created: {new Date(o.createdAt).toLocaleDateString()}</span>
  </div>

  <!-- Status Transitions -->
  {#if nextStatuses[o.status]?.length}
    <div class="flex items-center gap-2">
      <span class="text-xs text-[var(--cs-text-muted)]">Transition to:</span>
      {#each nextStatuses[o.status] as target}
        <form
          method="POST"
          action="?/updateStatus"
          use:enhance={() => {
            updatingStatus = true;
            return async ({ update }) => {
              updatingStatus = false;
              await update();
            };
          }}
          class="inline"
        >
          <input type="hidden" name="status" value={target} />
          <button
            type="submit"
            disabled={updatingStatus}
            class="rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-50 {statusButtonClass[target] ?? 'bg-gray-200 text-gray-700'}"
          >
            {target}
          </button>
        </form>
      {/each}
    </div>
  {/if}

  <!-- Success Criteria -->
  {#if o.successCriteria.length > 0}
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4">
      <h2 class="text-sm font-medium text-[var(--cs-text)]">Success Criteria</h2>
      <div class="mt-2 space-y-2">
        {#each o.successCriteria as criterion}
          <div class="rounded-md bg-[var(--cs-bg-inset)] p-2 text-sm">
            <span class="font-medium text-[var(--cs-text-secondary)]">{criterion.metric}:</span>
            <span class="text-[var(--cs-text-secondary)]">{criterion.target}</span>
            {#if criterion.timeline}
              <span class="text-xs text-[var(--cs-text-muted)]"> ({criterion.timeline})</span>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Stakeholder Support -->
  <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4">
    <h2 class="text-sm font-medium text-[var(--cs-text)]">Stakeholder Support ({o.stakeholderSupport.length})</h2>

    {#if o.stakeholderSupport.length > 0}
      <div class="mt-2 space-y-1">
        {#each o.stakeholderSupport as entry}
          <div class="flex items-center justify-between rounded-md bg-[var(--cs-bg-inset)] px-3 py-2 text-sm">
            <span class="text-[var(--cs-text-secondary)]">{entry.stakeholderDid.slice(0, 24)}…</span>
            <span class="font-medium {supportLevelClass(entry.supportLevel)}">{entry.supportLevel}</span>
          </div>
        {/each}
      </div>
    {:else}
      <p class="mt-2 text-sm text-[var(--cs-text-muted)]">No support declarations yet.</p>
    {/if}

    <!-- Support Form -->
    <div class="mt-4 border-t border-[var(--cs-border)] pt-4">
      <h3 class="text-xs font-medium text-[var(--cs-text-secondary)]">Declare Your Support</h3>
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
          <label for="level" class="block text-xs text-[var(--cs-text-secondary)]">Support Level</label>
          <select
            id="level"
            name="level"
            class="mt-0.5 block w-full rounded border border-[var(--cs-border)] px-2 py-1 text-sm"
          >
            <option value="strong">Strong</option>
            <option value="moderate">Moderate</option>
            <option value="conditional">Conditional</option>
            <option value="neutral" selected>Neutral</option>
            <option value="opposed">Opposed</option>
          </select>
        </div>
        <div>
          <label for="conditions" class="block text-xs text-[var(--cs-text-secondary)]">Conditions (optional)</label>
          <textarea
            id="conditions"
            name="conditions"
            rows="2"
            maxlength="2000"
            class="mt-0.5 block w-full rounded border border-[var(--cs-border)] px-2 py-1 text-sm"
          ></textarea>
        </div>
        <button
          type="submit"
          disabled={supporting}
          class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-xs font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50"
        >
          {supporting ? 'Saving…' : 'Submit Support'}
        </button>
      </form>
    </div>
  </div>
</div>
