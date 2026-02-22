<script lang="ts">
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { Badge } from '$lib/components/ui';

  let { data, form } = $props();

  let submitting = $state(false);

  const serviceLabels: Record<string, string> = {
    github: 'GitHub',
    google: 'Google',
    slack: 'Slack',
    linear: 'Linear',
    zoom: 'Zoom',
  };

  // Handle redirect from connect action
  $effect(() => {
    if (form?.redirect) {
      window.location.href = form.redirect;
    }
  });
</script>

<svelte:head>
  <title>Connections — Co-op Source</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
  <h1 class="text-xl font-semibold text-[var(--cs-text)]">External Connections</h1>
  <p class="text-sm text-[var(--cs-text-muted)]">
    Connect external services to link repositories, documents, and other resources to your cooperative projects.
  </p>

  {#if data.connected}
    <div class="rounded-md bg-green-50 p-3 text-sm text-green-700">
      Successfully connected to {serviceLabels[data.connected] ?? data.connected}!
    </div>
  {/if}

  {#if data.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">
      {#if data.error === 'oauth_failed'}
        OAuth authorization failed. Please try again.
      {:else if data.error === 'missing_params'}
        Missing authorization parameters. Please try again.
      {:else}
        An error occurred: {data.error}
      {/if}
    </div>
  {/if}

  {#if form?.actionSuccess}
    <div class="rounded-md bg-green-50 p-3 text-sm text-green-700">{form.actionSuccess}</div>
  {/if}
  {#if form?.actionError}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.actionError}</div>
  {/if}

  <!-- Available Services -->
  {#if data.availableServices.length > 0}
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-6">
      <h2 class="text-lg font-semibold text-[var(--cs-text)]">Available Services</h2>
      <div class="mt-4 space-y-3">
        {#each data.availableServices as service}
          {@const alreadyConnected = data.connections.some(c => c.service === service && c.status === 'active')}
          <div class="flex items-center justify-between rounded-md border border-[var(--cs-border)] p-3">
            <span class="text-sm font-medium text-[var(--cs-text)]">{serviceLabels[service] ?? service}</span>
            {#if alreadyConnected}
              <Badge variant="success">Connected</Badge>
            {:else}
              <form
                method="POST"
                action="?/connect"
                use:enhance={() => {
                  submitting = true;
                  return async ({ result, update }) => {
                    submitting = false;
                    if (result.type === 'success' && result.data?.redirect) {
                      window.location.href = result.data.redirect as string;
                    } else {
                      await update();
                    }
                  };
                }}
              >
                <input type="hidden" name="service" value={service} />
                <button
                  type="submit"
                  disabled={submitting}
                  class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Connect
                </button>
              </form>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-6 text-center">
      <p class="text-sm text-[var(--cs-text-muted)]">
        No external services are configured. Ask your administrator to set up GitHub, Google, or other service credentials.
      </p>
    </div>
  {/if}

  <!-- Current Connections -->
  {#if data.connections.length > 0}
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-6">
      <h2 class="text-lg font-semibold text-[var(--cs-text)]">Your Connections</h2>
      <div class="mt-4 space-y-3">
        {#each data.connections as connection}
          <div class="flex items-center justify-between rounded-md border border-[var(--cs-border)] p-3">
            <div>
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-[var(--cs-text)]">
                  {serviceLabels[connection.service] ?? connection.service}
                </span>
                <Badge variant={connection.status === 'active' ? 'success' : 'danger'}>
                  {connection.status}
                </Badge>
              </div>
              {#if connection.metadata}
                <div class="mt-1 text-xs text-[var(--cs-text-muted)]">
                  {#if connection.metadata.login}
                    @{connection.metadata.login}
                  {:else if connection.metadata.email}
                    {connection.metadata.email}
                  {/if}
                </div>
              {/if}
              <div class="mt-1 text-xs text-[var(--cs-text-muted)]">
                Connected {new Date(connection.createdAt).toLocaleDateString()}
              </div>
            </div>
            {#if connection.status === 'active'}
              <form method="POST" action="?/disconnect" use:enhance>
                <input type="hidden" name="uri" value={connection.uri} />
                <button
                  type="submit"
                  class="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  Disconnect
                </button>
              </form>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
