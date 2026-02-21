<script lang="ts">
  import { enhance } from '$app/forms';
  import Badge from '$lib/components/Badge.svelte';
  import Modal from '$lib/components/Modal.svelte';

  let { data, form } = $props();

  const agreement = $derived(data.agreement);
  let confirmSign = $state(false);
  let confirmVoid = $state(false);
</script>

<svelte:head>
  <title>{agreement.title} — Co-op Source</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6">
  <div class="flex items-center gap-3">
    <a href="/agreements" class="text-sm text-gray-500 hover:text-gray-700">← Agreements</a>
  </div>

  {#if form?.actionError}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.actionError}</div>
  {/if}

  {#if form?.actionSuccess}
    <div class="rounded-md bg-green-50 p-3 text-sm text-green-700">{form.actionSuccess}</div>
  {/if}

  <!-- Agreement Header -->
  <div class="rounded-lg border border-gray-200 bg-white p-6">
    <div class="mb-4 flex items-start justify-between gap-4">
      <h1 class="text-xl font-semibold text-gray-900">{agreement.title}</h1>
      <Badge status={agreement.status} class="shrink-0" />
    </div>

    <div class="mb-4 flex flex-wrap gap-3 text-xs text-gray-500">
      <span>Type: <strong>{agreement.agreementType}</strong></span>
      <span>
        By <strong>{agreement.authorDisplayName}</strong>
        {#if agreement.authorHandle}
          (@{agreement.authorHandle})
        {/if}
      </span>
      <span>{new Date(agreement.createdAt).toLocaleDateString()}</span>
      {#if agreement.signatureCount > 0}
        <span class="text-green-600 font-medium">
          {agreement.signatureCount} signature{agreement.signatureCount !== 1 ? 's' : ''}
        </span>
      {/if}
    </div>

    <!-- Agreement body -->
    <div class="rounded-md bg-gray-50 p-4">
      <pre class="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed">{agreement.body}</pre>
    </div>

    <!-- Actions bar -->
    <div class="mt-5 flex flex-wrap gap-3 border-t border-gray-100 pt-4">
      {#if agreement.status === 'draft'}
        <form method="POST" action="?/open" use:enhance>
          <button
            type="submit"
            class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Open for signing
          </button>
        </form>
        <button
          type="button"
          onclick={() => (confirmVoid = true)}
          class="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          Void
        </button>
      {:else if agreement.status === 'open'}
        {#if !agreement.mySignature}
          <button
            type="button"
            onclick={() => (confirmSign = true)}
            class="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
          >
            Sign Agreement
          </button>
        {:else}
          <form method="POST" action="?/retractSignature" use:enhance>
            <button
              type="submit"
              class="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              Retract signature
            </button>
          </form>
        {/if}
        <button
          type="button"
          onclick={() => (confirmVoid = true)}
          class="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
        >
          Void
        </button>
      {/if}
    </div>
  </div>

  <!-- Signature status -->
  {#if agreement.status === 'open' || agreement.status === 'signed'}
    <div class="rounded-lg border border-gray-200 bg-white p-5">
      <h2 class="text-sm font-semibold text-gray-900">Signature Status</h2>
      <div class="mt-3">
        {#if agreement.mySignature}
          <div class="flex items-center gap-2 text-sm text-green-700">
            <span>✓</span>
            <span>You have signed this agreement.</span>
          </div>
        {:else}
          <p class="text-sm text-gray-500">You have not signed this agreement yet.</p>
        {/if}
        <p class="mt-2 text-xs text-gray-400">
          Total signatures: {agreement.signatureCount}
        </p>
      </div>
    </div>
  {/if}
</div>

<!-- Sign Confirmation Modal -->
<Modal open={confirmSign} title="Sign Agreement" onClose={() => (confirmSign = false)}>
  <p class="mb-4 text-sm text-gray-600">
    By signing, you agree to the terms set out in this agreement. This action is recorded.
  </p>
  <form method="POST" action="?/sign" use:enhance={() => {
    return async ({ update }) => {
      confirmSign = false;
      await update();
    };
  }}>
    <div class="flex justify-end gap-3">
      <button
        type="button"
        onclick={() => (confirmSign = false)}
        class="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
      >
        Cancel
      </button>
      <button
        type="submit"
        class="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
      >
        Confirm & Sign
      </button>
    </div>
  </form>
</Modal>

<!-- Void Confirmation Modal -->
<Modal open={confirmVoid} title="Void Agreement" onClose={() => (confirmVoid = false)}>
  <p class="mb-4 text-sm text-gray-600">
    Are you sure you want to void this agreement? This cannot be undone.
  </p>
  <form method="POST" action="?/void" use:enhance={() => {
    return async ({ update }) => {
      confirmVoid = false;
      await update();
    };
  }}>
    <div class="flex justify-end gap-3">
      <button
        type="button"
        onclick={() => (confirmVoid = false)}
        class="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
      >
        Cancel
      </button>
      <button
        type="submit"
        class="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
      >
        Void Agreement
      </button>
    </div>
  </form>
</Modal>
