<script lang="ts">
  import { enhance } from '$app/forms';
  import Badge from '$lib/components/Badge.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Modal from '$lib/components/Modal.svelte';

  let { data, form } = $props();

  let inviteOpen = $state(false);
  let submitting = $state(false);
  let confirmRemoveDid = $state<string | null>(null);

  $effect(() => {
    if (form?.inviteSuccess) {
      inviteOpen = false;
    }
  });
</script>

<svelte:head>
  <title>Members — Co-op Source</title>
</svelte:head>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-semibold text-gray-900">Members</h1>
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
    <div class="rounded-lg border border-gray-200 bg-white">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-200 text-left">
            <th class="px-4 py-3 font-medium text-gray-600">Name</th>
            <th class="px-4 py-3 font-medium text-gray-600">Roles</th>
            <th class="px-4 py-3 font-medium text-gray-600">Status</th>
            <th class="px-4 py-3 font-medium text-gray-600">Joined</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          {#each data.members as member}
            <tr>
              <td class="px-4 py-3">
                <div class="font-medium text-gray-900">{member.displayName}</div>
                {#if member.handle}
                  <div class="text-xs text-gray-500">@{member.handle}</div>
                {/if}
                {#if member.email}
                  <div class="text-xs text-gray-400">{member.email}</div>
                {/if}
              </td>
              <td class="px-4 py-3">
                {#if member.roles.length > 0}
                  <div class="flex flex-wrap gap-1">
                    {#each member.roles as role}
                      <span class="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700"
                        >{role}</span
                      >
                    {/each}
                  </div>
                {:else}
                  <span class="text-gray-400">—</span>
                {/if}
              </td>
              <td class="px-4 py-3">
                <Badge status={member.status} />
              </td>
              <td class="px-4 py-3 text-gray-500">
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
<Modal open={inviteOpen} title="Invite Member" onClose={() => (inviteOpen = false)}>
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
      <label for="inviteEmail" class="block text-sm font-medium text-gray-700">Email</label>
      <input
        id="inviteEmail"
        name="email"
        type="email"
        required
        class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        placeholder="member@example.com"
      />
    </div>
    <div>
      <label for="inviteRoles" class="block text-sm font-medium text-gray-700">
        Roles <span class="text-gray-400">(comma-separated)</span>
      </label>
      <input
        id="inviteRoles"
        name="roles"
        type="text"
        class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        placeholder="member, admin"
      />
    </div>
    <div>
      <label for="inviteMessage" class="block text-sm font-medium text-gray-700">
        Message <span class="text-gray-400">(optional)</span>
      </label>
      <textarea
        id="inviteMessage"
        name="message"
        rows={2}
        class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        placeholder="Welcome to our co-op!"
      ></textarea>
    </div>
    <div class="flex justify-end gap-3">
      <button
        type="button"
        onclick={() => (inviteOpen = false)}
        class="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
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
  onClose={() => (confirmRemoveDid = null)}
>
  <p class="mb-4 text-sm text-gray-600">
    Are you sure you want to remove this member from the cooperative?
  </p>
  <form method="POST" action="?/remove" use:enhance>
    <input type="hidden" name="did" value={confirmRemoveDid ?? ''} />
    <div class="flex justify-end gap-3">
      <button
        type="button"
        onclick={() => (confirmRemoveDid = null)}
        class="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
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
