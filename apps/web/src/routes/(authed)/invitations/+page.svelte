<script lang="ts">
  import { enhance } from '$app/forms';
  import Badge from '$lib/components/Badge.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';

  let { data, form } = $props();
</script>

<svelte:head>
  <title>Invitations — Co-op Source</title>
</svelte:head>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-semibold text-gray-900">Invitations</h1>
    <a
      href="/members"
      class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
    >
      Invite member
    </a>
  </div>

  {#if form?.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}

  {#if data.invitations.length === 0}
    <EmptyState
      title="No pending invitations"
      description="Invitations will appear here after you invite members."
    />
  {:else}
    <div class="rounded-lg border border-gray-200 bg-white">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-200 text-left">
            <th class="px-4 py-3 font-medium text-gray-600">Email</th>
            <th class="px-4 py-3 font-medium text-gray-600">Roles</th>
            <th class="px-4 py-3 font-medium text-gray-600">Status</th>
            <th class="px-4 py-3 font-medium text-gray-600">Expires</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          {#each data.invitations as invitation}
            <tr>
              <td class="px-4 py-3">
                <div class="font-medium text-gray-900">{invitation.email}</div>
                {#if invitation.message}
                  <div class="text-xs text-gray-500 italic">"{invitation.message}"</div>
                {/if}
              </td>
              <td class="px-4 py-3">
                {#if invitation.roles.length > 0}
                  <div class="flex flex-wrap gap-1">
                    {#each invitation.roles as role}
                      <span class="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">
                        {role}
                      </span>
                    {/each}
                  </div>
                {:else}
                  <span class="text-gray-400">—</span>
                {/if}
              </td>
              <td class="px-4 py-3">
                <Badge status={invitation.status} />
              </td>
              <td class="px-4 py-3 text-gray-500">
                {new Date(invitation.expiresAt).toLocaleDateString()}
              </td>
              <td class="px-4 py-3 text-right">
                {#if invitation.status === 'pending'}
                  <form method="POST" action="?/revoke" use:enhance class="inline">
                    <input type="hidden" name="id" value={invitation.id} />
                    <button type="submit" class="text-xs text-red-600 hover:underline">
                      Revoke
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
</div>
