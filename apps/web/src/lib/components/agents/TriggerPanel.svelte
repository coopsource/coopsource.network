<script lang="ts">
  import Plus from '@lucide/svelte/icons/plus';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Zap from '@lucide/svelte/icons/zap';
  import X from '@lucide/svelte/icons/x';
  import { createApiClient } from '$lib/api/client.js';
  import type { AgentTrigger, TriggerExecution } from '$lib/api/types.js';
  import { timeAgo } from '$lib/utils/time.js';
  import { env } from '$env/dynamic/public';

  interface Props {
    agentId: string;
    triggers: AgentTrigger[];
  }

  let { agentId, triggers = $bindable() }: Props = $props();

  const EVENT_TYPES = [
    'member.joined',
    'member.departed',
    'proposal.opened',
    'proposal.closed',
    'proposal.resolved',
    'vote.cast',
    'vote.retracted',
    'agreement.created',
    'agreement.opened',
    'agreement.activated',
    'agreement.signed',
    'agreement.voided',
    'stakeholderTerms.added',
    'alignment.interest.submitted',
    'alignment.interest.updated',
    'alignment.outcome.created',
    'alignment.outcome.supported',
    'connection.connected',
    'connection.disconnected',
    'connection.resource.bound',
    'notification.created',
  ];

  const OPERATORS = ['eq', 'neq', 'contains', 'gt', 'lt'];
  const ACTION_TYPES = ['agent_message', 'call_webhook', 'notify'];

  // Form state
  let showForm = $state(false);
  let formEventType = $state(EVENT_TYPES[0]);
  let formConditions = $state<Array<{ field: string; operator: string; value: string }>>([]);
  let formActions = $state<Array<{ type: string; config: Record<string, string> }>>([]);
  let formPromptTemplate = $state('');
  let formCooldown = $state(60);
  let formEnabled = $state(true);
  let saving = $state(false);
  let formError = $state<string | null>(null);

  // Expansion/execution log state
  let expandedId = $state<string | null>(null);
  let executions = $state<Record<string, TriggerExecution[]>>({});
  let loadingExecs = $state<Record<string, boolean>>({});

  function resetForm() {
    formEventType = EVENT_TYPES[0];
    formConditions = [];
    formActions = [];
    formPromptTemplate = '';
    formCooldown = 60;
    formEnabled = true;
    formError = null;
  }

  function addCondition() {
    formConditions = [...formConditions, { field: '', operator: 'eq', value: '' }];
  }

  function removeCondition(index: number) {
    formConditions = formConditions.filter((_, i) => i !== index);
  }

  function addAction() {
    formActions = [...formActions, { type: 'notify', config: {} }];
  }

  function removeAction(index: number) {
    formActions = formActions.filter((_, i) => i !== index);
  }

  async function createTrigger() {
    saving = true;
    formError = null;
    try {
      const api = createApiClient(fetch, undefined, env.PUBLIC_API_URL);
      const body: Record<string, unknown> = {
        eventType: formEventType,
        cooldownSeconds: formCooldown,
        enabled: formEnabled,
      };
      if (formConditions.length > 0) {
        body.conditions = formConditions.map((c) => ({
          field: c.field,
          operator: c.operator,
          value: c.value,
        }));
      }
      if (formActions.length > 0) {
        body.actions = formActions.map((a) => ({
          type: a.type,
          config: a.type === 'agent_message'
            ? { promptTemplate: a.config.promptTemplate ?? '' }
            : a.type === 'call_webhook'
              ? { url: a.config.url ?? '' }
              : { title: a.config.title ?? '', body: a.config.body ?? '' },
        }));
      }
      if (formPromptTemplate.trim()) {
        body.promptTemplate = formPromptTemplate;
      }
      const trigger = await api.createAgentTrigger(agentId, body as Parameters<typeof api.createAgentTrigger>[1]);
      triggers = [...triggers, trigger];
      showForm = false;
      resetForm();
    } catch (err) {
      formError = err instanceof Error ? err.message : 'Failed to create trigger';
    } finally {
      saving = false;
    }
  }

  async function toggleEnabled(trigger: AgentTrigger) {
    try {
      const api = createApiClient(fetch, undefined, env.PUBLIC_API_URL);
      const updated = await api.updateAgentTrigger(trigger.id, { enabled: !trigger.enabled });
      triggers = triggers.map((t) => (t.id === trigger.id ? updated : t));
    } catch {
      // silently fail
    }
  }

  async function deleteTrigger(id: string) {
    try {
      const api = createApiClient(fetch, undefined, env.PUBLIC_API_URL);
      await api.deleteAgentTrigger(id);
      triggers = triggers.filter((t) => t.id !== id);
    } catch {
      // silently fail
    }
  }

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      expandedId = null;
      return;
    }
    expandedId = id;
    if (!executions[id]) {
      loadingExecs = { ...loadingExecs, [id]: true };
      try {
        const api = createApiClient(fetch, undefined, env.PUBLIC_API_URL);
        const result = await api.getTriggerExecutions(id, { limit: 10 });
        executions = { ...executions, [id]: result.executions };
      } catch {
        executions = { ...executions, [id]: [] };
      } finally {
        loadingExecs = { ...loadingExecs, [id]: false };
      }
    }
  }

  function actionsSummary(trigger: AgentTrigger): string {
    if (trigger.actions.length === 0) return 'prompt template';
    return trigger.actions.map((a) => a.type.replace('_', ' ')).join(', ');
  }
</script>

<div>
  <!-- Header -->
  <div class="flex items-center justify-between mb-4">
    <h2 class="text-sm font-semibold text-[var(--cs-text)]">Event Triggers</h2>
    <button
      type="button"
      onclick={() => { showForm = !showForm; if (!showForm) resetForm(); }}
      class="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium rounded-[var(--radius-sm)] bg-[var(--cs-primary)] text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] cs-transition cursor-pointer"
    >
      <Plus class="h-3.5 w-3.5" />
      New Trigger
    </button>
  </div>

  <!-- Create form -->
  {#if showForm}
    <div class="mb-4 p-4 border border-[var(--cs-border)] rounded-[var(--radius-md)] bg-[var(--cs-bg-card)]">
      <div class="space-y-3">
        <!-- Event type -->
        <div>
          <label for="trigger-event" class="block text-[12px] font-medium text-[var(--cs-text-secondary)] mb-1">Event Type</label>
          <select
            id="trigger-event"
            bind:value={formEventType}
            class="w-full cs-input text-[13px] py-1.5 px-2"
          >
            {#each EVENT_TYPES as et}
              <option value={et}>{et}</option>
            {/each}
          </select>
        </div>

        <!-- Conditions -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <span class="text-[12px] font-medium text-[var(--cs-text-secondary)]">Conditions</span>
            <button type="button" onclick={addCondition} class="text-[11px] text-[var(--cs-primary)] hover:underline cursor-pointer">+ Add</button>
          </div>
          {#each formConditions as cond, i}
            <div class="flex items-center gap-1.5 mb-1.5">
              <input
                type="text"
                bind:value={cond.field}
                placeholder="field"
                class="flex-1 cs-input text-[12px] py-1 px-2"
              />
              <select bind:value={cond.operator} class="cs-input text-[12px] py-1 px-1.5 w-20">
                {#each OPERATORS as op}
                  <option value={op}>{op}</option>
                {/each}
              </select>
              <input
                type="text"
                bind:value={cond.value}
                placeholder="value"
                class="flex-1 cs-input text-[12px] py-1 px-2"
              />
              <button type="button" onclick={() => removeCondition(i)} class="p-1 text-[var(--cs-text-muted)] hover:text-[var(--color-danger)] cursor-pointer">
                <X class="h-3.5 w-3.5" />
              </button>
            </div>
          {/each}
        </div>

        <!-- Actions -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <span class="text-[12px] font-medium text-[var(--cs-text-secondary)]">Actions</span>
            <button type="button" onclick={addAction} class="text-[11px] text-[var(--cs-primary)] hover:underline cursor-pointer">+ Add</button>
          </div>
          {#each formActions as action, i}
            <div class="mb-2 p-2 border border-[var(--cs-border)] rounded-[var(--radius-sm)] bg-[var(--cs-bg-inset)]">
              <div class="flex items-center gap-1.5 mb-1.5">
                <select bind:value={action.type} class="cs-input text-[12px] py-1 px-1.5 flex-1">
                  {#each ACTION_TYPES as at}
                    <option value={at}>{at.replace('_', ' ')}</option>
                  {/each}
                </select>
                <button type="button" onclick={() => removeAction(i)} class="p-1 text-[var(--cs-text-muted)] hover:text-[var(--color-danger)] cursor-pointer">
                  <X class="h-3.5 w-3.5" />
                </button>
              </div>
              {#if action.type === 'agent_message'}
                <textarea
                  bind:value={action.config.promptTemplate}
                  placeholder="Prompt template..."
                  rows={2}
                  class="w-full cs-input text-[12px] py-1 px-2 resize-none"
                ></textarea>
              {:else if action.type === 'call_webhook'}
                <input
                  type="url"
                  bind:value={action.config.url}
                  placeholder="https://..."
                  class="w-full cs-input text-[12px] py-1 px-2"
                />
              {:else if action.type === 'notify'}
                <input
                  type="text"
                  bind:value={action.config.title}
                  placeholder="Notification title"
                  class="w-full cs-input text-[12px] py-1 px-2 mb-1"
                />
                <input
                  type="text"
                  bind:value={action.config.body}
                  placeholder="Notification body"
                  class="w-full cs-input text-[12px] py-1 px-2"
                />
              {/if}
            </div>
          {/each}
        </div>

        <!-- Prompt template (fallback when no actions) -->
        {#if formActions.length === 0}
          <div>
            <label for="trigger-prompt" class="block text-[12px] font-medium text-[var(--cs-text-secondary)] mb-1">Prompt Template</label>
            <textarea
              id="trigger-prompt"
              bind:value={formPromptTemplate}
              placeholder="Template sent to agent when triggered..."
              rows={3}
              class="w-full cs-input text-[12px] py-1.5 px-2 resize-none"
            ></textarea>
          </div>
        {/if}

        <!-- Cooldown + Enabled -->
        <div class="flex items-center gap-4">
          <div class="flex-1">
            <label for="trigger-cooldown" class="block text-[12px] font-medium text-[var(--cs-text-secondary)] mb-1">Cooldown (seconds)</label>
            <input
              id="trigger-cooldown"
              type="number"
              bind:value={formCooldown}
              min={0}
              class="w-full cs-input text-[12px] py-1 px-2"
            />
          </div>
          <label class="flex items-center gap-2 mt-4 cursor-pointer">
            <input type="checkbox" bind:checked={formEnabled} class="accent-[var(--cs-primary)]" />
            <span class="text-[12px] text-[var(--cs-text-secondary)]">Enabled</span>
          </label>
        </div>

        {#if formError}
          <div class="px-3 py-2 text-[12px] text-[var(--color-danger)] bg-[var(--color-danger-light)] rounded-[var(--radius-sm)]">
            {formError}
          </div>
        {/if}

        <!-- Submit -->
        <div class="flex items-center gap-2 pt-1">
          <button
            type="button"
            onclick={createTrigger}
            disabled={saving}
            class="px-3 py-1.5 text-[12px] font-medium rounded-[var(--radius-sm)] bg-[var(--cs-primary)] text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50 cs-transition cursor-pointer"
          >
            {saving ? 'Creating...' : 'Create Trigger'}
          </button>
          <button
            type="button"
            onclick={() => { showForm = false; resetForm(); }}
            class="px-3 py-1.5 text-[12px] text-[var(--cs-text-muted)] hover:text-[var(--cs-text-secondary)] cs-transition cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Trigger list -->
  {#if triggers.length === 0 && !showForm}
    <div class="text-center py-12">
      <Zap size={40} class="mx-auto text-[var(--cs-text-muted)] mb-3" />
      <p class="text-sm text-[var(--cs-text-secondary)]">No triggers configured</p>
      <p class="text-xs text-[var(--cs-text-muted)] mt-1">Create a trigger to automate responses to events</p>
    </div>
  {:else}
    <div class="flex flex-col gap-2">
      {#each triggers as trigger}
        <div class="border border-[var(--cs-border)] rounded-[var(--radius-md)] bg-[var(--cs-bg-card)] overflow-hidden">
          <!-- Trigger header -->
          <div class="flex items-center gap-3 px-4 py-3">
            <button
              type="button"
              onclick={() => toggleExpand(trigger.id)}
              class="shrink-0 text-[var(--cs-text-muted)] hover:text-[var(--cs-text)] cursor-pointer"
            >
              {#if expandedId === trigger.id}
                <ChevronDown class="h-4 w-4" />
              {:else}
                <ChevronRight class="h-4 w-4" />
              {/if}
            </button>

            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="text-[13px] font-medium text-[var(--cs-text)]">{trigger.eventType}</span>
                {#if trigger.conditions.length > 0}
                  <span class="text-[11px] text-[var(--cs-text-muted)] bg-[var(--cs-bg-inset)] px-1.5 py-0.5 rounded">
                    {trigger.conditions.length} condition{trigger.conditions.length !== 1 ? 's' : ''}
                  </span>
                {/if}
              </div>
              <p class="text-[11px] text-[var(--cs-text-muted)] mt-0.5">{actionsSummary(trigger)}</p>
            </div>

            <!-- Toggle enabled -->
            <label class="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={trigger.enabled}
                onchange={() => toggleEnabled(trigger)}
                class="sr-only peer"
              />
              <div class="w-8 h-4 bg-[var(--cs-bg-inset)] peer-focus:outline-none rounded-full peer peer-checked:bg-[var(--cs-primary)] cs-transition after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-4"></div>
            </label>

            <!-- Delete -->
            <button
              type="button"
              onclick={() => deleteTrigger(trigger.id)}
              class="shrink-0 p-1 text-[var(--cs-text-muted)] hover:text-[var(--color-danger)] cs-transition cursor-pointer"
            >
              <Trash2 class="h-3.5 w-3.5" />
            </button>
          </div>

          <!-- Expanded: execution log -->
          {#if expandedId === trigger.id}
            <div class="border-t border-[var(--cs-border)] px-4 py-3 bg-[var(--cs-bg-inset)]">
              <h3 class="text-[12px] font-medium text-[var(--cs-text-secondary)] mb-2">Recent Executions</h3>
              {#if loadingExecs[trigger.id]}
                <p class="text-[12px] text-[var(--cs-text-muted)]">Loading...</p>
              {:else if !executions[trigger.id] || executions[trigger.id].length === 0}
                <p class="text-[12px] text-[var(--cs-text-muted)]">No executions yet</p>
              {:else}
                <div class="overflow-x-auto">
                  <table class="w-full text-[12px]">
                    <thead>
                      <tr class="text-left text-[var(--cs-text-muted)]">
                        <th class="pb-1 pr-3 font-medium">Status</th>
                        <th class="pb-1 pr-3 font-medium">Event</th>
                        <th class="pb-1 pr-3 font-medium">Duration</th>
                        <th class="pb-1 font-medium">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each executions[trigger.id] as exec}
                        <tr class="border-t border-[var(--cs-border)]">
                          <td class="py-1.5 pr-3">
                            <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium
                              {exec.status === 'completed'
                                ? 'bg-[var(--color-success-light)] text-[var(--color-success-dark)]'
                                : exec.status === 'failed'
                                  ? 'bg-[var(--color-danger-light)] text-[var(--color-danger-dark)]'
                                  : 'bg-[var(--color-warning-light)] text-[var(--color-warning-dark)]'}">
                              {exec.status}
                            </span>
                          </td>
                          <td class="py-1.5 pr-3 text-[var(--cs-text)]">{exec.eventType}</td>
                          <td class="py-1.5 pr-3 text-[var(--cs-text-muted)]">{exec.durationMs != null ? `${exec.durationMs}ms` : '-'}</td>
                          <td class="py-1.5 text-[var(--cs-text-muted)]">{timeAgo(exec.startedAt)}</td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
