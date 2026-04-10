<script lang="ts">
  import { enhance } from '$app/forms';
  import { Badge, EmptyState, Modal, MemberSelect } from '$lib/components/ui';
  import { canEditOfficer } from '$lib/utils/entity-permissions.js';
  import type { Officer, Member } from '$lib/api/types.js';

  let {
    officers,
    officersCursor,
    members,
    form,
  }: {
    officers: Officer[];
    officersCursor: string | null;
    members: Member[];
    form: { success?: boolean; tab?: string; error?: string } | null;
  } = $props();

  let officerModalOpen = $state(false);
  let editingOfficer = $state<Officer | null>(null);
  let confirmEndTermId = $state<string | null>(null);
  let selectedOfficerDid = $state('');
  let submitting = $state(false);

  $effect(() => {
    if (form?.success && form.tab === 'officers') {
      officerModalOpen = false;
      editingOfficer = null;
      confirmEndTermId = null;
    }
  });

  function statusToVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
    switch (status) {
      case 'active': case 'completed': case 'closed': return 'success';
      case 'pending': case 'open': return 'warning';
      case 'overdue': return 'danger';
      default: return 'default';
    }
  }
</script>

<div class="mb-4 flex justify-end">
  <button type="button" onclick={() => (officerModalOpen = true)}
    class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]">
    Appoint officer
  </button>
</div>

{#if officers.length === 0}
  <EmptyState title="No officers" description="Appoint your first officer to get started." />
{:else}
  <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-[var(--cs-border)] text-left">
          <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Title</th>
          <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Officer</th>
          <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Type</th>
          <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Appointed</th>
          <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Status</th>
          <th class="px-4 py-3"></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-[var(--cs-border)]">
        {#each officers as officer}
          {@const member = members.find((m) => m.did === officer.officerDid)}
          <tr>
            <td class="px-4 py-3 font-medium text-[var(--cs-text)]">{officer.title}</td>
            <td class="px-4 py-3 text-[var(--cs-text-secondary)]">
              {member?.displayName ?? officer.officerDid}
            </td>
            <td class="px-4 py-3">
              <span class="rounded bg-[var(--cs-bg-inset)] px-1.5 py-0.5 text-xs text-[var(--cs-text-secondary)]">
                {officer.appointmentType}
              </span>
            </td>
            <td class="px-4 py-3 text-[var(--cs-text-muted)]">
              {new Date(officer.appointedAt).toLocaleDateString()}
            </td>
            <td class="px-4 py-3">
              <Badge variant={statusToVariant(officer.status)}>{officer.status}</Badge>
            </td>
            <td class="px-4 py-3 text-right">
              {#if canEditOfficer(officer)}
                <button type="button" onclick={() => { editingOfficer = officer; }}
                  class="text-xs text-[var(--cs-primary)] hover:underline mr-2">Edit</button>
              {/if}
              {#if officer.status === 'active'}
                <button type="button" onclick={() => (confirmEndTermId = officer.id)}
                  class="text-xs text-red-600 hover:underline">End term</button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if officersCursor}
    <div class="flex justify-center pt-2">
      <a href="?officersCursor={officersCursor}" class="text-sm text-[var(--cs-primary)] hover:underline">Load more</a>
    </div>
  {/if}
{/if}

<!-- Appoint / Edit Officer Modal -->
<Modal open={officerModalOpen || editingOfficer !== null} title={editingOfficer ? 'Edit Officer' : 'Appoint Officer'} onclose={() => { officerModalOpen = false; editingOfficer = null; }}>
  {#key editingOfficer?.id ?? 'create'}
  <form method="POST" action={editingOfficer ? '?/updateOfficer' : '?/appointOfficer'}
    use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }}
    class="space-y-4">
    {#if editingOfficer}
      <input type="hidden" name="id" value={editingOfficer.id} />
      <div>
        <label for="officerTitle" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Title</label>
        <select id="officerTitle" name="title" required
          value={editingOfficer.title}
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]">
          <option value="president">President</option>
          <option value="secretary">Secretary</option>
          <option value="treasurer">Treasurer</option>
          <option value="director">Director</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div>
        <label for="termEndsAt" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
          Term Ends <span class="text-[var(--cs-text-muted)]">(optional)</span>
        </label>
        <input id="termEndsAt" name="termEndsAt" type="date"
          value={editingOfficer.termEndsAt?.slice(0, 10) ?? ''}
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
      </div>
      <div>
        <label for="responsibilities" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
          Responsibilities <span class="text-[var(--cs-text-muted)]">(optional)</span>
        </label>
        <textarea id="responsibilities" name="responsibilities" rows={2}
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
          placeholder="Key responsibilities...">{editingOfficer.responsibilities ?? ''}</textarea>
      </div>
    {:else}
      <MemberSelect {members} bind:value={selectedOfficerDid} name="officerDid" label="Member" required />
      <div>
        <label for="officerTitle" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Title</label>
        <select id="officerTitle" name="title" required
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]">
          <option value="">Select title...</option>
          <option value="president">President</option>
          <option value="secretary">Secretary</option>
          <option value="treasurer">Treasurer</option>
          <option value="director">Director</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div>
        <label for="appointmentType" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Appointment Type</label>
        <select id="appointmentType" name="appointmentType" required
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]">
          <option value="">Select type...</option>
          <option value="elected">Elected</option>
          <option value="appointed">Appointed</option>
        </select>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label for="appointedAt" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Appointed Date</label>
          <input id="appointedAt" name="appointedAt" type="date" required
            class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
        </div>
        <div>
          <label for="termEndsAt" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
            Term Ends <span class="text-[var(--cs-text-muted)]">(optional)</span>
          </label>
          <input id="termEndsAt" name="termEndsAt" type="date"
            class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
        </div>
      </div>
      <div>
        <label for="responsibilities" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
          Responsibilities <span class="text-[var(--cs-text-muted)]">(optional)</span>
        </label>
        <textarea id="responsibilities" name="responsibilities" rows={2}
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
          placeholder="Key responsibilities..."></textarea>
      </div>
    {/if}
    <div class="flex justify-end gap-3">
      <button type="button" onclick={() => { officerModalOpen = false; editingOfficer = null; }}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]">Cancel</button>
      <button type="submit" disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50">
        {submitting ? 'Saving...' : editingOfficer ? 'Save changes' : 'Appoint'}
      </button>
    </div>
  </form>
  {/key}
</Modal>

<!-- End Term Confirmation -->
<Modal open={confirmEndTermId !== null} title="End Officer Term" onclose={() => (confirmEndTermId = null)}>
  <p class="mb-4 text-sm text-[var(--cs-text-secondary)]">Are you sure you want to end this officer's term?</p>
  <form method="POST" action="?/endTerm" use:enhance>
    <input type="hidden" name="id" value={confirmEndTermId ?? ''} />
    <div class="flex justify-end gap-3">
      <button type="button" onclick={() => (confirmEndTermId = null)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]">Cancel</button>
      <button type="submit"
        class="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700">End term</button>
    </div>
  </form>
</Modal>
