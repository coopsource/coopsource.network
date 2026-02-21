<script lang="ts">
  import { enhance } from '$app/forms';

  let { form } = $props();

  let submitting = $state(false);
</script>

<svelte:head>
  <title>New Agreement — Co-op Source</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
  <div class="flex items-center gap-3">
    <a href="/agreements" class="text-sm text-gray-500 hover:text-gray-700">← Agreements</a>
    <h1 class="text-xl font-semibold text-gray-900">New Agreement</h1>
  </div>

  {#if form?.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}

  <form
    method="POST"
    use:enhance={() => {
      submitting = true;
      return async ({ update }) => {
        submitting = false;
        await update();
      };
    }}
    class="space-y-5 rounded-lg border border-gray-200 bg-white p-6"
  >
    <div>
      <label for="title" class="block text-sm font-medium text-gray-700">Title</label>
      <input
        id="title"
        name="title"
        type="text"
        required
        class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        placeholder="Agreement title"
      />
    </div>

    <div>
      <label for="agreementType" class="block text-sm font-medium text-gray-700">Type</label>
      <select
        id="agreementType"
        name="agreementType"
        class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="custom">General / Custom</option>
        <option value="membership">Membership</option>
        <option value="contribution">Contribution</option>
        <option value="governance">Governance</option>
        <option value="revenueShare">Revenue Share</option>
        <option value="service">Service</option>
      </select>
    </div>

    <div>
      <label for="body" class="block text-sm font-medium text-gray-700">Content</label>
      <textarea
        id="body"
        name="body"
        required
        rows={12}
        class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        placeholder="Write the agreement text here…"
      ></textarea>
    </div>

    <div class="flex justify-end gap-3 pt-2">
      <a
        href="/agreements"
        class="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Cancel
      </a>
      <button
        type="submit"
        disabled={submitting}
        class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting ? 'Creating…' : 'Create agreement'}
      </button>
    </div>
  </form>
</div>
