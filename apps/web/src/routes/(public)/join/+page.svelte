<script lang="ts">
  import { enhance } from '$app/forms';

  let { form } = $props();

  let step = $state(1);
  let submitting = $state(false);

  // Step 1
  let cooperativeName = $state('');
  let cooperativeHandle = $state('');
  let cooperativeDescription = $state('');

  // Step 2
  let adminDisplayName = $state('');
  let adminHandle = $state('');
  let adminEmail = $state('');
  let adminPassword = $state('');

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

  function nextStep() { step = Math.min(step + 1, 3); }
  function prevStep() { step = Math.max(step - 1, 1); }
</script>

<svelte:head>
  <title>Create a Cooperative — Co-op Source</title>
</svelte:head>

<div class="flex min-h-[80vh] flex-col items-center justify-center p-4">
  <div class="w-full max-w-md">
    <div class="mb-8 text-center">
      <h1 class="text-2xl font-bold text-[var(--cs-text)]">Create a Cooperative</h1>
      <p class="mt-2 text-sm text-[var(--cs-text-secondary)]">
        Set up your cooperative in a few steps.
      </p>
    </div>

    <!-- Step indicator -->
    <div class="mb-6 flex items-center justify-center gap-2">
      {#each [1, 2, 3] as s}
        <div
          class="h-2 w-8 rounded-full cs-transition {s <= step ? 'bg-[var(--cs-primary)]' : 'bg-[var(--cs-border)]'}"
        ></div>
      {/each}
    </div>

    <div class="rounded-lg bg-[var(--cs-bg-card)] p-6 shadow-sm">
      {#if form?.error}
        <div class="mb-4 rounded-md bg-[var(--color-danger-light)] p-3 text-sm text-[var(--color-danger-dark)]">
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
        <!-- Hidden fields for all steps -->
        <input type="hidden" name="cooperativeName" value={cooperativeName} />
        <input type="hidden" name="cooperativeHandle" value={cooperativeHandle} />
        <input type="hidden" name="adminDisplayName" value={adminDisplayName} />
        <input type="hidden" name="adminHandle" value={adminHandle} />
        <input type="hidden" name="adminEmail" value={adminEmail} />
        <input type="hidden" name="adminPassword" value={adminPassword} />

        <!-- Step 1: Cooperative Info -->
        {#if step === 1}
          <h2 class="mb-4 text-base font-semibold text-[var(--cs-text)]">Cooperative Info</h2>
          <div class="space-y-4">
            <div>
              <label for="cooperativeName" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
                Name
              </label>
              <input
                id="cooperativeName"
                type="text"
                required
                bind:value={cooperativeName}
                class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
                placeholder="Acme Worker Co-op"
              />
            </div>
            <div>
              <label for="cooperativeHandle" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Handle</label>
              <div class="mt-1 flex rounded-md border border-[var(--cs-border)] focus-within:border-[var(--cs-border-focus)] focus-within:ring-1 focus-within:ring-[var(--cs-ring)]">
                <span class="flex items-center pl-3 text-sm text-[var(--cs-text-muted)]">@</span>
                <input
                  id="cooperativeHandle"
                  type="text"
                  required
                  bind:value={cooperativeHandle}
                  class="block w-full rounded-md px-2 py-2 text-sm focus:outline-none"
                  placeholder="acme"
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
              Next
            </button>
          </div>

        <!-- Step 2: Admin Account -->
        {:else if step === 2}
          <h2 class="mb-4 text-base font-semibold text-[var(--cs-text)]">Admin Account</h2>
          <div class="space-y-4">
            <div>
              <label for="adminDisplayName" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
                Your Name
              </label>
              <input
                id="adminDisplayName"
                type="text"
                required
                bind:value={adminDisplayName}
                class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
                placeholder="Jane Doe"
              />
            </div>
            <div>
              <label for="adminEmail" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Email</label>
              <input
                id="adminEmail"
                type="email"
                required
                bind:value={adminEmail}
                class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
                placeholder="jane@acme.coop"
              />
            </div>
            <div>
              <label for="adminPassword" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Password</label>
              <input
                id="adminPassword"
                type="password"
                required
                minlength={8}
                bind:value={adminPassword}
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
              Back
            </button>
            <button
              type="button"
              onclick={nextStep}
              disabled={!adminDisplayName || !adminEmail || adminPassword.length < 8}
              class="rounded-md bg-[var(--cs-primary)] px-4 py-2 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50"
            >
              Next
            </button>
          </div>

        <!-- Step 3: Review -->
        {:else if step === 3}
          <h2 class="mb-4 text-base font-semibold text-[var(--cs-text)]">Review</h2>
          <div class="space-y-3 rounded-md bg-[var(--cs-bg-inset)] p-4 text-sm">
            <div>
              <span class="font-medium text-[var(--cs-text-secondary)]">Co-op:</span>
              <span class="text-[var(--cs-text)]">{cooperativeName}</span>
              <span class="text-[var(--cs-text-muted)]">(@{cooperativeHandle})</span>
            </div>
            <div>
              <span class="font-medium text-[var(--cs-text-secondary)]">Admin:</span>
              <span class="text-[var(--cs-text)]">{adminDisplayName}</span>
              <span class="text-[var(--cs-text-muted)]">({adminEmail})</span>
            </div>
          </div>
          <div class="mt-6 flex justify-between">
            <button
              type="button"
              onclick={prevStep}
              class="rounded-md border border-[var(--cs-border)] px-4 py-2 text-sm font-medium text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={submitting}
              class="rounded-md bg-[var(--cs-primary)] px-4 py-2 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create Cooperative'}
            </button>
          </div>
        {/if}
      </form>
    </div>

    <p class="mt-4 text-center text-sm text-[var(--cs-text-muted)]">
      Already have an account?
      <a href="/login" class="text-[var(--cs-primary)] hover:underline">Sign in</a>
    </p>
  </div>
</div>
