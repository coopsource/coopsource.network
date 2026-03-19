<script lang="ts">
  import { enhance } from '$app/forms';
  import { Badge, EmptyState, Modal } from '$lib/components/ui';
  import { workspacePrefix } from '$lib/utils/workspace.js';
  import type { TimeEntry } from '$lib/api/types.js';

  let { data, form } = $props();

  let showManualEntry = $state(false);
  let submitting = $state(false);
  let timerRunning = $state(false);
  let timerStart = $state<Date | null>(null);
  let timerDisplay = $state('00:00:00');
  let timerInterval = $state<ReturnType<typeof setInterval> | null>(null);
  let selectedEntries = $state<Set<string>>(new Set());

  $effect(() => {
    if (form?.success) {
      showManualEntry = false;
    }
  });

  const statusFilters = [
    { value: '', label: 'All' },
    { value: 'draft', label: 'Draft' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
  ];

  function formatDuration(minutes: number | null): string {
    if (minutes === null || minutes === 0) return '—';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  function formatHours(minutes: number): string {
    const h = (minutes / 60).toFixed(1);
    return `${h}h`;
  }

  function statusToVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
    switch (status) {
      case 'approved': return 'success';
      case 'submitted': return 'warning';
      case 'rejected': return 'danger';
      default: return 'default';
    }
  }

  function startTimer() {
    timerRunning = true;
    timerStart = new Date();
    timerInterval = setInterval(() => {
      if (timerStart) {
        const diff = Math.floor((Date.now() - timerStart.getTime()) / 1000);
        const h = String(Math.floor(diff / 3600)).padStart(2, '0');
        const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
        const s = String(diff % 60).padStart(2, '0');
        timerDisplay = `${h}:${m}:${s}`;
      }
    }, 1000);
  }

  function stopTimer() {
    timerRunning = false;
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    timerDisplay = '00:00:00';
    timerStart = null;
  }

  function toggleEntry(id: string) {
    const next = new Set(selectedEntries);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedEntries = next;
  }

  let draftEntries = $derived(data.entries.filter((e: TimeEntry) => e.status === 'draft'));
  let selectedDraftIds = $derived(
    Array.from(selectedEntries).filter((id) =>
      draftEntries.some((e: TimeEntry) => e.id === id),
    ),
  );
</script>

<svelte:head>
  <title>Time Tracking — Co-op Source</title>
</svelte:head>

<div class="space-y-4">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">Time Tracking</h1>
    <button
      type="button"
      onclick={() => (showManualEntry = true)}
      class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]"
    >Log Time</button>
  </div>

  {#if form?.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}

  <!-- Timer + Summary Row -->
  <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
    <!-- Timer -->
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4 text-center">
      <p class="text-xs font-medium uppercase tracking-wide text-[var(--cs-text-muted)]">Timer</p>
      <p class="mt-2 text-3xl font-mono font-semibold text-[var(--cs-text)]">{timerDisplay}</p>
      <div class="mt-3">
        {#if timerRunning}
          <button
            type="button"
            onclick={stopTimer}
            class="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >Stop</button>
        {:else}
          <button
            type="button"
            onclick={startTimer}
            class="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >Start</button>
        {/if}
      </div>
    </div>

    <!-- Week Summary -->
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4 text-center">
      <p class="text-xs font-medium uppercase tracking-wide text-[var(--cs-text-muted)]">This Week</p>
      <p class="mt-2 text-3xl font-semibold text-[var(--cs-text)]">{formatHours(data.weekSummary.totalMinutes)}</p>
      <p class="mt-1 text-xs text-[var(--cs-text-muted)]">{data.weekSummary.entryCount} entries</p>
    </div>

    <!-- Month Summary -->
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4 text-center">
      <p class="text-xs font-medium uppercase tracking-wide text-[var(--cs-text-muted)]">This Month</p>
      <p class="mt-2 text-3xl font-semibold text-[var(--cs-text)]">{formatHours(data.monthSummary.totalMinutes)}</p>
      <p class="mt-1 text-xs text-[var(--cs-text-muted)]">{data.monthSummary.entryCount} entries</p>
    </div>
  </div>

  <!-- Filter + Batch Actions -->
  <div class="flex items-center justify-between">
    <div class="flex gap-1">
      {#each statusFilters as filter}
        <a
          href={filter.value
            ? `${$workspacePrefix}/time?status=${filter.value}`
            : `${$workspacePrefix}/time`}
          class="px-3 py-1.5 text-xs font-medium rounded-full transition-colors
            {data.filterStatus === filter.value
              ? 'bg-[var(--cs-primary)] text-[var(--cs-text-on-primary)]'
              : 'bg-[var(--cs-bg-inset)] text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)]'}"
        >{filter.label}</a>
      {/each}
    </div>
    {#if selectedDraftIds.length > 0}
      <form method="POST" action="?/submitEntries" use:enhance>
        <input type="hidden" name="entryIds" value={selectedDraftIds.join(',')} />
        <button type="submit"
          class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]"
        >Submit {selectedDraftIds.length} {selectedDraftIds.length === 1 ? 'Entry' : 'Entries'}</button>
      </form>
    {/if}
  </div>

  <!-- Time Entries Table -->
  {#if data.entries.length === 0}
    <EmptyState title="No time entries" description="Log your first time entry or start the timer." />
  {:else}
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-[var(--cs-border)] text-left">
            <th class="px-4 py-3 w-8"></th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Date</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Description</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Duration</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Status</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--cs-border)]">
          {#each data.entries as entry (entry.id)}
            <tr class="hover:bg-[var(--cs-bg-inset)] transition-colors">
              <td class="px-4 py-3">
                {#if entry.status === 'draft'}
                  <input
                    type="checkbox"
                    checked={selectedEntries.has(entry.id)}
                    onchange={() => toggleEntry(entry.id)}
                    class="rounded border-[var(--cs-input-border)]"
                  />
                {/if}
              </td>
              <td class="px-4 py-3 text-[var(--cs-text)]">
                {new Date(entry.startedAt).toLocaleDateString()}
              </td>
              <td class="px-4 py-3 text-[var(--cs-text)]">
                {entry.description ?? '—'}
              </td>
              <td class="px-4 py-3 font-mono text-[var(--cs-text)]">
                {formatDuration(entry.durationMinutes)}
              </td>
              <td class="px-4 py-3">
                <Badge variant={statusToVariant(entry.status)}>{entry.status}</Badge>
              </td>
              <td class="px-4 py-3 text-right">
                {#if entry.status === 'draft'}
                  <form method="POST" action="?/deleteEntry" use:enhance class="inline">
                    <input type="hidden" name="id" value={entry.id} />
                    <button type="submit" class="text-xs text-red-600 hover:underline">Delete</button>
                  </form>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<!-- Manual Entry Modal -->
<Modal open={showManualEntry} title="Log Time Entry" onclose={() => (showManualEntry = false)}>
  <form
    method="POST"
    action="?/createEntry"
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
      <label for="entry-desc" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Description</label>
      <input
        id="entry-desc"
        name="description"
        type="text"
        placeholder="What were you working on?"
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      />
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="entry-start" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Start Time</label>
        <input
          id="entry-start"
          name="startedAt"
          type="datetime-local"
          required
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        />
      </div>
      <div>
        <label for="entry-end" class="block text-sm font-medium text-[var(--cs-text-secondary)]">End Time</label>
        <input
          id="entry-end"
          name="endedAt"
          type="datetime-local"
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        />
      </div>
    </div>

    <div>
      <label for="entry-duration" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Duration (minutes)</label>
      <input
        id="entry-duration"
        name="durationMinutes"
        type="number"
        min="1"
        placeholder="Or enter duration directly"
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      />
      <p class="mt-1 text-xs text-[var(--cs-text-muted)]">If both end time and duration are provided, duration takes priority.</p>
    </div>

    <div class="flex justify-end gap-3">
      <button
        type="button"
        onclick={() => (showManualEntry = false)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
      >Cancel</button>
      <button
        type="submit"
        disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50"
      >{submitting ? 'Saving...' : 'Save Entry'}</button>
    </div>
  </form>
</Modal>
