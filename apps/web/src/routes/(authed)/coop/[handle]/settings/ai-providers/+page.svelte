<script lang="ts">
  import { enhance } from '$app/forms';
  import Plus from '@lucide/svelte/icons/plus';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import type { ModelProviderConfig } from '$lib/api/types.js';

  let { data, form } = $props();
  let providers: ModelProviderConfig[] = $derived(data.providers);
  let showAddForm = $state(false);
  let selectedProvider = $state('anthropic');
</script>

<div class="space-y-6 max-w-3xl">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-semibold text-[var(--cs-text)]">AI Model Providers</h1>
      <p class="text-sm text-[var(--cs-text-secondary)] mt-1">
        Configure which AI model providers are available for agents
      </p>
    </div>
    <button
      onclick={() => showAddForm = !showAddForm}
      class="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium
             bg-[var(--cs-primary)] text-[var(--cs-text-on-primary)]
             hover:bg-[var(--cs-primary-hover)] cs-transition"
    >
      <Plus size={16} />
      Add Provider
    </button>
  </div>

  {#if form?.error}
    <div class="px-4 py-3 rounded-md text-sm bg-[var(--color-danger-50)] text-[var(--color-danger-600)] border border-[var(--color-danger-200)]">
      {form.error}
    </div>
  {/if}

  {#if form?.success}
    <div class="px-4 py-3 rounded-md text-sm bg-[var(--color-success-50)] text-[var(--color-success-600)] border border-[var(--color-success-200)]">
      Provider added successfully.
    </div>
  {/if}

  {#if showAddForm}
    <form method="POST" action="?/add" use:enhance class="cs-card p-5 space-y-4">
      <h2 class="text-sm font-medium text-[var(--cs-text)]">Add Model Provider</h2>

      <div>
        <label for="providerId" class="block text-sm font-medium text-[var(--cs-text)] mb-1">Provider</label>
        <select id="providerId" name="providerId" bind:value={selectedProvider} class="cs-input cs-input-focus w-full text-sm">
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="ollama">Ollama (Local)</option>
        </select>
      </div>

      <div>
        <label for="displayName" class="block text-sm font-medium text-[var(--cs-text)] mb-1">Display Name</label>
        <input id="displayName" name="displayName" type="text" required class="cs-input cs-input-focus w-full text-sm"
               value={selectedProvider === 'anthropic' ? 'Anthropic' : 'Ollama (Local)'} />
      </div>

      {#if selectedProvider === 'anthropic'}
        <div>
          <label for="apiKey" class="block text-sm font-medium text-[var(--cs-text)] mb-1">API Key</label>
          <input id="apiKey" name="apiKey" type="password" required class="cs-input cs-input-focus w-full text-sm"
                 placeholder="sk-ant-..." />
          <p class="text-xs text-[var(--cs-text-muted)] mt-1">Your API key is stored encrypted and never displayed after saving.</p>
        </div>
      {:else}
        <div>
          <label for="baseUrl" class="block text-sm font-medium text-[var(--cs-text)] mb-1">Base URL</label>
          <input id="baseUrl" name="baseUrl" type="text" class="cs-input cs-input-focus w-full text-sm"
                 placeholder="http://localhost:11434" />
        </div>
      {/if}

      <button type="submit" class="px-4 py-2 rounded-md text-sm font-medium bg-[var(--cs-primary)] text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] cs-transition">
        Add Provider
      </button>
    </form>
  {/if}

  {#if providers.length === 0}
    <div class="cs-card p-8 text-center">
      <p class="text-sm text-[var(--cs-text-secondary)]">
        No model providers configured. Add one to start using AI agents.
      </p>
    </div>
  {:else}
    <div class="space-y-3">
      {#each providers as provider}
        <div class="cs-card p-4 flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-[var(--cs-text)]">{provider.displayName}</p>
            <p class="text-xs text-[var(--cs-text-muted)]">
              {provider.providerId} · {provider.enabled ? 'Enabled' : 'Disabled'}
              {#if provider.allowedModels.length > 0}
                · {provider.allowedModels.length} model{provider.allowedModels.length > 1 ? 's' : ''} allowed
              {:else}
                · All models
              {/if}
            </p>
          </div>
          <form method="POST" action="?/remove" use:enhance>
            <input type="hidden" name="providerId" value={provider.providerId} />
            <button type="submit" class="p-2 rounded-md hover:bg-[var(--cs-bg-inset)] cs-transition text-[var(--cs-text-muted)] hover:text-[var(--color-danger-600)]">
              <Trash2 size={14} />
            </button>
          </form>
        </div>
      {/each}
    </div>
  {/if}
</div>
