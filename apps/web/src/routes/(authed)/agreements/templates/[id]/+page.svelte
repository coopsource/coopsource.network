<script lang="ts">
  import { enhance } from '$app/forms';

  let { data, form } = $props();

  let submitting = $state(false);

  const td = data.template.templateData as Record<string, string>;
</script>

<svelte:head>
  <title>{data.template.name} — Template — Co-op Source</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <a href="/agreements/templates" class="text-sm text-[var(--cs-text-muted)] hover:text-[var(--cs-text)]">&larr; Templates</a>
      <h1 class="text-xl font-semibold text-[var(--cs-text)]">{data.template.name}</h1>
    </div>
    <div class="flex items-center gap-2">
      <form method="POST" action="?/use" use:enhance>
        <button
          type="submit"
          class="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
        >
          Use template
        </button>
      </form>
      <form
        method="POST"
        action="?/delete"
        onsubmit={(e) => { if (!confirm('Delete this template?')) e.preventDefault(); }}
        use:enhance
      >
        <button
          type="submit"
          class="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          Delete
        </button>
      </form>
    </div>
  </div>

  {#if form?.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}

  {#if form?.success}
    <div class="rounded-md bg-green-50 p-3 text-sm text-green-700">Template updated.</div>
  {/if}

  <form
    method="POST"
    action="?/update"
    use:enhance={() => {
      submitting = true;
      return async ({ update }) => {
        submitting = false;
        await update();
      };
    }}
    class="space-y-5 rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-6"
  >
    <fieldset class="space-y-4">
      <legend class="text-sm font-semibold text-[var(--cs-text)]">Template Details</legend>

      <div>
        <label for="name" class="block text-sm font-medium text-[var(--cs-text)]">Template Name</label>
        <input
          id="name"
          name="name"
          type="text"
          required
          value={data.template.name}
          class="mt-1 block w-full rounded-md border border-[var(--cs-border)] bg-[var(--cs-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        />
      </div>

      <div>
        <label for="description" class="block text-sm font-medium text-[var(--cs-text)]">Description</label>
        <textarea
          id="description"
          name="description"
          rows={2}
          class="mt-1 block w-full rounded-md border border-[var(--cs-border)] bg-[var(--cs-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        >{data.template.description ?? ''}</textarea>
      </div>

      <div>
        <label for="agreementType" class="block text-sm font-medium text-[var(--cs-text)]">Agreement Type</label>
        <select
          id="agreementType"
          name="agreementType"
          value={data.template.agreementType}
          class="mt-1 block w-full rounded-md border border-[var(--cs-border)] bg-[var(--cs-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
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
    </fieldset>

    <fieldset class="space-y-4 border-t border-[var(--cs-border)] pt-5">
      <legend class="text-sm font-semibold text-[var(--cs-text)]">Pre-filled Agreement Fields</legend>

      <div>
        <label for="title" class="block text-sm font-medium text-[var(--cs-text)]">Default Title</label>
        <input
          id="title"
          name="title"
          type="text"
          value={td.title ?? ''}
          class="mt-1 block w-full rounded-md border border-[var(--cs-border)] bg-[var(--cs-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        />
      </div>

      <div>
        <label for="purpose" class="block text-sm font-medium text-[var(--cs-text)]">Default Purpose</label>
        <textarea
          id="purpose"
          name="purpose"
          rows={3}
          class="mt-1 block w-full rounded-md border border-[var(--cs-border)] bg-[var(--cs-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        >{td.purpose ?? ''}</textarea>
      </div>

      <div>
        <label for="scope" class="block text-sm font-medium text-[var(--cs-text)]">Default Scope</label>
        <textarea
          id="scope"
          name="scope"
          rows={3}
          class="mt-1 block w-full rounded-md border border-[var(--cs-border)] bg-[var(--cs-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        >{td.scope ?? ''}</textarea>
      </div>

      <div>
        <label for="body" class="block text-sm font-medium text-[var(--cs-text)]">Default Content</label>
        <textarea
          id="body"
          name="body"
          rows={8}
          class="mt-1 block w-full rounded-md border border-[var(--cs-border)] bg-[var(--cs-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        >{td.body ?? ''}</textarea>
      </div>
    </fieldset>

    <div class="flex justify-end gap-3 pt-2">
      <a
        href="/agreements/templates"
        class="rounded-md border border-[var(--cs-border)] px-4 py-2 text-sm font-medium text-[var(--cs-text)] hover:bg-[var(--cs-bg-hover)]"
      >
        Cancel
      </a>
      <button
        type="submit"
        disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-4 py-2 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50"
      >
        {submitting ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  </form>
</div>
