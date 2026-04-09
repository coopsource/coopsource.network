<script lang="ts">
  interface Props {
    initialValues?: Partial<{
      title: string;
      agreementType: string;
      purpose: string;
      scope: string;
      body: string;
    }>;
  }

  let { initialValues }: Props = $props();
</script>

<div>
  <label for="title" class="block text-sm font-medium text-[var(--cs-text)]">Title</label>
  <input id="title" name="title" type="text" required value={initialValues?.title ?? ''} class="mt-1 block w-full rounded-md border border-[var(--cs-border)] bg-[var(--cs-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" placeholder="e.g. Worker Cooperative Agreement" />
</div>

<div>
  <label for="agreementType" class="block text-sm font-medium text-[var(--cs-text)]">Type</label>
  <select id="agreementType" name="agreementType" value={initialValues?.agreementType ?? 'custom'} class="mt-1 block w-full rounded-md border border-[var(--cs-border)] bg-[var(--cs-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]">
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
  <textarea id="purpose" name="purpose" rows={3} class="mt-1 block w-full rounded-md border border-[var(--cs-border)] bg-[var(--cs-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" placeholder="What is this agreement for?">{initialValues?.purpose ?? ''}</textarea>
</div>

<div>
  <label for="scope" class="block text-sm font-medium text-[var(--cs-text)]">Scope</label>
  <textarea id="scope" name="scope" rows={3} class="mt-1 block w-full rounded-md border border-[var(--cs-border)] bg-[var(--cs-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" placeholder="Who does this agreement apply to?">{initialValues?.scope ?? ''}</textarea>
</div>

<div>
  <label for="body" class="block text-sm font-medium text-[var(--cs-text)]">Content (optional)</label>
  <textarea id="body" name="body" rows={8} class="mt-1 block w-full rounded-md border border-[var(--cs-border)] bg-[var(--cs-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" placeholder="Full agreement text (markdown supported)...">{initialValues?.body ?? ''}</textarea>
</div>
