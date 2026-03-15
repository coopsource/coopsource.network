<script lang="ts">
  import { enhance } from '$app/forms';
  import { Badge, EmptyState, Modal } from '$lib/components/ui';
  import { workspacePrefix } from '$lib/utils/workspace.js';

  let { data, form } = $props();

  let createOpen = $state(false);
  let submitting = $state(false);

  $effect(() => {
    if (form?.success) {
      createOpen = false;
    }
  });

  const typeFilters = [
    { value: '', label: 'All' },
    { value: 'board', label: 'Board' },
    { value: 'general', label: 'General' },
    { value: 'special', label: 'Special' },
    { value: 'committee', label: 'Committee' },
  ];

  function typeToVariant(type: string): 'primary' | 'success' | 'warning' | 'default' {
    switch (type) {
      case 'board': return 'primary';
      case 'general': return 'success';
      case 'special': return 'warning';
      default: return 'default';
    }
  }
</script>

<svelte:head>
  <title>Meeting Records — Co-op Source</title>
</svelte:head>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <a href="{$workspacePrefix}/legal" class="text-sm text-[var(--cs-text-muted)] hover:text-[var(--cs-text-secondary)]">← Legal</a>
      <h1 class="text-xl font-semibold text-[var(--cs-text)]">Meeting Records</h1>
    </div>
    <button
      type="button"
      onclick={() => (createOpen = true)}
      class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]"
    >
      New meeting
    </button>
  </div>

  {#if form?.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}
  {#if form?.certifySuccess}
    <div class="rounded-md bg-green-50 p-3 text-sm text-green-700">Meeting minutes certified.</div>
  {/if}

  <!-- Type filter tabs -->
  <div class="flex gap-1 border-b border-[var(--cs-border)]">
    {#each typeFilters as filter}
      <a
        href={filter.value ? `?meetingType=${filter.value}` : `${$workspacePrefix}/legal/meetings`}
        class="px-3 py-2 text-sm font-medium transition-colors
          {data.filterType === filter.value
            ? 'border-b-2 border-[var(--cs-primary)] text-[var(--cs-primary)]'
            : 'text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)]'}"
      >
        {filter.label}
      </a>
    {/each}
  </div>

  {#if data.meetings.length === 0}
    <EmptyState
      title="No meeting records"
      description="Record your first meeting — board, general, special, or committee."
    />
  {:else}
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-[var(--cs-border)] text-left">
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Title</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Type</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Date</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Quorum</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Certified</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--cs-border)]">
          {#each data.meetings as meeting}
            <tr>
              <td class="px-4 py-3 font-medium text-[var(--cs-text)]">{meeting.title}</td>
              <td class="px-4 py-3">
                <Badge variant={typeToVariant(meeting.meetingType)}>{meeting.meetingType}</Badge>
              </td>
              <td class="px-4 py-3 text-[var(--cs-text-muted)]">
                {new Date(meeting.meetingDate).toLocaleDateString()}
              </td>
              <td class="px-4 py-3">
                {#if meeting.quorumMet}
                  <span class="text-green-600">Yes</span>
                {:else}
                  <span class="text-red-600">No</span>
                {/if}
              </td>
              <td class="px-4 py-3">
                {#if meeting.certifiedBy}
                  <Badge variant="success">Certified</Badge>
                {:else}
                  <span class="text-[var(--cs-text-muted)]">—</span>
                {/if}
              </td>
              <td class="px-4 py-3 text-right">
                {#if !meeting.certifiedBy}
                  <form method="POST" action="?/certify" use:enhance class="inline">
                    <input type="hidden" name="id" value={meeting.id} />
                    <button
                      type="submit"
                      class="text-xs text-[var(--cs-primary)] hover:underline"
                    >
                      Certify
                    </button>
                  </form>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  {#if data.cursor}
    <div class="flex justify-center pt-2">
      <a
        href="?cursor={data.cursor}{data.filterType ? `&meetingType=${data.filterType}` : ''}"
        class="text-sm text-[var(--cs-primary)] hover:underline"
      >
        Load more
      </a>
    </div>
  {/if}
</div>

<!-- Create Meeting Modal -->
<Modal open={createOpen} title="New Meeting Record" size="lg" onclose={() => (createOpen = false)}>
  <form
    method="POST"
    action="?/create"
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
      <label for="meetingTitle" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Title</label>
      <input
        id="meetingTitle"
        name="title"
        type="text"
        required
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        placeholder="e.g. Q1 Board Meeting"
      />
    </div>
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="meetingDate" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Date</label>
        <input
          id="meetingDate"
          name="meetingDate"
          type="date"
          required
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        />
      </div>
      <div>
        <label for="meetingType" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Type</label>
        <select
          id="meetingType"
          name="meetingType"
          required
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        >
          <option value="">Select type…</option>
          <option value="board">Board</option>
          <option value="general">General</option>
          <option value="special">Special</option>
          <option value="committee">Committee</option>
        </select>
      </div>
    </div>
    <div>
      <label for="attendees" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
        Attendees <span class="text-[var(--cs-text-muted)]">(comma-separated DIDs)</span>
      </label>
      <input
        id="attendees"
        name="attendees"
        type="text"
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        placeholder="did:plc:..., did:plc:..."
      />
    </div>
    <div class="flex items-center gap-2">
      <input id="quorumMet" name="quorumMet" type="checkbox" class="rounded border-[var(--cs-input-border)]" />
      <label for="quorumMet" class="text-sm text-[var(--cs-text-secondary)]">Quorum was met</label>
    </div>
    <div>
      <label for="resolutions" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Resolutions</label>
      <textarea
        id="resolutions"
        name="resolutions"
        rows={3}
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        placeholder="Resolutions passed…"
      ></textarea>
    </div>
    <div>
      <label for="minutes" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Minutes</label>
      <textarea
        id="minutes"
        name="minutes"
        rows={6}
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        placeholder="Meeting minutes…"
      ></textarea>
    </div>
    <div class="flex justify-end gap-3">
      <button
        type="button"
        onclick={() => (createOpen = false)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50"
      >
        {submitting ? 'Creating…' : 'Create record'}
      </button>
    </div>
  </form>
</Modal>
