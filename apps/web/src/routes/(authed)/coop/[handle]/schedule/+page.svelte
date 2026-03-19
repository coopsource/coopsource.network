<script lang="ts">
  import { enhance } from '$app/forms';
  import { Badge, EmptyState, Modal } from '$lib/components/ui';
  import type { ScheduleShift } from '$lib/api/types.js';

  let { data, form } = $props();

  let showCreateForm = $state(false);
  let submitting = $state(false);

  $effect(() => {
    if (form?.success) {
      showCreateForm = false;
    }
  });

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function getWeekDays(): Array<{ dayName: string; date: Date; dateStr: string }> {
    const start = new Date(data.weekStart);
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      return {
        dayName: dayNames[date.getDay()]!,
        date,
        dateStr: date.toISOString().split('T')[0]!,
      };
    });
  }

  function shiftsForDay(dateStr: string): ScheduleShift[] {
    return data.shifts.filter((s: ScheduleShift) => {
      const shiftDate = new Date(s.startsAt).toISOString().split('T')[0];
      return shiftDate === dateStr;
    });
  }

  function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function statusToVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
    switch (status) {
      case 'completed': return 'success';
      case 'assigned': case 'claimed': return 'warning';
      case 'cancelled': return 'danger';
      default: return 'default';
    }
  }

  function isOpen(shift: ScheduleShift): boolean {
    return shift.status === 'open' && !shift.assignedDid;
  }

  let weekDays = $derived(getWeekDays());
</script>

<svelte:head>
  <title>Schedule — Co-op Source</title>
</svelte:head>

<div class="space-y-4">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">Schedule</h1>
    <button
      type="button"
      onclick={() => (showCreateForm = true)}
      class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]"
    >New Shift</button>
  </div>

  {#if form?.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}

  <!-- Weekly Calendar Grid -->
  <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] overflow-hidden">
    <div class="grid grid-cols-7 divide-x divide-[var(--cs-border)]">
      {#each weekDays as day}
        <div class="min-h-[200px]">
          <!-- Day Header -->
          <div class="border-b border-[var(--cs-border)] bg-[var(--cs-bg-inset)] px-2 py-2 text-center">
            <p class="text-xs font-medium text-[var(--cs-text-muted)]">{day.dayName}</p>
            <p class="text-sm font-semibold text-[var(--cs-text)]">{day.date.getDate()}</p>
          </div>
          <!-- Shifts -->
          <div class="p-1.5 space-y-1.5">
            {#each shiftsForDay(day.dateStr) as shift (shift.id)}
              <div class="rounded-md border border-[var(--cs-border)] bg-white p-2 text-xs hover:shadow-sm transition-shadow">
                <div class="flex items-start justify-between gap-1">
                  <p class="font-medium text-[var(--cs-text)] leading-tight">{shift.title}</p>
                </div>
                <p class="mt-0.5 text-[var(--cs-text-muted)]">
                  {formatTime(shift.startsAt)} – {formatTime(shift.endsAt)}
                </p>
                {#if shift.location}
                  <p class="mt-0.5 text-[var(--cs-text-muted)]">{shift.location}</p>
                {/if}
                <div class="mt-1 flex items-center justify-between">
                  <Badge variant={statusToVariant(shift.status)}>{shift.status}</Badge>
                  {#if isOpen(shift)}
                    <form method="POST" action="?/claimShift" use:enhance class="inline">
                      <input type="hidden" name="id" value={shift.id} />
                      <button type="submit" class="text-[10px] font-medium text-[var(--cs-primary)] hover:underline">Claim</button>
                    </form>
                  {/if}
                </div>
                {#if shift.assignedDid}
                  <p class="mt-1 text-[10px] text-[var(--cs-text-muted)] truncate">Assigned: {shift.assignedDid.slice(0, 20)}...</p>
                {/if}
              </div>
            {/each}
            {#if shiftsForDay(day.dateStr).length === 0}
              <p class="py-4 text-center text-[10px] text-[var(--cs-text-muted)]">No shifts</p>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>

  <!-- Fairness Summary -->
  {#if data.fairness.length > 0}
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4">
      <h2 class="text-sm font-semibold text-[var(--cs-text)] mb-3">Shift Distribution</h2>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {#each data.fairness as item}
          <div class="flex items-center justify-between rounded-md bg-[var(--cs-bg-inset)] px-3 py-2">
            <span class="text-xs text-[var(--cs-text)] truncate" title={item.memberDid}>{item.memberDid.slice(0, 16)}...</span>
            <span class="ml-2 rounded-full bg-[var(--cs-primary)] px-2 py-0.5 text-[10px] font-medium text-[var(--cs-text-on-primary)]">{item.shiftCount}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if data.shifts.length === 0 && data.fairness.length === 0}
    <EmptyState title="No shifts scheduled" description="Create your first shift to start scheduling." />
  {/if}
</div>

<!-- Create Shift Modal -->
<Modal open={showCreateForm} title="New Shift" onclose={() => (showCreateForm = false)}>
  <form
    method="POST"
    action="?/createShift"
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
      <label for="shift-title" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Title</label>
      <input
        id="shift-title"
        name="title"
        type="text"
        required
        placeholder="Shift title..."
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      />
    </div>

    <div>
      <label for="shift-desc" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Description</label>
      <textarea
        id="shift-desc"
        name="description"
        rows="2"
        placeholder="Optional description..."
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      ></textarea>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="shift-start" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Start Time</label>
        <input
          id="shift-start"
          name="startsAt"
          type="datetime-local"
          required
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        />
      </div>
      <div>
        <label for="shift-end" class="block text-sm font-medium text-[var(--cs-text-secondary)]">End Time</label>
        <input
          id="shift-end"
          name="endsAt"
          type="datetime-local"
          required
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        />
      </div>
    </div>

    <div>
      <label for="shift-location" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Location</label>
      <input
        id="shift-location"
        name="location"
        type="text"
        placeholder="Optional location..."
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      />
    </div>

    <div class="flex justify-end gap-3">
      <button
        type="button"
        onclick={() => (showCreateForm = false)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
      >Cancel</button>
      <button
        type="submit"
        disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50"
      >{submitting ? 'Creating...' : 'Create Shift'}</button>
    </div>
  </form>
</Modal>
