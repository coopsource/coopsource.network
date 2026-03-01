<script lang="ts">
  import Send from '@lucide/svelte/icons/send';
  import Bot from '@lucide/svelte/icons/bot';
  import User from '@lucide/svelte/icons/user';
  import { createApiClient } from '$lib/api/client.js';
  import type { AgentConfig, AgentMessage } from '$lib/api/types.js';

  let { data } = $props();
  let agent: AgentConfig = $derived(data.agent);

  let messageInput = $state('');
  let messages = $state<AgentMessage[]>([]);
  let sessionId = $state<string | undefined>(undefined);
  let sending = $state(false);
  let error = $state<string | null>(null);

  async function sendMessage() {
    if (!messageInput.trim() || sending) return;

    const text = messageInput.trim();
    messageInput = '';
    sending = true;
    error = null;

    // Add user message optimistically
    messages = [
      ...messages,
      {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        toolCalls: null,
        inputTokens: 0,
        outputTokens: 0,
        costMicrodollars: 0,
        model: null,
        createdAt: new Date().toISOString(),
      },
    ];

    try {
      const api = createApiClient(fetch);
      const result = await api.sendAgentMessage(agent.id, {
        message: text,
        sessionId,
      });

      sessionId = result.sessionId;

      // Add assistant response
      messages = [
        ...messages,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: result.content,
          toolCalls: null,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          costMicrodollars: 0,
          model: result.model,
          createdAt: new Date().toISOString(),
        },
      ];
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to send message';
    } finally {
      sending = false;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }
</script>

<div class="flex flex-col h-[calc(100vh-8rem)]">
  <!-- Header -->
  <div class="flex items-center gap-3 pb-4 border-b border-[var(--cs-border)]">
    <div class="p-2 rounded-lg bg-[var(--cs-bg-inset)]">
      <Bot size={20} class="text-[var(--cs-primary)]" />
    </div>
    <div>
      <h1 class="text-lg font-semibold text-[var(--cs-text)]">{agent.name}</h1>
      <p class="text-xs text-[var(--cs-text-muted)] capitalize">{agent.agentType} · {agent.modelConfig.chat.split(':').pop()}</p>
    </div>
  </div>

  <!-- Messages -->
  <div class="flex-1 overflow-y-auto py-4 space-y-4">
    {#if messages.length === 0}
      <div class="text-center py-12">
        <Bot size={40} class="mx-auto text-[var(--cs-text-muted)] mb-3" />
        <p class="text-sm text-[var(--cs-text-secondary)]">
          Start a conversation with {agent.name}
        </p>
      </div>
    {/if}

    {#each messages as msg}
      <div class="flex gap-3 {msg.role === 'user' ? 'justify-end' : ''}">
        {#if msg.role === 'assistant'}
          <div class="shrink-0 p-1.5 rounded-full bg-[var(--cs-bg-inset)] h-fit">
            <Bot size={14} class="text-[var(--cs-primary)]" />
          </div>
        {/if}
        <div
          class="max-w-[70%] rounded-lg px-4 py-2.5 text-sm whitespace-pre-wrap
                 {msg.role === 'user'
                   ? 'bg-[var(--cs-primary)] text-[var(--cs-text-on-primary)]'
                   : 'bg-[var(--cs-bg-card)] border border-[var(--cs-border)] text-[var(--cs-text)]'}"
        >
          {msg.content}
        </div>
        {#if msg.role === 'user'}
          <div class="shrink-0 p-1.5 rounded-full bg-[var(--cs-bg-inset)] h-fit">
            <User size={14} class="text-[var(--cs-text-muted)]" />
          </div>
        {/if}
      </div>
    {/each}

    {#if sending}
      <div class="flex gap-3">
        <div class="shrink-0 p-1.5 rounded-full bg-[var(--cs-bg-inset)]">
          <Bot size={14} class="text-[var(--cs-primary)] animate-pulse" />
        </div>
        <div class="bg-[var(--cs-bg-card)] border border-[var(--cs-border)] rounded-lg px-4 py-2.5 text-sm text-[var(--cs-text-muted)]">
          Thinking...
        </div>
      </div>
    {/if}
  </div>

  {#if error}
    <div class="px-4 py-2 text-sm text-[var(--color-danger-600)] bg-[var(--color-danger-50)] rounded-md mb-2">
      {error}
    </div>
  {/if}

  <!-- Input -->
  <div class="border-t border-[var(--cs-border)] pt-4">
    <div class="flex gap-2">
      <textarea
        bind:value={messageInput}
        onkeydown={handleKeydown}
        placeholder="Type a message..."
        rows={1}
        disabled={sending}
        class="flex-1 cs-input cs-input-focus resize-none text-sm py-2.5 px-3"
      ></textarea>
      <button
        onclick={sendMessage}
        disabled={!messageInput.trim() || sending}
        class="px-3 py-2 rounded-md bg-[var(--cs-primary)] text-[var(--cs-text-on-primary)]
               hover:bg-[var(--cs-primary-hover)] disabled:opacity-50 cs-transition"
      >
        <Send size={16} />
      </button>
    </div>
  </div>
</div>
