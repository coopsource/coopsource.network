/**
 * Tap WebSocket consumer for firehose events.
 *
 * Tap is an external Go binary that connects to an ATProto relay,
 * filters events by collection prefix, and re-broadcasts them over
 * a WebSocket. This consumer connects to Tap and yields FirehoseEvent
 * objects to the AppView dispatch pipeline.
 *
 * Tap pre-filters events, so no collection prefix check is needed here.
 * Events arrive as JSON with full record content.
 *
 * Activated by TAP_URL env var. Falls back to relay-consumer.ts (RELAY_URL)
 * or local pg_notify if TAP_URL is not set.
 */

import WebSocket from 'ws';
import type { FirehoseEvent } from '@coopsource/federation';
import type { DID, AtUri, CID } from '@coopsource/common';
import { logger } from '../middleware/logger.js';

export interface TapConsumerConfig {
  tapUrl: string;
  cursor?: number;
}

const MAX_BACKOFF_MS = 30_000;

/**
 * Subscribe to a Tap instance and yield pre-filtered FirehoseEvent objects.
 * Reconnects automatically with exponential backoff on disconnection.
 */
export async function* subscribeTap(
  config: TapConsumerConfig,
): AsyncIterable<FirehoseEvent> {
  let backoff = 1000;
  let cursor = config.cursor ?? 0;

  while (true) {
    try {
      const url = cursor > 0
        ? `${config.tapUrl}?cursor=${cursor}`
        : config.tapUrl;

      logger.info({ url }, 'Connecting to Tap');

      const events = connectTapWebSocket(url);

      for await (const event of events) {
        cursor = event.seq;
        backoff = 1000; // Reset on successful event
        yield event;
      }
    } catch (err) {
      logger.warn({ err, backoff }, 'Tap connection lost, reconnecting');
      await new Promise((resolve) => setTimeout(resolve, backoff));
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    }
  }
}

/**
 * Connect to a Tap WebSocket and yield events until disconnection.
 */
async function* connectTapWebSocket(url: string): AsyncIterable<FirehoseEvent> {
  const queue: FirehoseEvent[] = [];
  let wakeResolve: (() => void) | null = null;
  let error: Error | null = null;
  let closed = false;

  const ws = new WebSocket(url);

  ws.on('message', (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString()) as TapMessage;
      const event = tapMessageToFirehoseEvent(msg);
      if (event) {
        queue.push(event);
        wakeResolve?.();
      }
    } catch (err) {
      logger.debug({ err }, 'Failed to parse Tap message');
    }
  });

  ws.on('close', () => {
    closed = true;
    wakeResolve?.();
  });

  ws.on('error', (err: Error) => {
    error = err;
    closed = true;
    wakeResolve?.();
  });

  // Wait for connection
  await new Promise<void>((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  try {
    while (!closed || queue.length > 0) {
      if (queue.length > 0) {
        yield queue.shift()!;
      } else if (closed) {
        break;
      } else {
        await new Promise<void>((resolve) => { wakeResolve = resolve; });
        wakeResolve = null;
      }
    }
  } finally {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  }

  if (error) {
    throw error;
  }
}

// Tap message format (JSON over WebSocket)
interface TapMessage {
  seq: number;
  did: string;
  operation: 'create' | 'update' | 'delete';
  uri: string;
  cid: string;
  record?: Record<string, unknown>;
  time: string;
}

function tapMessageToFirehoseEvent(msg: TapMessage): FirehoseEvent | null {
  if (!msg.seq || !msg.did || !msg.uri) return null;

  return {
    seq: msg.seq,
    did: msg.did as DID,
    operation: msg.operation ?? 'create',
    uri: msg.uri as AtUri,
    cid: (msg.cid ?? '') as CID,
    record: msg.record,
    time: msg.time ?? new Date().toISOString(),
  };
}
