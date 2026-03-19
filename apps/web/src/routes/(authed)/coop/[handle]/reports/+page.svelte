<script lang="ts">
  import { enhance } from '$app/forms';
  import { Badge, EmptyState, Modal } from '$lib/components/ui';
  import { workspacePrefix } from '$lib/utils/workspace.js';
  import type { ReportTemplate, ReportSnapshot } from '$lib/api/types.js';

  let { data, form } = $props();

  let showTemplateForm = $state(false);
  let showGenerateForm = $state(false);
  let submitting = $state(false);

  $effect(() => {
    if (form?.success) {
      showTemplateForm = false;
      showGenerateForm = false;
    }
  });

  const reportTypes = [
    { value: '', label: 'All Types' },
    { value: 'annual', label: 'Annual' },
    { value: 'board_packet', label: 'Board Packet' },
    { value: 'financial', label: 'Financial' },
    { value: 'membership', label: 'Membership' },
    { value: 'compliance', label: 'Compliance' },
  ];

  function typeVariant(type: string): 'success' | 'warning' | 'danger' | 'default' {
    switch (type) {
      case 'annual': return 'success';
      case 'board_packet': return 'warning';
      case 'financial': return 'danger';
      default: return 'default';
    }
  }
</script>

<svelte:head>
  <title>Reports — Co-op Source</title>
</svelte:head>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">Reports</h1>
    <div class="flex items-center gap-2">
      <button
        type="button"
        onclick={() => (showTemplateForm = true)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
      >New Template</button>
      <button
        type="button"
        onclick={() => (showGenerateForm = true)}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]"
      >Generate Report</button>
    </div>
  </div>

  {#if form?.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}

  <!-- Type Filters -->
  <div class="flex gap-1">
    {#each reportTypes as filter}
      <a
        href={filter.value
          ? `${$workspacePrefix}/reports?reportType=${filter.value}`
          : `${$workspacePrefix}/reports`}
        class="px-3 py-1.5 text-xs font-medium rounded-full transition-colors
          {data.filterType === filter.value
            ? 'bg-[var(--cs-primary)] text-[var(--cs-text-on-primary)]'
            : 'bg-[var(--cs-bg-inset)] text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)]'}"
      >{filter.label}</a>
    {/each}
  </div>

  <!-- Report Templates -->
  {#if data.templates.length > 0}
    <div>
      <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--cs-text-muted)]">Templates</h2>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {#each data.templates as template (template.id)}
          <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4">
            <div class="flex items-start justify-between">
              <div>
                <h3 class="text-sm font-medium text-[var(--cs-text)]">{template.name}</h3>
                <Badge variant={typeVariant(template.reportType)}>{template.reportType}</Badge>
              </div>
              <form method="POST" action="?/deleteTemplate" use:enhance class="inline">
                <input type="hidden" name="id" value={template.id} />
                <button type="submit" class="text-xs text-red-600 hover:underline">Delete</button>
              </form>
            </div>
            <p class="mt-2 text-xs text-[var(--cs-text-muted)]">
              Created {new Date(template.createdAt).toLocaleDateString()}
            </p>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Generated Reports -->
  <div>
    <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--cs-text-muted)]">Generated Reports</h2>
    {#if data.reports.length === 0}
      <EmptyState title="No reports yet" description="Generate your first report to get started." />
    {:else}
      <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-[var(--cs-border)] text-left">
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Title</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Type</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Period</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Generated</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[var(--cs-border)]">
            {#each data.reports as report (report.id)}
              <tr class="hover:bg-[var(--cs-bg-inset)] transition-colors">
                <td class="px-4 py-3">
                  <span class="font-medium text-[var(--cs-text)]">{report.title}</span>
                </td>
                <td class="px-4 py-3">
                  <Badge variant={typeVariant(report.reportType)}>{report.reportType}</Badge>
                </td>
                <td class="px-4 py-3 text-[var(--cs-text-muted)]">
                  {#if report.periodStart && report.periodEnd}
                    {new Date(report.periodStart).toLocaleDateString()} - {new Date(report.periodEnd).toLocaleDateString()}
                  {:else}
                    —
                  {/if}
                </td>
                <td class="px-4 py-3 text-[var(--cs-text-muted)]">
                  {new Date(report.generatedAt).toLocaleDateString()}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>

<!-- Create Template Modal -->
<Modal open={showTemplateForm} title="New Report Template" onclose={() => (showTemplateForm = false)}>
  <form
    method="POST"
    action="?/createTemplate"
    use:enhance={() => {
      submitting = true;
      return async ({ update }) => {
        submitting = false;
        await update();
      };
    }}
    class="space-y-4"
  >
    <div>
      <label for="tpl-name" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Name</label>
      <input
        id="tpl-name"
        name="name"
        type="text"
        required
        placeholder="Template name..."
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      />
    </div>
    <div>
      <label for="tpl-type" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Report Type</label>
      <select
        id="tpl-type"
        name="reportType"
        required
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      >
        <option value="annual">Annual</option>
        <option value="board_packet">Board Packet</option>
        <option value="financial">Financial</option>
        <option value="membership">Membership</option>
        <option value="compliance">Compliance</option>
      </select>
    </div>
    <div class="flex justify-end gap-3">
      <button
        type="button"
        onclick={() => (showTemplateForm = false)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
      >Cancel</button>
      <button
        type="submit"
        disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50"
      >{submitting ? 'Creating...' : 'Create Template'}</button>
    </div>
  </form>
</Modal>

<!-- Generate Report Modal -->
<Modal open={showGenerateForm} title="Generate Report" onclose={() => (showGenerateForm = false)}>
  <form
    method="POST"
    action="?/generateReport"
    use:enhance={() => {
      submitting = true;
      return async ({ update }) => {
        submitting = false;
        await update();
      };
    }}
    class="space-y-4"
  >
    <div>
      <label for="rpt-title" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Title</label>
      <input
        id="rpt-title"
        name="title"
        type="text"
        required
        placeholder="Report title..."
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      />
    </div>
    <div>
      <label for="rpt-type" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Report Type</label>
      <select
        id="rpt-type"
        name="reportType"
        required
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      >
        <option value="annual">Annual</option>
        <option value="board_packet">Board Packet</option>
        <option value="financial">Financial</option>
        <option value="membership">Membership</option>
        <option value="compliance">Compliance</option>
      </select>
    </div>
    {#if data.templates.length > 0}
      <div>
        <label for="rpt-template" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Template (optional)</label>
        <select
          id="rpt-template"
          name="templateId"
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        >
          <option value="">No template</option>
          {#each data.templates as tpl}
            <option value={tpl.id}>{tpl.name}</option>
          {/each}
        </select>
      </div>
    {/if}
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="rpt-start" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Period Start</label>
        <input
          id="rpt-start"
          name="periodStart"
          type="date"
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        />
      </div>
      <div>
        <label for="rpt-end" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Period End</label>
        <input
          id="rpt-end"
          name="periodEnd"
          type="date"
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        />
      </div>
    </div>
    <div class="flex justify-end gap-3">
      <button
        type="button"
        onclick={() => (showGenerateForm = false)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
      >Cancel</button>
      <button
        type="submit"
        disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50"
      >{submitting ? 'Generating...' : 'Generate Report'}</button>
    </div>
  </form>
</Modal>
