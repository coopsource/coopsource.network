import { EventEmitter } from 'node:events';

export type AppEventType =
  | 'member.joined'
  | 'member.departed'
  | 'proposal.opened'
  | 'proposal.closed'
  | 'proposal.resolved'
  | 'vote.cast'
  | 'vote.retracted'
  | 'agreement.opened'
  | 'agreement.signed'
  | 'agreement.voided';

export interface AppEvent {
  type: AppEventType;
  data: Record<string, unknown>;
  cooperativeDid: string;
}

class SseEmitter extends EventEmitter {}

export const sseEmitter = new SseEmitter();

export function emitAppEvent(event: AppEvent): void {
  sseEmitter.emit('event', event);
}
