import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import { sseEmitter, type AppEvent } from '../../appview/sse.js';
import type { ChatEngine } from '../chat-engine.js';

/**
 * Listens for platform events and dispatches them to matching agent triggers.
 *
 * When an event fires, the dispatcher:
 * 1. Queries agent_trigger for matching (cooperative_did, event_type) rows
 * 2. Checks cooldown (skip if too recent)
 * 3. Creates a system session and sends the event as a message via ChatEngine
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
        'agent_trigger.prompt_template',
        'agent_trigger.cooldown_seconds',
        'agent_trigger.last_triggered_at',
      ])
      .execute();

    const now = new Date();

    for (const trigger of triggers) {
      // Check cooldown
      if (trigger.cooldown_seconds > 0 && trigger.last_triggered_at) {
        const lastTriggered = new Date(trigger.last_triggered_at as unknown as string);
        const elapsed = (now.getTime() - lastTriggered.getTime()) / 1000;
        if (elapsed < trigger.cooldown_seconds) continue;
      }

      // Build the message from the prompt template
      const message = this.buildMessage(
        trigger.prompt_template,
        event,
      );

      // Fire and forget — autonomous agent call
      this.chatEngine
        .send({
          agentId: trigger.agent_config_id,
          userDid: 'system',
          cooperativeDid: event.cooperativeDid,
          message,
          taskType: 'automation',
        })
        .then(async () => {
          // Update last_triggered_at
          await this.db
            .updateTable('agent_trigger')
            .set({ last_triggered_at: now })
            .where('id', '=', trigger.id as string)
            .execute();
        })
        .catch((err) => {
          console.error(
            `[event-dispatcher] Trigger ${trigger.id} failed:`,
            err instanceof Error ? err.message : err,
          );
        });
    }
  }

  private buildMessage(template: string, event: AppEvent): string {
    // Simple template substitution: {{event_type}}, {{event_data}}
    return template
      .replace(/\{\{event_type\}\}/g, event.type)
      .replace(/\{\{event_data\}\}/g, JSON.stringify(event.data));
  }
}
