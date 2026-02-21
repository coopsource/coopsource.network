<script lang="ts">
  import { enhance } from '$app/forms';
  import { Badge, EmptyState, Modal } from '$lib/components/ui';

  let { data, form } = $props();

  let inviteOpen = $state(false);
  let submitting = $state(false);
  let confirmRemoveDid = $state<string | null>(null);

  $effect(() => {
    if (form?.inviteSuccess) {
      inviteOpen = false;
    }
  });

  function statusToVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
    switch (status) {
      case 'active': case 'accepted': case 'resolved': case 'signed': return 'success';
      case 'pending': case 'open': case 'closed': return 'warning';
      case 'revoked': case 'void': case 'voided': return 'danger';
      default: return 'default';
    }
  }
</script>

<svelte:head>
  <title>Members — Co-op Source</title>
</svelte:head>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">Members</h1>
    <button
      type="button"
      onclick={() => (inviteOpen = true)}
      class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
    >
      Invite member
    </button>
  </div>

  {#if form?.removeError}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.removeError}</div>
  {/if}

  {#if data.members.length === 0}
    <EmptyState title="No members yet" description="Invite someone to join your cooperative." />
  {:else}
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-[var(--cs-border)] text-left">
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Name</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Roles</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Status</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Joined</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--cs-border)]">
          {#each data.members as member}
            <tr>
              <td class="px-4 py-3">
                <div class="font-medium text-[var(--cs-text)]">{member.displayName}</div>
                {#if member.handle}
                  <div class="text-xs text-[var(--cs-text-muted)]">@{member.handle}</div>
                {/if}
                {#if member.email}
                  <div class="text-xs text-[var(--cs-text-muted)]">{member.email}</div>
                {/if}
              </td>
              <td class="px-4 py-3">
                {#if member.roles.length > 0}
                  <div class="flex flex-wrap gap-1">
                    {#each member.roles as role}
                      <span class="rounded bg-[var(--cs-bg-inset)] px-1.5 py-0.5 text-xs text-[var(--cs-text-secondary)]"
                        >{role}</span
                      >
                    {/each}
                  </div>
                {:else}
                  <span class="text-[var(--cs-text-muted)]">—</span>
                {/if}
              </td>
              <td class="px-4 py-3">
                <Badge variant={statusToVariant(member.status)}>{member.status}</Badge>
              </td>
              <td class="px-4 py-3 text-[var(--cs-text-muted)]">
                {new Date(member.joinedAt).toLocaleDateString()}
              </td>
              <td class="px-4 py-3 text-right">
                <button
                  type="button"
                  onclick={() => (confirmRemoveDid = member.did)}
                  class="text-xs text-red-600 hover:underline"
                >
                  Remove
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<!-- Invite Modal -->
<Modal open={inviteOpen} title="Invite Member" onclose={() => (inviteOpen = false)}>
  {#if form?.inviteError}
    <div class="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{form.inviteError}</div>
  {/if}
  <form
    method="POST"
    action="?/invite"
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
      <label for="inviteEmail" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Email</label>
      <input
        id="inviteEmail"
        name="email"
        type="email"
        required
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        placeholder="member@example.com"
      />
    </div>
    <div>
      <label for="inviteRoles" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
        Roles <span class="text-[var(--cs-text-muted)]">(comma-separated)</span>
      </label>
      <input
        id="inviteRoles"
        name="roles"
        type="text"
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        placeholder="member, admin"
      />
    </div>
    <div>
      <label for="inviteMessage" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
        Message <span class="text-[var(--cs-text-muted)]">(optional)</span>
      </label>
      <textarea
        id="inviteMessage"
        name="message"
        rows={2}
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        placeholder="Welcome to our co-op!"
      ></textarea>
    </div>
    <div class="flex justify-end gap-3">
      <button
        type="button"
        onclick={() => (inviteOpen = false)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={submitting}
        class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting ? 'Sending…' : 'Send invitation'}
      </button>
    </div>
  </form>
</Modal>

<!-- Confirm Remove Modal -->
<Modal
  open={confirmRemoveDid !== null}
  title="Remove Member"
  onclose={() => (confirmRemoveDid = null)}
>
  <p class="mb-4 text-sm text-[var(--cs-text-secondary)]">
    Are you sure you want to remove this member from the cooperative?
  </p>
  <form method="POST" action="?/remove" use:enhance>
    <input type="hidden" name="did" value={confirmRemoveDid ?? ''} />
    <div class="flex justify-end gap-3">
      <button
        type="button"
        onclick={() => (confirmRemoveDid = null)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
      >
        Cancel
      </button>
      <button
        type="submit"
        class="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
      >
        Remove
      </button>
    </div>
  </form>
</Modal>
