import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { ChatEngine } from '../chat-engine.js';
import type { AppEvent } from '../../appview/sse.js';
import { emitAppEvent } from '../../appview/sse.js';
import type { TriggerAction } from './types.js';
import { fetchOutbound } from '../../utils/url-validation.js';
import type { MembershipReadModel } from '../../services/membership-read-model.js';
import type { DID } from '@coopsource/common';

export interface ActionResult {
  type: string;
  status: 'success' | 'error';
  error?: string;
  durationMs: number;
}

export interface ActionContext {
  db: Kysely<Database>;
  membershipReadModel: MembershipReadModel;
  chatEngine: ChatEngine;
  event: AppEvent;
  trigger: {
    id: string;
    agentConfigId: string;
    promptTemplate: string | null;
    cooperativeDid: string;
  };
}

/**
 * Simple template substitution: {{event_type}}, {{event_data}}.
 * Moved from EventDispatcher to be shared by agent_message action.
 */
export function buildMessage(template: string, event: AppEvent): string {
  return template
    .replace(/\{\{event_type\}\}/g, event.type)
    .replace(/\{\{event_data\}\}/g, JSON.stringify(event.data));
}

/**
 * Execute a single trigger action and return the result.
 */
export async function executeAction(
  action: TriggerAction,
  context: ActionContext,
): Promise<ActionResult> {
  const start = Date.now();

  try {
    switch (action.type) {
      case 'agent_message':
        await executeAgentMessage(action, context);
        break;
      case 'call_webhook':
        await executeWebhook(action, context);
        break;
      case 'notify':
        await executeNotify(action, context);
        break;
      case 'run_script':
        await executeRunScript(action, context);
        break;
      default:
        throw new Error(
          `Unknown action type: ${(action as TriggerAction).type}`,
        );
    }

    return {
      type: action.type,
      status: 'success',
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      type: action.type,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}

async function executeAgentMessage(
  action: TriggerAction,
  context: ActionContext,
): Promise<void> {
  const template =
    (action.config.promptTemplate as string | undefined) ??
    context.trigger.promptTemplate;

  if (!template) {
    throw new Error('agent_message action requires a prompt template');
  }

  const message = buildMessage(template, context.event);

  await context.chatEngine.send({
    agentId: context.trigger.agentConfigId,
    userDid: 'system',
    cooperativeDid: context.trigger.cooperativeDid,
    message,
    taskType: 'automation',
  });
}

async function executeWebhook(
  action: TriggerAction,
  context: ActionContext,
): Promise<void> {
  const url = action.config.url as string | undefined;
  if (!url) {
    throw new Error('call_webhook action requires config.url');
  }

  const payload = {
    event: context.event.type,
    data: context.event.data,
    cooperativeDid: context.event.cooperativeDid,
    triggerId: context.trigger.id,
    timestamp: new Date().toISOString(),
  };

  // SSRF protection: the destination and its DNS answer are checked, and a
  // redirect is refused rather than followed (audit S-08).
  const res = await fetchOutbound(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  // Always consume the response body to prevent connection pool exhaustion
  const body = await res.text();

  if (!res.ok) {
    throw new Error(`Webhook returned ${res.status}: ${body.slice(0, 200)}`);
  }
}

async function executeRunScript(
  action: TriggerAction,
  context: ActionContext,
): Promise<void> {
  const scriptId = action.config.scriptId as string | undefined;
  if (!scriptId) {
    throw new Error('run_script action requires config.scriptId');
  }

  // ScriptService is not available in ActionContext — emit a domain event
  // that the script's domain-event listener will pick up
  emitAppEvent({
    type: 'notification.created' as AppEvent['type'],
    data: {
      _trigger: 'run_script',
      scriptId,
      triggerId: context.trigger.id,
      event: context.event.type,
      eventData: context.event.data,
    },
    cooperativeDid: context.trigger.cooperativeDid,
  });
}

async function executeNotify(
  action: TriggerAction,
  context: ActionContext,
): Promise<void> {
  const title =
    (action.config.title as string | undefined) ??
    `Event: ${context.event.type}`;
  const body = (action.config.body as string | undefined) ?? null;

  let recipientDids = action.config.recipientDids as string[] | undefined;

  // If no recipients specified, notify all active members
  if (!recipientDids || recipientDids.length === 0) {
    recipientDids = [
      ...(await context.membershipReadModel.listProjectedActiveMemberDids(
        context.trigger.cooperativeDid as DID,
      )),
    ];
  }

  if (recipientDids.length === 0) return;

  // Batch insert notifications
  const rows = recipientDids.map((did) => ({
    cooperative_did: context.trigger.cooperativeDid,
    recipient_did: did,
    title,
    body,
    category: 'automation' as const,
    source_type: 'trigger' as const,
    source_id: context.trigger.id,
  }));

  await context.db.insertInto('notification').values(rows).execute();

  // Emit SSE event for each recipient
  for (const did of recipientDids) {
    emitAppEvent({
      type: 'notification.created',
      data: { recipientDid: did, title },
      cooperativeDid: context.trigger.cooperativeDid,
    });
  }
}
