<script lang="ts">
  import { enhance } from '$app/forms';
  import { Badge, EmptyState } from '$lib/components/ui';

  let { data, form } = $props();

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
  <title>Invitations — Co-op Source</title>
</svelte:head>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">Invitations</h1>
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
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-[var(--cs-border)] text-left">
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Email</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Roles</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Status</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Expires</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--cs-border)]">
          {#each data.invitations as invitation}
            <tr>
              <td class="px-4 py-3">
                <div class="font-medium text-[var(--cs-text)]">{invitation.email}</div>
                {#if invitation.message}
                  <div class="text-xs text-[var(--cs-text-muted)] italic">"{invitation.message}"</div>
                {/if}
              </td>
              <td class="px-4 py-3">
                {#if invitation.roles.length > 0}
                  <div class="flex flex-wrap gap-1">
                    {#each invitation.roles as role}
                      <span class="rounded bg-[var(--cs-bg-inset)] px-1.5 py-0.5 text-xs text-[var(--cs-text-secondary)]">
                        {role}
                      </span>
                    {/each}
                  </div>
                {:else}
                  <span class="text-[var(--cs-text-muted)]">—</span>
                {/if}
              </td>
              <td class="px-4 py-3">
                <Badge variant={statusToVariant(invitation.status)}>{invitation.status}</Badge>
              </td>
              <td class="px-4 py-3 text-[var(--cs-text-muted)]">
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
