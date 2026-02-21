<script lang="ts">
  import { enhance } from '$app/forms';
  import Badge from '$lib/components/Badge.svelte';

  let { data, form } = $props();

  let editing = $state(false);
  let submitting = $state(false);

  const coop = $derived(form?.cooperative ?? data.cooperative);
</script>

<svelte:head>
  <title>Co-op Settings — Co-op Source</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-semibold text-gray-900">Co-op Settings</h1>
    {#if !editing}
      <button
        type="button"
        onclick={() => (editing = true)}
        class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
      >
        Edit
      </button>
    {/if}
  </div>

  {#if form?.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}

  {#if form?.success && !editing}
    <div class="rounded-md bg-green-50 p-3 text-sm text-green-700">Settings saved.</div>
  {/if}

  {#if editing}
    <div class="rounded-lg border border-gray-200 bg-white p-5">
      <form
        method="POST"
        action="?/update"
        use:enhance={() => {
          submitting = true;
          return async ({ update }) => {
            submitting = false;
            editing = false;
            await update();
          };
        }}
        class="space-y-4"
      >
        <div>
          <label for="displayName" class="block text-sm font-medium text-gray-700">
            Display Name
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            required
            value={coop.displayName}
            class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label for="description" class="block text-sm font-medium text-gray-700">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            value={coop.description ?? ''}
            class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Describe your cooperative…"
          ></textarea>
        </div>

        <div>
          <label for="website" class="block text-sm font-medium text-gray-700">Website</label>
          <input
            id="website"
            name="website"
            type="url"
            value={coop.website ?? ''}
            class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="https://example.com"
          />
        </div>

        <div class="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Save changes'}
          </button>
          <button
            type="button"
            onclick={() => (editing = false)}
            class="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  {:else}
    <div class="rounded-lg border border-gray-200 bg-white p-5">
      <dl class="space-y-4">
        <div>
          <dt class="text-xs font-medium uppercase tracking-wide text-gray-500">Name</dt>
          <dd class="mt-1 text-sm text-gray-900">{coop.displayName}</dd>
        </div>
        {#if coop.handle}
          <div>
            <dt class="text-xs font-medium uppercase tracking-wide text-gray-500">Handle</dt>
            <dd class="mt-1 text-sm text-gray-900">@{coop.handle}</dd>
          </div>
        {/if}
        <div>
          <dt class="text-xs font-medium uppercase tracking-wide text-gray-500">Status</dt>
          <dd class="mt-1"><Badge status={coop.status} /></dd>
        </div>
        {#if coop.description}
          <div>
            <dt class="text-xs font-medium uppercase tracking-wide text-gray-500">Description</dt>
            <dd class="mt-1 text-sm text-gray-700">{coop.description}</dd>
          </div>
        {/if}
        {#if coop.website}
          <div>
            <dt class="text-xs font-medium uppercase tracking-wide text-gray-500">Website</dt>
            <dd class="mt-1">
              <a
                href={coop.website}
                target="_blank"
                rel="noreferrer"
                class="text-sm text-blue-600 hover:underline"
              >
                {coop.website}
              </a>
            </dd>
          </div>
        {/if}
        <div>
          <dt class="text-xs font-medium uppercase tracking-wide text-gray-500">DID</dt>
          <dd class="mt-1 font-mono text-xs text-gray-500">{coop.did}</dd>
        </div>
        <div>
          <dt class="text-xs font-medium uppercase tracking-wide text-gray-500">Created</dt>
          <dd class="mt-1 text-sm text-gray-700">
            {new Date(coop.createdAt).toLocaleDateString()}
          </dd>
        </div>
      </dl>
    </div>
  {/if}
</div>
