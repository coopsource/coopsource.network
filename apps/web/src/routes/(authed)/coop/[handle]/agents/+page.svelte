<script lang="ts">
  import Bot from '@lucide/svelte/icons/bot';
  import Plus from '@lucide/svelte/icons/plus';
  import type { AgentConfig } from '$lib/api/types.js';

  let { data } = $props();
  let agents: AgentConfig[] = $derived(data.agents);
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-semibold text-[var(--cs-text)]">Agents</h1>
      <p class="text-sm text-[var(--cs-text-secondary)] mt-1">
        AI assistants configured for your cooperative
      </p>
    </div>
    <a
      href="settings/agents"
      class="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium
             bg-[var(--cs-primary)] text-[var(--cs-text-on-primary)]
             hover:bg-[var(--cs-primary-hover)] cs-transition"
    >
      <Plus size={16} />
      Configure
    </a>
  </div>

  {#if agents.length === 0}
    <div class="cs-card p-12 text-center">
      <Bot size={48} class="mx-auto text-[var(--cs-text-muted)] mb-4" />
      <h2 class="text-lg font-medium text-[var(--cs-text)]">No agents configured</h2>
      <p class="text-sm text-[var(--cs-text-secondary)] mt-2 max-w-md mx-auto">
        Configure AI model providers and create agents to help your cooperative
        with governance, facilitation, and analysis.
      </p>
      <a
        href="settings/agents"
        class="inline-flex items-center gap-2 mt-6 px-4 py-2 rounded-md text-sm font-medium
               bg-[var(--cs-primary)] text-[var(--cs-text-on-primary)]
               hover:bg-[var(--cs-primary-hover)] cs-transition"
      >
        Get Started
      </a>
    </div>
  {:else}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each agents as agent}
        <a
          href="agents/{agent.id}"
          class="cs-card p-5 hover:border-[var(--cs-primary)] cs-transition block"
        >
          <div class="flex items-start gap-3">
            <div class="p-2 rounded-lg bg-[var(--cs-bg-inset)]">
              <Bot size={20} class="text-[var(--cs-primary)]" />
            </div>
            <div class="min-w-0 flex-1">
              <h3 class="font-medium text-[var(--cs-text)] truncate">{agent.name}</h3>
              <p class="text-xs text-[var(--cs-text-muted)] mt-0.5 capitalize">{agent.agentType}</p>
            </div>
            {#if !agent.enabled}
              <span class="text-xs px-2 py-0.5 rounded-full bg-[var(--cs-bg-inset)] text-[var(--cs-text-muted)]">
                Disabled
              </span>
            {/if}
          </div>
          {#if agent.description}
            <p class="text-sm text-[var(--cs-text-secondary)] mt-3 line-clamp-2">{agent.description}</p>
          {/if}
          <div class="flex items-center gap-2 mt-3 text-xs text-[var(--cs-text-muted)]">
            <span>Model: {agent.modelConfig.chat.split(':').pop()}</span>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
