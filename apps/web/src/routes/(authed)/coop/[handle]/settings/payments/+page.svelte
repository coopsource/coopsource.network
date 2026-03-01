<script lang="ts">
  import { enhance } from '$app/forms';

  let { data, form } = $props();
  let adding = $state(false);
  let showAddForm = $state(false);
</script>

<svelte:head>
  <title>Payment Providers — Co-op Source</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-xl font-semibold text-[var(--cs-text)]">Payment Providers</h1>
      <p class="mt-1 text-sm text-[var(--cs-text-muted)]">Configure which payment methods are available for your cooperative's funding campaigns.</p>
    </div>
    {#if !showAddForm}
      <button onclick={() => showAddForm = true} class="rounded-md bg-[var(--cs-primary)] px-3 py-2 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]">
        Add Provider
      </button>
    {/if}
  </div>

  {#if form?.error}
    <div class="rounded-md border border-[var(--color-danger-light)] bg-[var(--color-danger-light)] p-3 text-sm text-[var(--color-danger-dark)]">{form.error}</div>
  {/if}
  {#if form?.success}
    <div class="rounded-md border border-green-200 bg-[var(--cs-bg-inset)] p-3 text-sm text-[var(--cs-text)]">Provider updated successfully.</div>
  {/if}

  {#if showAddForm}
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4">
      <h2 class="mb-3 text-sm font-medium text-[var(--cs-text)]">Add Payment Provider</h2>
      <form method="POST" action="?/add" use:enhance={() => {
        adding = true;
        return async ({ result, update }) => {
          adding = false;
          if (result.type === 'success') {
            showAddForm = false;
          }
          await update();
        };
      }} class="space-y-3">
        <div>
          <label for="providerId" class="block text-xs font-medium text-[var(--cs-text-secondary)]">Provider</label>
          <select name="providerId" id="providerId" required class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]">
            {#each data.supportedProviders as sp}
              <option value={sp.id}>{sp.displayName}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="displayName" class="block text-xs font-medium text-[var(--cs-text-secondary)]">Display Name</label>
          <input name="displayName" id="displayName" type="text" placeholder="e.g. Stripe" required class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
        </div>
        <div>
          <label for="secretKey" class="block text-xs font-medium text-[var(--cs-text-secondary)]">Secret Key</label>
          <input name="secretKey" id="secretKey" type="password" placeholder="sk_live_..." required class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm font-mono focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
        </div>
        <div>
          <label for="webhookSecret" class="block text-xs font-medium text-[var(--cs-text-secondary)]">Webhook Secret <span class="text-[var(--cs-text-muted)]">(optional)</span></label>
          <input name="webhookSecret" id="webhookSecret" type="password" placeholder="whsec_..." class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm font-mono focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
        </div>
        <div class="flex gap-2">
          <button type="submit" disabled={adding} class="rounded-md bg-[var(--cs-primary)] px-4 py-2 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50">
            {adding ? 'Adding...' : 'Add Provider'}
          </button>
          <button type="button" onclick={() => showAddForm = false} class="rounded-md border border-[var(--cs-border)] px-4 py-2 text-sm text-[var(--cs-text-muted)] hover:bg-[var(--cs-bg-inset)]">
            Cancel
          </button>
        </div>
      </form>
    </div>
  {/if}

  {#if data.configs.length === 0 && !showAddForm}
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-6 text-center">
      <p class="text-sm text-[var(--cs-text-muted)]">No payment providers configured. Pledges will be recorded without online payment processing.</p>
    </div>
  {:else}
    <div class="space-y-3">
      {#each data.configs as config}
        <div class="flex items-center justify-between rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] px-4 py-3">
          <div class="flex items-center gap-3">
            <div class="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--cs-bg-inset)] text-xs font-bold text-[var(--cs-text-muted)]">
              {config.providerId.charAt(0).toUpperCase()}
            </div>
            <div>
              <p class="text-sm font-medium text-[var(--cs-text)]">{config.displayName}</p>
              <p class="text-xs text-[var(--cs-text-muted)]">{config.providerId}</p>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <form method="POST" action="?/toggle" use:enhance>
              <input type="hidden" name="providerId" value={config.providerId} />
              <input type="hidden" name="enabled" value={String(!config.enabled)} />
              <button type="submit" class="rounded-full px-2.5 py-1 text-xs font-medium {config.enabled ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}">
                {config.enabled ? 'Enabled' : 'Disabled'}
              </button>
            </form>
            <form method="POST" action="?/remove" use:enhance>
              <input type="hidden" name="providerId" value={config.providerId} />
              <button type="submit" class="text-xs text-red-500 hover:text-red-700">Remove</button>
            </form>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
