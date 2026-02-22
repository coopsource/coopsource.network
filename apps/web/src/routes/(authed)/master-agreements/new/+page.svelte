<script lang="ts">
  import { enhance } from '$app/forms';

  let { form } = $props();

  let submitting = $state(false);
</script>

<svelte:head>
  <title>New Master Agreement — Co-op Source</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
  <div class="flex items-center gap-3">
    <a href="/master-agreements" class="text-sm text-[var(--cs-text-muted)] hover:text-[var(--cs-text)]">← Master Agreements</a>
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">New Master Agreement</h1>
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
    class="space-y-5 rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-6"
  >
    <div>
      <label for="title" class="block text-sm font-medium text-[var(--cs-text)]">Title</label>
      <input
        id="title"
        name="title"
        type="text"
        required
        class="mt-1 block w-full rounded-md border border-[var(--cs-border)] bg-[var(--cs-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        placeholder="e.g. Worker Cooperative Master Agreement"
      />
    </div>

    <div>
      <label for="agreementType" class="block text-sm font-medium text-[var(--cs-text)]">Type</label>
      <select
        id="agreementType"
        name="agreementType"
        class="mt-1 block w-full rounded-md border border-[var(--cs-border)] bg-[var(--cs-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="custom">Custom</option>
        <option value="worker-cooperative">Worker Cooperative</option>
        <option value="multi-stakeholder">Multi-Stakeholder</option>
        <option value="platform-cooperative">Platform Cooperative</option>
        <option value="open-source">Open Source</option>
        <option value="producer-cooperative">Producer Cooperative</option>
        <option value="hybrid-member-investor">Hybrid Member-Investor</option>
      </select>
    </div>

    <div>
      <label for="purpose" class="block text-sm font-medium text-[var(--cs-text)]">Purpose</label>
      <textarea
        id="purpose"
        name="purpose"
        rows={3}
        class="mt-1 block w-full rounded-md border border-[var(--cs-border)] bg-[var(--cs-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        placeholder="What is this agreement for?"
      ></textarea>
    </div>

    <div>
      <label for="scope" class="block text-sm font-medium text-[var(--cs-text)]">Scope</label>
      <textarea
        id="scope"
        name="scope"
        rows={3}
        class="mt-1 block w-full rounded-md border border-[var(--cs-border)] bg-[var(--cs-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        placeholder="Who does this agreement apply to?"
      ></textarea>
    </div>

    <div class="flex justify-end gap-3 pt-2">
      <a
        href="/master-agreements"
        class="rounded-md border border-[var(--cs-border)] px-4 py-2 text-sm font-medium text-[var(--cs-text)] hover:bg-[var(--cs-bg-hover)]"
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
