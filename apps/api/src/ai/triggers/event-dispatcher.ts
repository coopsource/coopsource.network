import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import { sseEmitter, type AppEvent } from '../../appview/sse.js';
import type { ChatEngine } from '../chat-engine.js';
import type { TriggerCondition, TriggerAction } from './types.js';
import { evaluateConditions } from './condition-evaluator.js';
import { executeAction, type ActionResult } from './action-executor.js';

/**
 * Listens for platform events and dispatches them to matching agent triggers.
 *
 * When an event fires, the dispatcher:
 * 1. Queries agent_trigger for matching (cooperative_did, event_type) rows
 * 2. Checks cooldown (skip if too recent)
 * 3. Evaluates conditions against event data
 * 4. Executes actions (agent_message, call_webhook, notify)
 * 5. Logs execution to trigger_execution_log
 */
export class EventDispatcher {
  private handler: (event: AppEvent) => void;

  constructor(
    private db: Kysely<Database>,
    private chatEngine: ChatEngine,
  ) {
    this.handler = (event: AppEvent) => {
      this.handleEvent(event).catch((err) => {
        console.error('[event-dispatcher] Error handling event:', err);
      });
    };
  }

  start(): void {
    sseEmitter.on('event', this.handler);
  }

  stop(): void {
    sseEmitter.off('event', this.handler);
  }

  private async handleEvent(event: AppEvent): Promise<void> {
    const triggers = await this.db
      .selectFrom('agent_trigger')
      .innerJoin('agent_config', 'agent_config.id', 'agent_trigger.agent_config_id')
      .where('agent_trigger.cooperative_did', '=', event.cooperativeDid)
      .where('agent_trigger.event_type', '=', event.type)
      .where('agent_trigger.enabled', '=', true)
      .where('agent_config.enabled', '=', true)
      .select([
        'agent_trigger.id',
        'agent_trigger.agent_config_id',
        'agent_trigger.cooperative_did',
        'agent_trigger.prompt_template',
        'agent_trigger.conditions',
        'agent_trigger.actions',
        'agent_trigger.cooldown_seconds',
        'agent_trigger.last_triggered_at',
      ])
      .execute();

    const now = new Date();

    for (const trigger of triggers) {
      const startedAt = new Date();

      // Check cooldown
      if (trigger.cooldown_seconds > 0 && trigger.last_triggered_at) {
        const lastTriggered = new Date(trigger.last_triggered_at as unknown as string);
        const elapsed = (now.getTime() - lastTriggered.getTime()) / 1000;
        if (elapsed < trigger.cooldown_seconds) {
          await this.logExecution({
            triggerId: trigger.id as string,
            cooperativeDid: event.cooperativeDid,
            eventType: event.type,
            eventData: event.data,
            conditionsMatched: false,
            actionsExecuted: [],
            status: 'skipped',
            error: 'Cooldown active',
            startedAt,
          });
          continue;
        }
      }

      // Evaluate conditions
      const conditions = this.parseConditions(trigger.conditions);
      const matched = evaluateConditions(conditions, event.data);

      if (!matched) {
        await this.logExecution({
          triggerId: trigger.id as string,
          cooperativeDid: event.cooperativeDid,
          eventType: event.type,
          eventData: event.data,
          conditionsMatched: false,
          actionsExecuted: [],
          status: 'skipped',
          error: 'Conditions not matched',
          startedAt,
        });
        continue;
      }

      // Determine actions to execute
      const rawActions = Array.isArray(trigger.actions) ? trigger.actions : [];
      const actions: TriggerAction[] =
        rawActions.length > 0
          ? (rawActions as TriggerAction[])
          : [{ type: 'agent_message', config: {} }];

      // Execute actions sequentially
      const results: ActionResult[] = [];
      const context = {
        db: this.db,
        chatEngine: this.chatEngine,
        event,
        trigger: {
          id: trigger.id as string,
          agentConfigId: trigger.agent_config_id,
          promptTemplate: trigger.prompt_template,
          cooperativeDid: trigger.cooperative_did,
        },
      };

      for (const action of actions) {
        const result = await executeAction(action, context);
        results.push(result);
      }

      // Update last_triggered_at
      await this.db
        .updateTable('agent_trigger')
        .set({ last_triggered_at: now })
        .where('id', '=', trigger.id as string)
        .execute();

      // Determine overall status
      const hasError = results.some((r) => r.status === 'error');
      const allError = results.every((r) => r.status === 'error');
      let status: string = 'completed';
      if (allError) status = 'failed';
      else if (hasError) status = 'partial';

      await this.logExecution({
        triggerId: trigger.id as string,
        cooperativeDid: event.cooperativeDid,
        eventType: event.type,
        eventData: event.data,
        conditionsMatched: true,
        actionsExecuted: results,
        status,
        error: hasError
          ? results
              .filter((r) => r.error)
              .map((r) => r.error)
              .join('; ')
          : null,
        startedAt,
      });
    }
  }

  /**
   * Parse conditions from DB — handles both [] (new) and {} (legacy empty object) formats.
   */
  private parseConditions(raw: unknown): TriggerCondition[] {
    if (Array.isArray(raw)) return raw as TriggerCondition[];
    if (raw && typeof raw === 'object' && Object.keys(raw as object).length === 0) return [];
    if (!raw) return [];
    return [];
  }

  private async logExecution(params: {
    triggerId: string;
    cooperativeDid: string;
    eventType: string;
    eventData: Record<string, unknown>;
    conditionsMatched: boolean;
    actionsExecuted: ActionResult[];
    status: string;
    error: string | null;
    startedAt: Date;
  }): Promise<void> {
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - params.startedAt.getTime();

    try {
      await this.db
        .insertInto('trigger_execution_log')
        .values({
          trigger_id: params.triggerId,
          cooperative_did: params.cooperativeDid,
          event_type: params.eventType,
          event_data: JSON.stringify(params.eventData),
          conditions_matched: params.conditionsMatched,
          actions_executed: JSON.stringify(params.actionsExecuted),
          status: params.status,
          error: params.error,
          started_at: params.startedAt,
          completed_at: completedAt,
          duration_ms: durationMs,
        })
        .execute();
    } catch (err) {
      console.error('[event-dispatcher] Failed to log execution:', err);
    }
  }
}
