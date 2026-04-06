// apps/api/src/services/label-subscription.ts
import { EventEmitter } from 'node:events';
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { WebSocket } from 'ws';
import * as dagCbor from '@ipld/dag-cbor';
import { logger } from '../middleware/logger.js';

/** ATProto label format (com.atproto.label.defs#label). */
export interface ATProtoLabel {
  ver: number;
  src: string;
  uri: string;
  cid?: string;
  val: string;
  neg: boolean;
  cts: string;
  exp?: string;
  sig?: Uint8Array;
}

const MAX_CLIENTS = 100;
const KEEPALIVE_MS = 60_000;
const IDLE_TIMEOUT_MS = 300_000;

/**
 * Manages real-time label subscriptions over WebSocket.
 *
 * Bridges GovernanceLabeler writes to connected clients using DAG-CBOR
 * encoded frames per the ATProto subscription protocol.
 */
export class LabelSubscriptionManager {
  private emitter = new EventEmitter();
  private clients = new Set<WebSocket>();

  constructor(private db: Kysely<Database>) {}

  /** Called by GovernanceLabeler after inserting a label. */
  notifyNewLabel(seq: number, label: ATProtoLabel): void {
    this.emitter.emit('label', { seq, label });
  }

  /** Handle a new WebSocket subscriber. Replays from cursor, then streams real-time. */
  async handleSubscription(ws: WebSocket, cursor?: number): Promise<void> {
    if (this.clients.size >= MAX_CLIENTS) {
      const info = this.encodeInfoFrame('TooManySubscribers', 'Maximum subscriber limit reached');
      ws.send(info);
      ws.close(1013, 'Too many subscribers');
      return;
    }

    this.clients.add(ws);

    // Replay from cursor if provided
    if (cursor !== undefined) {
      try {
        const rows = await this.db
          .selectFrom('governance_label')
          .where('seq', '>', cursor)
          .orderBy('seq', 'asc')
          .selectAll()
          .execute();

        for (const row of rows) {
          const label: ATProtoLabel = {
            ver: 1,
            src: row.src_did,
            uri: row.subject_uri,
            cid: row.subject_cid ?? undefined,
            val: row.label_value,
            neg: row.neg,
            cts: (row.created_at as Date).toISOString(),
          };
          const frame = this.encodeLabelsFrame(Number(row.seq), [label]);
          ws.send(frame);
        }
      } catch (err) {
        logger.warn({ err }, 'Failed to replay labels from cursor');
        const info = this.encodeInfoFrame('OutdatedCursor', 'Cursor replay failed');
        ws.send(info);
      }
    }

    // Real-time listener
    const onLabel = ({ seq, label }: { seq: number; label: ATProtoLabel }) => {
      if (ws.readyState === ws.OPEN) {
        const frame = this.encodeLabelsFrame(seq, [label]);
        ws.send(frame);
      }
    };
    this.emitter.on('label', onLabel);

    // Keepalive ping
    const keepalive = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        ws.ping();
      }
    }, KEEPALIVE_MS);

    // Idle timeout
    const idleTimer = setTimeout(() => {
      if (ws.readyState === ws.OPEN) {
        ws.close(1000, 'Idle timeout');
      }
    }, IDLE_TIMEOUT_MS);

    // Refresh idle timer on pong
    ws.on('pong', () => {
      idleTimer.refresh();
    });

    // Cleanup on close
    ws.on('close', () => {
      this.emitter.off('label', onLabel);
      this.clients.delete(ws);
      clearInterval(keepalive);
      clearTimeout(idleTimer);
    });

    ws.on('error', () => {
      this.emitter.off('label', onLabel);
      this.clients.delete(ws);
      clearInterval(keepalive);
      clearTimeout(idleTimer);
    });
  }

  /** Encode a #labels frame (header + body as two concatenated DAG-CBOR values). */
  encodeLabelsFrame(seq: number, labels: ATProtoLabel[]): Uint8Array {
    const header = dagCbor.encode({ op: 1, t: '#labels' });
    const body = dagCbor.encode({ seq, labels });
    const frame = new Uint8Array(header.length + body.length);
    frame.set(new Uint8Array(header), 0);
    frame.set(new Uint8Array(body), header.length);
    return frame;
  }

  /** Encode an #info frame. */
  private encodeInfoFrame(name: string, message: string): Uint8Array {
    const header = dagCbor.encode({ op: 1, t: '#info' });
    const body = dagCbor.encode({ name, message });
    const frame = new Uint8Array(header.length + body.length);
    frame.set(new Uint8Array(header), 0);
    frame.set(new Uint8Array(body), header.length);
    return frame;
  }

  get subscriberCount(): number {
    return this.clients.size;
  }
}
