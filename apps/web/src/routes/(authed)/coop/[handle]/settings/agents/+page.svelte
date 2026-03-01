<script lang="ts">
  import { enhance } from '$app/forms';
  import Bot from '@lucide/svelte/icons/bot';
  import Plus from '@lucide/svelte/icons/plus';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import type { AgentConfig } from '$lib/api/types.js';

  let { data, form } = $props();
  let agents: AgentConfig[] = $derived(data.agents);
  let showCreateForm = $state(false);

  const templates = ['facilitator', 'governance', 'coordinator', 'analyst'];
</script>

<div class="space-y-6 max-w-4xl">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-semibold text-[var(--cs-text)]">Agent Settings</h1>
      <p class="text-sm text-[var(--cs-text-secondary)] mt-1">
        Configure AI agents for your cooperative
      </p>
    </div>
    <button
      onclick={() => showCreateForm = !showCreateForm}
      class="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium
             bg-[var(--cs-primary)] text-[var(--cs-text-on-primary)]
             hover:bg-[var(--cs-primary-hover)] cs-transition"
    >
      <Plus size={16} />
      New Agent
    </button>
  </div>

  {#if form?.error}
    <div class="px-4 py-3 rounded-md text-sm bg-[var(--color-danger-50)] text-[var(--color-danger-600)] border border-[var(--color-danger-200)]">
      {form.error}
    </div>
  {/if}

  {#if form?.success}
    <div class="px-4 py-3 rounded-md text-sm bg-[var(--color-success-50)] text-[var(--color-success-600)] border border-[var(--color-success-200)]">
      Agent created successfully.
    </div>
  {/if}

  <!-- Quick Templates -->
  <div class="cs-card p-5">
    <h2 class="text-sm font-medium text-[var(--cs-text)] mb-3">Quick Start Templates</h2>
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {#each templates as tmpl}
        <form method="POST" action="?/createFromTemplate" use:enhance>
          <input type="hidden" name="agentType" value={tmpl} />
          <button
            type="submit"
            class="w-full text-left p-3 rounded-md border border-[var(--cs-border)]
                   hover:border-[var(--cs-primary)] hover:bg-[var(--cs-bg-inset)] cs-transition"
          >
            <div class="flex items-center gap-2 mb-1">
              <Bot size={14} class="text-[var(--cs-primary)]" />
              <span class="text-sm font-medium text-[var(--cs-text)] capitalize">{tmpl}</span>
            </div>
            <p class="text-xs text-[var(--cs-text-muted)]">
              {#if tmpl === 'facilitator'}Guide discussions and build consensus
              {:else if tmpl === 'governance'}Analyze proposals and voting patterns
              {:else if tmpl === 'coordinator'}Organize work and track action items
              {:else}Analyze data and provide insights{/if}
            </p>
          </button>
        </form>
      {/each}
    </div>
  </div>

  <!-- Create Custom Form -->
  {#if showCreateForm}
    <form method="POST" action="?/create" use:enhance class="cs-card p-5 space-y-4">
      <h2 class="text-sm font-medium text-[var(--cs-text)]">Create Custom Agent</h2>

      <div>
        <label for="name" class="block text-sm font-medium text-[var(--cs-text)] mb-1">Name</label>
        <input id="name" name="name" type="text" required class="cs-input cs-input-focus w-full text-sm" placeholder="My Agent" />
      </div>

      <div>
        <label for="chatModel" class="block text-sm font-medium text-[var(--cs-text)] mb-1">Chat Model</label>
        <input id="chatModel" name="chatModel" type="text" required class="cs-input cs-input-focus w-full text-sm"
               placeholder="anthropic:claude-sonnet-4-20250514" />
        {#if data.availableModels.length > 0}
          <p class="text-xs text-[var(--cs-text-muted)] mt-1">
            Available: {data.availableModels.map(p => p.models.map(m => `${p.providerId}:${m.id}`).join(', ')).join(', ')}
          </p>
        {:else}
          <p class="text-xs text-[var(--cs-text-muted)] mt-1">
            No model providers configured. <a href="ai-providers" class="text-[var(--cs-primary)]">Add one first.</a>
          </p>
        {/if}
      </div>

      <div>
        <label for="systemPrompt" class="block text-sm font-medium text-[var(--cs-text)] mb-1">System Prompt</label>
        <textarea id="systemPrompt" name="systemPrompt" rows={4} required class="cs-input cs-input-focus w-full text-sm"
                  placeholder="You are a helpful assistant for our cooperative..."></textarea>
      </div>

      <div>
        <label for="agentType" class="block text-sm font-medium text-[var(--cs-text)] mb-1">Type</label>
        <select id="agentType" name="agentType" class="cs-input cs-input-focus w-full text-sm">
          <option value="custom">Custom</option>
          <option value="facilitator">Facilitator</option>
          <option value="governance">Governance</option>
          <option value="coordinator">Coordinator</option>
          <option value="analyst">Analyst</option>
        </select>
      </div>

      <button type="submit" class="px-4 py-2 rounded-md text-sm font-medium bg-[var(--cs-primary)] text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] cs-transition">
        Create Agent
      </button>
    </form>
  {/if}

  <!-- Agent List -->
  {#if agents.length > 0}
    <div class="space-y-3">
      <h2 class="text-sm font-medium text-[var(--cs-text)]">Configured Agents</h2>
      {#each agents as agent}
        <div class="cs-card p-4 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <Bot size={18} class="text-[var(--cs-primary)]" />
            <div>
              <p class="text-sm font-medium text-[var(--cs-text)]">{agent.name}</p>
              <p class="text-xs text-[var(--cs-text-muted)]">
                {agent.agentType} · {agent.modelConfig.chat} · {agent.enabled ? 'Enabled' : 'Disabled'}
              </p>
            </div>
          </div>
          <form method="POST" action="?/delete" use:enhance>
            <input type="hidden" name="id" value={agent.id} />
            <button type="submit" class="p-2 rounded-md hover:bg-[var(--cs-bg-inset)] cs-transition text-[var(--cs-text-muted)] hover:text-[var(--color-danger-600)]">
              <Trash2 size={14} />
            </button>
          </form>
        </div>
      {/each}
    </div>
  {/if}
</div>
