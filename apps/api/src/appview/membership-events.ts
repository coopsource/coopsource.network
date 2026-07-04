import { emitAppEvent } from './sse.js';

/**
 * Emit membership-lifecycle SSE events (consumed by webhooks, agent triggers,
 * and live dashboards). Call once per logical join/departure, AFTER the
 * mutation has committed — never inside an open transaction, which may roll
 * back. The V11 membership rewrite dropped the V9 indexers that used to emit
 * these; these helpers restore emission at the write path.
 */
export function emitMemberJoined(cooperativeDid: string, memberDid: string): void {
  emitAppEvent({
    type: 'member.joined',
    data: { did: memberDid },
    cooperativeDid,
  });
}

export function emitMemberDeparted(cooperativeDid: string, memberDid: string): void {
  emitAppEvent({
    type: 'member.departed',
    data: { did: memberDid },
    cooperativeDid,
  });
}
