<script lang="ts">
  import { enhance } from '$app/forms';

  let { form } = $props();

  let submitting = $state(false);
</script>

<svelte:head>
  <title>New Proposal — Co-op Source</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
  <div class="flex items-center gap-3">
    <a href="/proposals" class="text-sm text-gray-500 hover:text-gray-700">← Proposals</a>
    <h1 class="text-xl font-semibold text-gray-900">New Proposal</h1>
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
        placeholder="Proposal title"
      />
    </div>

    <div>
      <label for="body" class="block text-sm font-medium text-gray-700">Description</label>
      <textarea
        id="body"
        name="body"
        required
        rows={8}
        class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        placeholder="Describe the proposal in detail…"
      ></textarea>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="votingType" class="block text-sm font-medium text-gray-700">
          Voting Method
        </label>
        <select
          id="votingType"
          name="votingType"
          class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="binary">Yes / No</option>
          <option value="approval">Approval</option>
          <option value="ranked">Ranked Choice</option>
        </select>
      </div>

      <div>
        <label for="quorumType" class="block text-sm font-medium text-gray-700">Quorum</label>
        <select
          id="quorumType"
          name="quorumType"
          class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="simpleMajority">Simple Majority</option>
          <option value="superMajority">Supermajority (2/3)</option>
          <option value="unanimous">Unanimous</option>
        </select>
      </div>
    </div>

    <div>
      <label for="closesAt" class="block text-sm font-medium text-gray-700">
        Voting Deadline <span class="text-gray-400">(optional)</span>
      </label>
      <input
        id="closesAt"
        name="closesAt"
        type="datetime-local"
        class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>

    <div class="flex justify-end gap-3 pt-2">
      <a
        href="/proposals"
        class="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Cancel
      </a>
      <button
        type="submit"
        disabled={submitting}
        class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting ? 'Creating…' : 'Create proposal'}
      </button>
    </div>
  </form>
</div>
