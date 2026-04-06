<script lang="ts">
  import { enhance } from '$app/forms';
  import { Badge, EmptyState, Modal, ConfirmDialog } from '$lib/components/ui';
  import Code from '@lucide/svelte/icons/code';
  import type { CoopScript, ScriptTestResult } from '$lib/api/types.js';

  let { data, form } = $props();
  let createModalOpen = $state(false);
  let editingScript = $state<CoopScript | null>(null);
  let submitting = $state(false);
  let confirmDeleteId = $state<string | null>(null);
  let testResult = $state<ScriptTestResult | null>(null);
  let testedScriptId = $state<string | null>(null);
  let viewingLogsFor = $state<string | null>(null);
  let logs = $state<Array<{ id: string; scriptId: string; trigger: string; durationMs: number; status: string; error: string | null; createdAt: string }>>([]);
  let logsLoading = $state(false);

  // Form field state for create/edit modal
  let formName = $state('');
  let formDescription = $state('');
  let formPhase = $state('post-storage');
  let formCollections = $state('');
  let formEventTypes = $state('');
  let formSourceCode = $state('');
  let formConfig = $state('');
  let formTimeout = $state(5000);

  function openCreateModal() {
    formName = '';
    formDescription = '';
    formPhase = 'post-storage';
    formCollections = '';
    formEventTypes = '';
    formSourceCode = '';
    formConfig = '';
    formTimeout = 5000;
    editingScript = null;
    createModalOpen = true;
  }

  function openEditModal(script: CoopScript) {
    formName = script.name;
    formDescription = script.description ?? '';
    formPhase = script.phase;
    formCollections = script.collections.join(', ');
    formEventTypes = script.eventTypes.join(', ');
    formSourceCode = script.sourceCode;
    formConfig = script.config ? JSON.stringify(script.config, null, 2) : '';
    formTimeout = script.timeoutMs;
    editingScript = script;
    createModalOpen = true;
  }

  function closeModal() {
    createModalOpen = false;
    editingScript = null;
  }

  function phaseVariant(phase: string): 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'outline' {
    switch (phase) {
      case 'pre-storage': return 'warning';
      case 'post-storage': return 'primary';
      case 'domain-event': return 'success';
      default: return 'default';
    }
  }

  function statusVariant(status: string): 'success' | 'danger' | 'warning' | 'default' {
    switch (status) {
      case 'success': return 'success';
      case 'error': return 'danger';
      case 'timeout': return 'warning';
      default: return 'default';
    }
  }

  function formatDate(iso: string | null): string {
    if (!iso) return 'Never';
    return new Date(iso).toLocaleString();
  }

  async function loadLogs(scriptId: string) {
    viewingLogsFor = scriptId;
    logsLoading = true;
    try {
      const res = await fetch(`/api/v1/cooperatives/${encodeURIComponent(data.coopDid)}/scripts/${scriptId}/logs`, {
        credentials: 'include',
      });
      if (res.ok) {
        const result = await res.json();
        logs = result.items;
      }
    } catch {
      // silently fail
    } finally {
      logsLoading = false;
    }
  }

  $effect(() => {
    if (form?.success) {
      createModalOpen = false;
      editingScript = null;
      submitting = false;
    }
    if (form?.deleteSuccess) {
      confirmDeleteId = null;
    }
    if (form?.testResult) {
      testResult = form.testResult as ScriptTestResult;
      testedScriptId = form.testedId as string;
    }
  });
</script>

<svelte:head>
  <title>Scripts -- Co-op Source</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <Code class="h-5 w-5 text-[var(--cs-text-secondary)]" />
      <h1 class="text-xl font-semibold text-[var(--cs-text)]">Scripts</h1>
    </div>
    <button type="button" onclick={openCreateModal}
      class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]">
      New script
    </button>
  </div>

  {#if form?.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}

  <!-- Scripts Table -->
  {#if data.scripts.length === 0}
    <EmptyState title="No scripts" description="Create your first pipeline script to automate record processing." />
  {:else}
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-[var(--cs-border)] text-left">
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Name</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Phase</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Triggers</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Enabled</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Last Run</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Errors</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--cs-border)]">
          {#each data.scripts as script}
            <tr>
              <td class="px-4 py-3">
                <div class="font-medium text-[var(--cs-text)]">{script.name}</div>
                {#if script.description}
                  <div class="text-xs text-[var(--cs-text-muted)]">{script.description}</div>
                {/if}
              </td>
              <td class="px-4 py-3">
                <Badge variant={phaseVariant(script.phase)}>{script.phase}</Badge>
              </td>
              <td class="px-4 py-3 text-xs text-[var(--cs-text-secondary)]">
                {#if script.phase === 'domain-event'}
                  {script.eventTypes.length > 0 ? script.eventTypes.join(', ') : 'all events'}
                {:else}
                  {script.collections.length > 0 ? script.collections.join(', ') : 'all collections'}
                {/if}
              </td>
              <td class="px-4 py-3">
                <form method="POST" action={script.enabled ? '?/disable' : '?/enable'} use:enhance>
                  <input type="hidden" name="coopDid" value={data.coopDid} />
                  <input type="hidden" name="id" value={script.id} />
                  <button type="submit"
                    class="text-xs font-medium {script.enabled ? 'text-green-600' : 'text-[var(--cs-text-muted)]'} hover:underline">
                    {script.enabled ? 'On' : 'Off'}
                  </button>
                </form>
              </td>
              <td class="px-4 py-3 text-xs text-[var(--cs-text-muted)]">
                {formatDate(script.lastExecutedAt)}
              </td>
              <td class="px-4 py-3">
                {#if script.errorCount > 0}
                  <Badge variant="danger">{script.errorCount}</Badge>
                {:else}
                  <span class="text-xs text-[var(--cs-text-muted)]">0</span>
                {/if}
              </td>
              <td class="px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-2">
                  <form method="POST" action="?/test" use:enhance>
                    <input type="hidden" name="coopDid" value={data.coopDid} />
                    <input type="hidden" name="id" value={script.id} />
                    <button type="submit" title="Test script"
                      class="text-xs text-[var(--cs-primary)] hover:underline">
                      Test
                    </button>
                  </form>
                  <button type="button" onclick={() => loadLogs(script.id)}
                    class="text-xs text-[var(--cs-text-secondary)] hover:underline">
                    Logs
                  </button>
                  <button type="button" onclick={() => openEditModal(script)}
                    class="text-xs text-[var(--cs-primary)] hover:underline">
                    Edit
                  </button>
                  <button type="button" onclick={() => (confirmDeleteId = script.id)}
                    class="text-xs text-red-600 hover:underline">
                    Delete
                  </button>
                </div>
              </td>
            </tr>

            <!-- Inline test result -->
            {#if testedScriptId === script.id && testResult}
              <tr>
                <td colspan="7" class="px-4 py-3 bg-[var(--cs-bg-inset)]">
                  <div class="space-y-2">
                    <div class="flex items-center gap-2">
                      <Badge variant={testResult.success ? 'success' : 'danger'}>
                        {testResult.success ? 'Passed' : 'Failed'}
                      </Badge>
                      <span class="text-xs text-[var(--cs-text-muted)]">{testResult.durationMs}ms</span>
                    </div>
                    {#if testResult.error}
                      <div class="rounded bg-red-50 p-2 text-xs text-red-700 font-mono">{testResult.error}</div>
                    {/if}
                    {#if testResult.logs.length > 0}
                      <div class="rounded bg-[var(--cs-bg-card)] border border-[var(--cs-border)] p-2">
                        <div class="text-xs text-[var(--cs-text-muted)] mb-1">Output:</div>
                        {#each testResult.logs as log}
                          <div class="text-xs font-mono text-[var(--cs-text-secondary)]">{log}</div>
                        {/each}
                      </div>
                    {/if}
                    <button type="button" onclick={() => { testResult = null; testedScriptId = null; }}
                      class="text-xs text-[var(--cs-text-muted)] hover:underline">Dismiss</button>
                  </div>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <!-- Execution Logs Section -->
  {#if viewingLogsFor}
    {@const scriptName = data.scripts.find((s) => s.id === viewingLogsFor)?.name ?? 'Unknown'}
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-medium text-[var(--cs-text)]">Execution Logs: {scriptName}</h2>
        <button type="button" onclick={() => { viewingLogsFor = null; logs = []; }}
          class="text-xs text-[var(--cs-text-muted)] hover:underline">Close</button>
      </div>
      {#if logsLoading}
        <div class="text-sm text-[var(--cs-text-muted)]">Loading logs...</div>
      {:else if logs.length === 0}
        <EmptyState title="No execution logs" description="This script has not been executed yet." />
      {:else}
        <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-[var(--cs-border)] text-left">
                <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Timestamp</th>
                <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Trigger</th>
                <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Duration</th>
                <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Status</th>
                <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Error</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[var(--cs-border)]">
              {#each logs.slice(0, 20) as entry}
                <tr>
                  <td class="px-4 py-3 text-xs text-[var(--cs-text-muted)]">{formatDate(entry.createdAt)}</td>
                  <td class="px-4 py-3 text-xs text-[var(--cs-text-secondary)]">{entry.trigger}</td>
                  <td class="px-4 py-3 text-xs text-[var(--cs-text-muted)]">{entry.durationMs}ms</td>
                  <td class="px-4 py-3">
                    <Badge variant={statusVariant(entry.status)}>{entry.status}</Badge>
                  </td>
                  <td class="px-4 py-3 text-xs text-red-600 max-w-[250px] truncate" title={entry.error ?? ''}>
                    {entry.error ?? '--'}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  {/if}
</div>

<!-- Create/Edit Script Modal -->
<Modal open={createModalOpen} title={editingScript ? 'Edit Script' : 'New Script'} onclose={closeModal}>
  <form method="POST" action={editingScript ? '?/update' : '?/create'}
    use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }}
    class="space-y-4">
    <input type="hidden" name="coopDid" value={data.coopDid} />
    {#if editingScript}
      <input type="hidden" name="id" value={editingScript.id} />
    {/if}
    <div>
      <label for="script-name" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Name</label>
      <input id="script-name" name="name" type="text" required bind:value={formName}
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        placeholder="e.g. Validate membership records" />
    </div>
    <div>
      <label for="script-desc" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
        Description <span class="text-[var(--cs-text-muted)]">(optional)</span>
      </label>
      <input id="script-desc" name="description" type="text" bind:value={formDescription}
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        placeholder="Brief description of what this script does" />
    </div>
    <div>
      <label for="script-phase" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Phase</label>
      <select id="script-phase" name="phase" required bind:value={formPhase}
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]">
        <option value="pre-storage">Pre-storage</option>
        <option value="post-storage">Post-storage</option>
        <option value="domain-event">Domain event</option>
      </select>
    </div>
    {#if formPhase === 'pre-storage' || formPhase === 'post-storage'}
      <div>
        <label for="script-collections" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
          Collections <span class="text-[var(--cs-text-muted)]">(comma-separated, leave empty for all)</span>
        </label>
        <input id="script-collections" name="collections" type="text" bind:value={formCollections}
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
          placeholder="e.g. network.coopsource.org.membership, network.coopsource.governance.vote" />
      </div>
    {/if}
    {#if formPhase === 'domain-event'}
      <div>
        <label for="script-events" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
          Event Types <span class="text-[var(--cs-text-muted)]">(comma-separated, leave empty for all)</span>
        </label>
        <input id="script-events" name="eventTypes" type="text" bind:value={formEventTypes}
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
          placeholder="e.g. membership.activated, proposal.ratified" />
      </div>
    {/if}
    <div>
      <label for="script-source" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Source Code</label>
      <textarea id="script-source" name="sourceCode" rows={20} required bind:value={formSourceCode}
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 font-mono text-xs text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        placeholder="// Script source code here"></textarea>
    </div>
    <div>
      <label for="script-config" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
        Config (JSON) <span class="text-[var(--cs-text-muted)]">(optional)</span>
      </label>
      <textarea id="script-config" name="config" rows={5} bind:value={formConfig}
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 font-mono text-xs text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        placeholder='{"key": "value"}'></textarea>
    </div>
    <div>
      <label for="script-timeout" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
        Timeout (ms) <span class="text-[var(--cs-text-muted)]">(1000-30000)</span>
      </label>
      <input id="script-timeout" name="timeoutMs" type="number" min="1000" max="30000" step="1000" bind:value={formTimeout}
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
    </div>
    <div class="flex justify-end gap-3">
      <button type="button" onclick={closeModal}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]">Cancel</button>
      <button type="submit" disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50">
        {submitting ? 'Saving...' : (editingScript ? 'Update' : 'Create')}
      </button>
    </div>
  </form>
</Modal>

<!-- Confirm Delete -->
<ConfirmDialog
  open={confirmDeleteId !== null}
  title="Delete Script"
  message="Are you sure you want to delete this script? This action cannot be undone."
  confirmLabel="Delete"
  variant="danger"
  onconfirm={() => {
    const form = document.getElementById('delete-script-form') as HTMLFormElement | null;
    form?.requestSubmit();
  }}
  oncancel={() => (confirmDeleteId = null)}
/>

<form id="delete-script-form" method="POST" action="?/delete" use:enhance class="hidden">
  <input type="hidden" name="coopDid" value={data.coopDid} />
  <input type="hidden" name="id" value={confirmDeleteId ?? ''} />
</form>
