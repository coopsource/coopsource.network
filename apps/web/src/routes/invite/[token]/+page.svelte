<script lang="ts">
  import { enhance } from '$app/forms';

  let { data, form } = $props();

  let submitting = $state(false);
  let displayName = $state('');
  let handle = $state('');

  function toHandle(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  $effect(() => {
    if (displayName && !handle) {
      handle = toHandle(displayName);
    }
  });

  const inv = $derived(data.invitation);
</script>

<svelte:head>
  <title>Accept Invitation — Co-op Source</title>
</svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
  <div class="w-full max-w-sm">
    <div class="mb-8 text-center">
      <h1 class="text-2xl font-bold text-gray-900">You're Invited!</h1>
      <p class="mt-2 text-sm text-gray-600">
        Accept your invitation to join the cooperative.
      </p>
    </div>

    <div class="mb-4 rounded-lg bg-blue-50 p-4">
      <p class="text-sm text-blue-800">
        <strong>Invitation for:</strong> {inv.email}
      </p>
      {#if inv.message}
        <p class="mt-2 text-sm text-blue-700">"{inv.message}"</p>
      {/if}
      {#if inv.roles.length > 0}
        <p class="mt-2 text-sm text-blue-700">
          <strong>Roles:</strong> {inv.roles.join(', ')}
        </p>
      {/if}
    </div>

    <div class="rounded-lg bg-white p-6 shadow-sm">
      {#if form?.error}
        <div class="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {form.error}
        </div>
      {/if}

      <form
        method="POST"
        action="?/accept"
        use:enhance={() => {
          submitting = true;
          return async ({ update }) => {
            submitting = false;
            await update();
          };
        }}
        class="space-y-4"
      >
        <input type="hidden" name="handle" value={handle} />

        <div>
          <label for="displayName" class="block text-sm font-medium text-gray-700">
            Display Name
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            required
            bind:value={displayName}
            class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Your Name"
          />
        </div>

        <div>
          <label for="handle" class="block text-sm font-medium text-gray-700">Handle</label>
          <div class="mt-1 flex rounded-md border border-gray-300 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
            <span class="flex items-center pl-3 text-sm text-gray-500">@</span>
            <input
              id="handle"
              type="text"
              required
              bind:value={handle}
              class="block w-full rounded-md px-2 py-2 text-sm focus:outline-none"
              placeholder="yourhandle"
            />
          </div>
        </div>

        <div>
          <label for="password" class="block text-sm font-medium text-gray-700">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minlength={8}
            autocomplete="new-password"
            class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Min. 8 characters"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          class="w-full rounded-md bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {submitting ? 'Accepting…' : 'Accept Invitation'}
        </button>
      </form>
    </div>
  </div>
</div>
