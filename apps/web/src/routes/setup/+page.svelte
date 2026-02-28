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

<div class="flex min-h-screen flex-col items-center justify-center bg-[var(--cs-bg-inset)] p-4">
  <div class="w-full max-w-md">
    <div class="mb-8 text-center">
      <h1 class="text-2xl font-bold text-[var(--cs-text)]">Welcome to Co-op Source</h1>
      <p class="mt-2 text-sm text-[var(--cs-text-secondary)]">Let's set up your cooperative network.</p>
    </div>

    <!-- Step indicator -->
    <div class="mb-6 flex items-center justify-center gap-2">
      {#each [1, 2, 3] as s}
        <div class="flex items-center gap-2">
          <div
            class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium
              {step === s
                ? 'bg-[var(--cs-primary)] text-[var(--cs-text-on-primary)]'
                : step > s
                  ? 'bg-green-500 text-white'
                  : 'bg-[var(--cs-bg-inset)] text-[var(--cs-text-secondary)]'}"
          >
            {step > s ? '✓' : s}
          </div>
          {#if s < 3}
            <div class="h-px w-8 {step > s ? 'bg-green-400' : 'bg-[var(--cs-border)]'}"></div>
          {/if}
        </div>
      {/each}
    </div>

    <div class="rounded-lg bg-[var(--cs-bg-card)] p-6 shadow-sm">
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
          <h2 class="mb-4 text-base font-semibold text-[var(--cs-text)]">Co-op Information</h2>
          <div class="space-y-4">
            <div>
              <label for="cooperativeName" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
                Co-op Name
              </label>
              <input
                id="cooperativeName"
                type="text"
                bind:value={cooperativeName}
                required
                class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
                placeholder="My Cooperative"
              />
            </div>
            <div>
              <label for="cooperativeHandle" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
                Handle
              </label>
              <div class="mt-1 flex rounded-md border border-[var(--cs-border)] focus-within:border-[var(--cs-border-focus)] focus-within:ring-1 focus-within:ring-[var(--cs-ring)]">
                <span class="flex items-center pl-3 text-sm text-[var(--cs-text-muted)]">@</span>
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
              class="rounded-md bg-[var(--cs-primary)] px-4 py-2 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50"
            >
              Next →
            </button>
          </div>

        <!-- Step 2: Admin Account -->
        {:else if step === 2}
          <h2 class="mb-4 text-base font-semibold text-[var(--cs-text)]">Admin Account</h2>
          <div class="space-y-4">
            <div>
              <label for="adminDisplayName" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
                Display Name
              </label>
              <input
                id="adminDisplayName"
                type="text"
                bind:value={adminDisplayName}
                required
                class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
                placeholder="Your Name"
              />
            </div>
            <div>
              <label for="adminHandle" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
                Handle
              </label>
              <div class="mt-1 flex rounded-md border border-[var(--cs-border)] focus-within:border-[var(--cs-border-focus)] focus-within:ring-1 focus-within:ring-[var(--cs-ring)]">
                <span class="flex items-center pl-3 text-sm text-[var(--cs-text-muted)]">@</span>
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
              <label for="adminEmail" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
                Email
              </label>
              <input
                id="adminEmail"
                type="email"
                bind:value={adminEmail}
                required
                class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label for="adminPassword" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
                Password
              </label>
              <input
                id="adminPassword"
                type="password"
                bind:value={adminPassword}
                required
                minlength={8}
                class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
                placeholder="Min. 8 characters"
              />
            </div>
          </div>
          <div class="mt-6 flex justify-between">
            <button
              type="button"
              onclick={prevStep}
              class="rounded-md border border-[var(--cs-border)] px-4 py-2 text-sm font-medium text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
            >
              ← Back
            </button>
            <button
              type="button"
              onclick={nextStep}
              disabled={!adminDisplayName || !adminHandle || !adminEmail || adminPassword.length < 8}
              class="rounded-md bg-[var(--cs-primary)] px-4 py-2 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50"
            >
              Next →
            </button>
          </div>

        <!-- Step 3: Review -->
        {:else if step === 3}
          <h2 class="mb-4 text-base font-semibold text-[var(--cs-text)]">Review</h2>
          <div class="space-y-3 rounded-md bg-[var(--cs-bg-inset)] p-4 text-sm">
            <div>
              <span class="font-medium text-[var(--cs-text-secondary)]">Co-op:</span>
              <span class="ml-2 text-[var(--cs-text)]">{cooperativeName}</span>
              <span class="ml-1 text-[var(--cs-text-muted)]">(@{cooperativeHandle})</span>
            </div>
            <div>
              <span class="font-medium text-[var(--cs-text-secondary)]">Admin:</span>
              <span class="ml-2 text-[var(--cs-text)]">{adminDisplayName}</span>
              <span class="ml-1 text-[var(--cs-text-muted)]">(@{adminHandle})</span>
            </div>
            <div>
              <span class="font-medium text-[var(--cs-text-secondary)]">Email:</span>
              <span class="ml-2 text-[var(--cs-text)]">{adminEmail}</span>
            </div>
          </div>
          <div class="mt-6 flex justify-between">
            <button
              type="button"
              onclick={prevStep}
              class="rounded-md border border-[var(--cs-border)] px-4 py-2 text-sm font-medium text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
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
