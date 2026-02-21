<script lang="ts">
  import { enhance } from '$app/forms';

  let { form } = $props();

  let step = $state(1);

  // Form field state
  let cooperativeName = $state('');
  let cooperativeHandle = $state('');
  let adminDisplayName = $state('');
  let adminHandle = $state('');
  let adminEmail = $state('');
  let adminPassword = $state('');
  let submitting = $state(false);

  function nextStep() {
    step++;
  }

  function prevStep() {
    step--;
  }

  // Auto-generate handle from name
  function toHandle(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  $effect(() => {
    if (cooperativeName && !cooperativeHandle) {
      cooperativeHandle = toHandle(cooperativeName);
    }
  });

  $effect(() => {
    if (adminDisplayName && !adminHandle) {
      adminHandle = toHandle(adminDisplayName);
    }
  });
</script>

<svelte:head>
  <title>Setup — Co-op Source</title>
</svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
  <div class="w-full max-w-md">
    <div class="mb-8 text-center">
      <h1 class="text-2xl font-bold text-gray-900">Welcome to Co-op Source</h1>
      <p class="mt-2 text-sm text-gray-600">Let's set up your cooperative network.</p>
    </div>

    <!-- Step indicator -->
    <div class="mb-6 flex items-center justify-center gap-2">
      {#each [1, 2, 3] as s}
        <div class="flex items-center gap-2">
          <div
            class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium
              {step === s
                ? 'bg-blue-600 text-white'
                : step > s
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-200 text-gray-600'}"
          >
            {step > s ? '✓' : s}
          </div>
          {#if s < 3}
            <div class="h-px w-8 {step > s ? 'bg-green-400' : 'bg-gray-200'}"></div>
          {/if}
        </div>
      {/each}
    </div>

    <div class="rounded-lg bg-white p-6 shadow-sm">
      {#if form?.error}
        <div class="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {form.error}
        </div>
      {/if}

      <form
        method="POST"
        use:enhance={() => {
          submitting = true;
          return async ({ update }) => {
            submitting = false;
            await update();
          };
        }}
      >
        <!-- Hidden fields to submit all values -->
        <input type="hidden" name="cooperativeName" value={cooperativeName} />
        <input type="hidden" name="cooperativeHandle" value={cooperativeHandle} />
        <input type="hidden" name="adminDisplayName" value={adminDisplayName} />
        <input type="hidden" name="adminHandle" value={adminHandle} />
        <input type="hidden" name="adminEmail" value={adminEmail} />
        <input type="hidden" name="adminPassword" value={adminPassword} />

        <!-- Step 1: Co-op Info -->
        {#if step === 1}
          <h2 class="mb-4 text-base font-semibold text-gray-900">Co-op Information</h2>
          <div class="space-y-4">
            <div>
              <label for="cooperativeName" class="block text-sm font-medium text-gray-700">
                Co-op Name
              </label>
              <input
                id="cooperativeName"
                type="text"
                bind:value={cooperativeName}
                required
                class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="My Cooperative"
              />
            </div>
            <div>
              <label for="cooperativeHandle" class="block text-sm font-medium text-gray-700">
                Handle
              </label>
              <div class="mt-1 flex rounded-md border border-gray-300 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
                <span class="flex items-center pl-3 text-sm text-gray-500">@</span>
                <input
                  id="cooperativeHandle"
                  type="text"
                  bind:value={cooperativeHandle}
                  required
                  class="block w-full rounded-md px-2 py-2 text-sm focus:outline-none"
                  placeholder="my-coop"
                />
              </div>
            </div>
          </div>
          <div class="mt-6 flex justify-end">
            <button
              type="button"
              onclick={nextStep}
              disabled={!cooperativeName || !cooperativeHandle}
              class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Next →
            </button>
          </div>

        <!-- Step 2: Admin Account -->
        {:else if step === 2}
          <h2 class="mb-4 text-base font-semibold text-gray-900">Admin Account</h2>
          <div class="space-y-4">
            <div>
              <label for="adminDisplayName" class="block text-sm font-medium text-gray-700">
                Display Name
              </label>
              <input
                id="adminDisplayName"
                type="text"
                bind:value={adminDisplayName}
                required
                class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Your Name"
              />
            </div>
            <div>
              <label for="adminHandle" class="block text-sm font-medium text-gray-700">
                Handle
              </label>
              <div class="mt-1 flex rounded-md border border-gray-300 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
                <span class="flex items-center pl-3 text-sm text-gray-500">@</span>
                <input
                  id="adminHandle"
                  type="text"
                  bind:value={adminHandle}
                  required
                  class="block w-full rounded-md px-2 py-2 text-sm focus:outline-none"
                  placeholder="yourhandle"
                />
              </div>
            </div>
            <div>
              <label for="adminEmail" class="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                id="adminEmail"
                type="email"
                bind:value={adminEmail}
                required
                class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label for="adminPassword" class="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="adminPassword"
                type="password"
                bind:value={adminPassword}
                required
                minlength={8}
                class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Min. 8 characters"
              />
            </div>
          </div>
          <div class="mt-6 flex justify-between">
            <button
              type="button"
              onclick={prevStep}
              class="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              ← Back
            </button>
            <button
              type="button"
              onclick={nextStep}
              disabled={!adminDisplayName || !adminHandle || !adminEmail || adminPassword.length < 8}
              class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Next →
            </button>
          </div>

        <!-- Step 3: Review -->
        {:else if step === 3}
          <h2 class="mb-4 text-base font-semibold text-gray-900">Review</h2>
          <div class="space-y-3 rounded-md bg-gray-50 p-4 text-sm">
            <div>
              <span class="font-medium text-gray-600">Co-op:</span>
              <span class="ml-2 text-gray-900">{cooperativeName}</span>
              <span class="ml-1 text-gray-500">(@{cooperativeHandle})</span>
            </div>
            <div>
              <span class="font-medium text-gray-600">Admin:</span>
              <span class="ml-2 text-gray-900">{adminDisplayName}</span>
              <span class="ml-1 text-gray-500">(@{adminHandle})</span>
            </div>
            <div>
              <span class="font-medium text-gray-600">Email:</span>
              <span class="ml-2 text-gray-900">{adminEmail}</span>
            </div>
          </div>
          <div class="mt-6 flex justify-between">
            <button
              type="button"
              onclick={prevStep}
              class="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              ← Back
            </button>
            <button
              type="submit"
              disabled={submitting}
              class="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {submitting ? 'Setting up…' : 'Initialize Co-op'}
            </button>
          </div>
        {/if}
      </form>
    </div>
  </div>
</div>
