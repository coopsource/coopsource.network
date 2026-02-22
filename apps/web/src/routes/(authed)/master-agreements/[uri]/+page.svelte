<script lang="ts">
  import { enhance } from '$app/forms';
  import { Badge } from '$lib/components/ui';

  let { data, form } = $props();

  let submitting = $state(false);

  function statusToVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
    switch (status) {
      case 'active': return 'success';
      case 'draft': return 'default';
      case 'amended': return 'warning';
      case 'terminated': return 'danger';
      default: return 'default';
    }
  }
</script>

<svelte:head>
  <title>{data.agreement.title} — Co-op Source</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6">
  <div class="flex items-center gap-3">
    <a href="/master-agreements" class="text-sm text-[var(--cs-text-muted)] hover:text-[var(--cs-text)]">← Master Agreements</a>
  </div>

  {#if form?.actionSuccess}
    <div class="rounded-md bg-green-50 p-3 text-sm text-green-700">{form.actionSuccess}</div>
  {/if}
  {#if form?.actionError}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.actionError}</div>
  {/if}

  <!-- Agreement Detail -->
  <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-6">
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold text-[var(--cs-text)]">{data.agreement.title}</h1>
        <div class="mt-1 flex items-center gap-3 text-sm text-[var(--cs-text-muted)]">
          <span>{data.agreement.agreementType}</span>
          <span>v{data.agreement.version}</span>
          <span>Created {new Date(data.agreement.createdAt).toLocaleDateString()}</span>
        </div>
      </div>
      <Badge variant={statusToVariant(data.agreement.status)} class="shrink-0">{data.agreement.status}</Badge>
    </div>

    {#if data.agreement.purpose}
      <div class="mt-4">
        <h3 class="text-sm font-medium text-[var(--cs-text)]">Purpose</h3>
        <p class="mt-1 text-sm text-[var(--cs-text-muted)]">{data.agreement.purpose}</p>
      </div>
    {/if}

    {#if data.agreement.scope}
      <div class="mt-4">
        <h3 class="text-sm font-medium text-[var(--cs-text)]">Scope</h3>
        <p class="mt-1 text-sm text-[var(--cs-text-muted)]">{data.agreement.scope}</p>
      </div>
    {/if}

    {#if data.agreement.effectiveDate}
      <div class="mt-4">
        <h3 class="text-sm font-medium text-[var(--cs-text)]">Effective Date</h3>
        <p class="mt-1 text-sm text-[var(--cs-text-muted)]">{new Date(data.agreement.effectiveDate).toLocaleDateString()}</p>
      </div>
    {/if}

    <!-- Status Actions -->
    <div class="mt-6 flex gap-3">
      {#if data.agreement.status === 'draft'}
        <form method="POST" action="?/activate" use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }}>
          <button
            type="submit"
            disabled={submitting}
            class="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            Activate
          </button>
        </form>
      {/if}
      {#if data.agreement.status === 'active'}
        <form method="POST" action="?/terminate" use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }}>
          <button
            type="submit"
            disabled={submitting}
            class="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            Terminate
          </button>
        </form>
      {/if}
    </div>
  </div>

  <!-- Stakeholder Terms -->
  <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-6">
    <h2 class="text-lg font-semibold text-[var(--cs-text)]">Stakeholder Terms</h2>

    {#if data.terms.length === 0}
      <p class="mt-3 text-sm text-[var(--cs-text-muted)]">No stakeholder terms have been added yet.</p>
    {:else}
      <div class="mt-4 space-y-3">
        {#each data.terms as term}
          <div class="flex items-start justify-between gap-3 rounded-md border border-[var(--cs-border)] p-4">
            <div>
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-[var(--cs-text)]">{term.stakeholderDid}</span>
                <Badge variant="default">{term.stakeholderType}</Badge>
                {#if term.stakeholderClass}
                  <span class="text-xs text-[var(--cs-text-muted)]">{term.stakeholderClass}</span>
                {/if}
              </div>
              {#if term.contributions.length > 0}
                <div class="mt-1 text-xs text-[var(--cs-text-muted)]">
                  Contributions: {term.contributions.map(c => c.description).join(', ')}
                </div>
              {/if}
              <div class="mt-1 text-xs text-[var(--cs-text-muted)]">
                Added {new Date(term.createdAt).toLocaleDateString()}
              </div>
            </div>
            {#if data.agreement.status === 'draft'}
              <form method="POST" action="?/removeTerms" use:enhance>
                <input type="hidden" name="termsUri" value={term.uri} />
                <button
                  type="submit"
                  class="text-xs text-red-600 hover:text-red-700"
                >
                  Remove
                </button>
              </form>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    <!-- Add Terms Form -->
    {#if data.agreement.status === 'draft' || data.agreement.status === 'active'}
      <div class="mt-6 border-t border-[var(--cs-border)] pt-4">
        <h3 class="text-sm font-medium text-[var(--cs-text)]">Add Stakeholder Terms</h3>
        <form
          method="POST"
          action="?/addTerms"
          use:enhance={() => {
            submitting = true;
            return async ({ update }) => {
              submitting = false;
              await update();
            };
          }}
          class="mt-3 flex flex-wrap items-end gap-3"
        >
          <div class="flex-1 min-w-[200px]">
            <label for="stakeholderDid" class="block text-xs font-medium text-[var(--cs-text)]">Stakeholder DID</label>
            <input
              id="stakeholderDid"
              name="stakeholderDid"
              type="text"
              required
              class="mt-1 block w-full rounded-md border border-[var(--cs-border)] bg-[var(--cs-bg)] px-2 py-1.5 text-sm text-[var(--cs-text)] focus:border-blue-500 focus:outline-none"
              placeholder="did:plc:..."
            />
          </div>
          <div>
            <label for="stakeholderType" class="block text-xs font-medium text-[var(--cs-text)]">Type</label>
            <select
              id="stakeholderType"
              name="stakeholderType"
              class="mt-1 block rounded-md border border-[var(--cs-border)] bg-[var(--cs-bg)] px-2 py-1.5 text-sm text-[var(--cs-text)] focus:border-blue-500 focus:outline-none"
            >
              <option value="worker">Worker</option>
              <option value="investor">Investor</option>
              <option value="customer">Customer</option>
              <option value="supplier">Supplier</option>
              <option value="community">Community</option>
              <option value="partner">Partner</option>
            </select>
          </div>
          <div>
            <label for="stakeholderClass" class="block text-xs font-medium text-[var(--cs-text)]">Class (optional)</label>
            <input
              id="stakeholderClass"
              name="stakeholderClass"
              type="text"
              class="mt-1 block rounded-md border border-[var(--cs-border)] bg-[var(--cs-bg)] px-2 py-1.5 text-sm text-[var(--cs-text)] focus:border-blue-500 focus:outline-none"
              placeholder="e.g. founding-member"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Add
          </button>
        </form>
      </div>
    {/if}
  </div>
</div>
