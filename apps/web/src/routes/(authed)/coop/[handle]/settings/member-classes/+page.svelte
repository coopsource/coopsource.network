<script lang="ts">
  import { enhance } from '$app/forms';
  import { EmptyState, Modal } from '$lib/components/ui';
  import { workspacePrefix } from '$lib/utils/workspace.js';

  let { data, form } = $props();

  let createOpen = $state(false);
  let assignOpen = $state(false);
  let submitting = $state(false);

  $effect(() => {
    if (form?.success || form?.assignSuccess) {
      createOpen = false;
      assignOpen = false;
    }
  });
</script>

<svelte:head>
  <title>Member Classes — Co-op Source</title>
</svelte:head>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <a href="{$workspacePrefix}/settings" class="text-sm text-[var(--cs-text-muted)] hover:text-[var(--cs-text-secondary)]">← Settings</a>
      <h1 class="text-xl font-semibold text-[var(--cs-text)]">Member Classes</h1>
    </div>
    <div class="flex gap-2">
      <button type="button" onclick={() => (assignOpen = true)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]">
        Assign member
      </button>
      <button type="button" onclick={() => (createOpen = true)}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]">
        New class
      </button>
    </div>
  </div>

  {#if form?.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}
  {#if form?.success || form?.assignSuccess}
    <div class="rounded-md bg-green-50 p-3 text-sm text-green-700">Updated successfully.</div>
  {/if}

  {#if data.classes.length === 0}
    <EmptyState title="No member classes" description="Create member classes to define different levels of participation and voting weight." />
  {:else}
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-[var(--cs-border)] text-left">
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Name</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Description</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)] text-center">Vote Weight</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)] text-center">Quorum Weight</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)] text-center">Board Seats</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--cs-border)]">
          {#each data.classes as cls}
            <tr>
              <td class="px-4 py-3 font-medium text-[var(--cs-text)]">{cls.name}</td>
              <td class="px-4 py-3 text-[var(--cs-text-secondary)]">{cls.description ?? '—'}</td>
              <td class="px-4 py-3 text-center text-[var(--cs-text)]">{cls.voteWeight}</td>
              <td class="px-4 py-3 text-center text-[var(--cs-text)]">{cls.quorumWeight}</td>
              <td class="px-4 py-3 text-center text-[var(--cs-text)]">{cls.boardSeats}</td>
              <td class="px-4 py-3 text-right">
                <form method="POST" action="?/delete" use:enhance class="inline">
                  <input type="hidden" name="id" value={cls.id} />
                  <button type="submit" class="text-xs text-red-600 hover:underline">Delete</button>
                </form>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<!-- Create Class Modal -->
<Modal open={createOpen} title="New Member Class" onclose={() => (createOpen = false)}>
  <form method="POST" action="?/create"
    use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }}
    class="space-y-4">
    <div>
      <label for="className" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Name</label>
      <input id="className" name="name" type="text" required
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        placeholder="e.g. Worker, Consumer, Producer" />
    </div>
    <div>
      <label for="classDesc" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
        Description <span class="text-[var(--cs-text-muted)]">(optional)</span>
      </label>
      <input id="classDesc" name="description" type="text"
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
    </div>
    <div class="grid grid-cols-3 gap-4">
      <div>
        <label for="voteWeight" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Vote Weight</label>
        <input id="voteWeight" name="voteWeight" type="number" min="0" step="0.1" value="1"
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
      </div>
      <div>
        <label for="quorumWeight" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Quorum Weight</label>
        <input id="quorumWeight" name="quorumWeight" type="number" min="0" step="0.1" value="1"
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
      </div>
      <div>
        <label for="boardSeats" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Board Seats</label>
        <input id="boardSeats" name="boardSeats" type="number" min="0" value="0"
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
      </div>
    </div>
    <div class="flex justify-end gap-3">
      <button type="button" onclick={() => (createOpen = false)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]">Cancel</button>
      <button type="submit" disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50">
        {submitting ? 'Creating…' : 'Create'}
      </button>
    </div>
  </form>
</Modal>

<!-- Assign Member Class Modal -->
<Modal open={assignOpen} title="Assign Member Class" onclose={() => (assignOpen = false)}>
  <form method="POST" action="?/assign"
    use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }}
    class="space-y-4">
    <div>
      <label for="assignMember" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Member</label>
      <select id="assignMember" name="memberDid" required
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]">
        <option value="">Select member…</option>
        {#each data.members as member}
          <option value={member.did}>{member.displayName}{member.handle ? ` (@${member.handle})` : ''}</option>
        {/each}
      </select>
    </div>
    <div>
      <label for="assignClass" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Class</label>
      <select id="assignClass" name="className" required
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]">
        <option value="">Select class…</option>
        {#each data.classes as cls}
          <option value={cls.name}>{cls.name}</option>
        {/each}
      </select>
    </div>
    <div class="flex justify-end gap-3">
      <button type="button" onclick={() => (assignOpen = false)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]">Cancel</button>
      <button type="submit" disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50">
        {submitting ? 'Assigning…' : 'Assign'}
      </button>
    </div>
  </form>
</Modal>
