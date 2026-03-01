<script lang="ts">
  import { enhance } from '$app/forms';
  import { Badge } from '$lib/components/ui';

  let { data, form } = $props();

  let editing = $state(false);
  let submitting = $state(false);
  let savingVisibility = $state(false);

  const coop = $derived(form?.cooperative ?? data.cooperative);

  function statusToVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
    switch (status) {
      case 'active': case 'accepted': case 'resolved': case 'signed': return 'success';
      case 'pending': case 'open': case 'closed': return 'warning';
      case 'revoked': case 'void': case 'voided': return 'danger';
      default: return 'default';
    }
  }
</script>

<svelte:head>
  <title>Co-op Settings — Co-op Source</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">Co-op Settings</h1>
    {#if !editing}
      <button type="button" onclick={() => (editing = true)} class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]">Edit</button>
    {/if}
  </div>

  {#if form?.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}
  {#if form?.success && !editing}
    <div class="rounded-md bg-green-50 p-3 text-sm text-green-700">Settings saved.</div>
  {/if}
  {#if form?.visibilitySuccess}
    <div class="rounded-md bg-green-50 p-3 text-sm text-green-700">Visibility settings saved.</div>
  {/if}

  {#if editing}
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-5">
      <form method="POST" action="?/update" use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; editing = false; await update(); }; }} class="space-y-4">
        <div>
          <label for="displayName" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Display Name</label>
          <input id="displayName" name="displayName" type="text" required value={coop.displayName} class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
        </div>
        <div>
          <label for="description" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Description</label>
          <textarea id="description" name="description" rows={3} value={coop.description ?? ''} class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" placeholder="Describe your cooperative..."></textarea>
        </div>
        <div>
          <label for="website" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Website</label>
          <input id="website" name="website" type="url" value={coop.website ?? ''} class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" placeholder="https://example.com" />
        </div>
        <div class="flex gap-3">
          <button type="submit" disabled={submitting} class="rounded-md bg-[var(--cs-primary)] px-4 py-2 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50">
            {submitting ? 'Saving...' : 'Save changes'}
          </button>
          <button type="button" onclick={() => (editing = false)} class="rounded-md border border-[var(--cs-border)] px-4 py-2 text-sm font-medium text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]">Cancel</button>
        </div>
      </form>
    </div>
  {:else}
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-5">
      <dl class="space-y-4">
        <div>
          <dt class="text-xs font-medium uppercase tracking-wide text-[var(--cs-text-muted)]">Name</dt>
          <dd class="mt-1 text-sm text-[var(--cs-text)]">{coop.displayName}</dd>
        </div>
        {#if coop.handle}
          <div>
            <dt class="text-xs font-medium uppercase tracking-wide text-[var(--cs-text-muted)]">Handle</dt>
            <dd class="mt-1 text-sm text-[var(--cs-text)]">@{coop.handle}</dd>
          </div>
        {/if}
        <div>
          <dt class="text-xs font-medium uppercase tracking-wide text-[var(--cs-text-muted)]">Status</dt>
          <dd class="mt-1"><Badge variant={statusToVariant(coop.status)}>{coop.status}</Badge></dd>
        </div>
        {#if coop.description}
          <div>
            <dt class="text-xs font-medium uppercase tracking-wide text-[var(--cs-text-muted)]">Description</dt>
            <dd class="mt-1 text-sm text-[var(--cs-text-secondary)]">{coop.description}</dd>
          </div>
        {/if}
        {#if coop.website}
          <div>
            <dt class="text-xs font-medium uppercase tracking-wide text-[var(--cs-text-muted)]">Website</dt>
            <dd class="mt-1"><a href={coop.website} target="_blank" rel="noreferrer" class="text-sm text-[var(--cs-primary)] hover:underline">{coop.website}</a></dd>
          </div>
        {/if}
        <div>
          <dt class="text-xs font-medium uppercase tracking-wide text-[var(--cs-text-muted)]">DID</dt>
          <dd class="mt-1 font-mono text-xs text-[var(--cs-text-muted)]">{coop.did}</dd>
        </div>
        <div>
          <dt class="text-xs font-medium uppercase tracking-wide text-[var(--cs-text-muted)]">Created</dt>
          <dd class="mt-1 text-sm text-[var(--cs-text-secondary)]">{new Date(coop.createdAt).toLocaleDateString()}</dd>
        </div>
      </dl>
    </div>
  {/if}

  <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-5">
    <h2 class="text-base font-semibold text-[var(--cs-text)]">Public Profile Visibility</h2>
    <p class="mt-1 text-sm text-[var(--cs-text-muted)]">Control what's visible on your public profile at /explore.</p>

    <form method="POST" action="?/updateVisibility" use:enhance={() => { savingVisibility = true; return async ({ update }) => { savingVisibility = false; await update(); }; }} class="mt-4 space-y-3">
      <label class="flex items-center justify-between gap-3 py-1">
        <div>
          <span class="text-sm font-medium text-[var(--cs-text)]">Description</span>
          <span class="block text-xs text-[var(--cs-text-muted)]">Show your cooperative's description publicly</span>
        </div>
        <input type="checkbox" name="publicDescription" checked={coop.publicDescription} class="h-4 w-4 rounded border-[var(--cs-input-border)] text-[var(--cs-primary)] focus:ring-[var(--cs-ring)]" />
      </label>

      <label class="flex items-center justify-between gap-3 py-1">
        <div>
          <span class="text-sm font-medium text-[var(--cs-text)]">Member count</span>
          <span class="block text-xs text-[var(--cs-text-muted)]">Show how many members your cooperative has</span>
        </div>
        <input type="checkbox" name="publicMembers" checked={coop.publicMembers} class="h-4 w-4 rounded border-[var(--cs-input-border)] text-[var(--cs-primary)] focus:ring-[var(--cs-ring)]" />
      </label>

      <label class="flex items-center justify-between gap-3 py-1">
        <div>
          <span class="text-sm font-medium text-[var(--cs-text)]">Activity</span>
          <span class="block text-xs text-[var(--cs-text-muted)]">Show which networks you belong to</span>
        </div>
        <input type="checkbox" name="publicActivity" checked={coop.publicActivity} class="h-4 w-4 rounded border-[var(--cs-input-border)] text-[var(--cs-primary)] focus:ring-[var(--cs-ring)]" />
      </label>

      <label class="flex items-center justify-between gap-3 py-1">
        <div>
          <span class="text-sm font-medium text-[var(--cs-text)]">Agreements</span>
          <span class="block text-xs text-[var(--cs-text-muted)]">Show your cooperative's agreements publicly</span>
        </div>
        <input type="checkbox" name="publicAgreements" checked={coop.publicAgreements} class="h-4 w-4 rounded border-[var(--cs-input-border)] text-[var(--cs-primary)] focus:ring-[var(--cs-ring)]" />
      </label>

      <label class="flex items-center justify-between gap-3 py-1">
        <div>
          <span class="text-sm font-medium text-[var(--cs-text)]">Campaigns</span>
          <span class="block text-xs text-[var(--cs-text-muted)]">Show your cooperative's funding campaigns publicly</span>
        </div>
        <input type="checkbox" name="publicCampaigns" checked={coop.publicCampaigns} class="h-4 w-4 rounded border-[var(--cs-input-border)] text-[var(--cs-primary)] focus:ring-[var(--cs-ring)]" />
      </label>

      <div class="pt-2">
        <button type="submit" disabled={savingVisibility} class="rounded-md bg-[var(--cs-primary)] px-4 py-2 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50">
          {savingVisibility ? 'Saving...' : 'Save visibility settings'}
        </button>
      </div>
    </form>
  </div>
</div>
