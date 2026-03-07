/**
 * Relay firehose consumer for ATProto relay WebSocket.
 *
 * Connects to a relay (e.g. bsky.network), filters for configured collection
 * prefixes, and yields FirehoseEvent objects. Uses a two-pass decode: first a
 * lightweight decode to check collection prefixes, then a full CAR decode only
 * for matching events.
 */
import type { FirehoseEvent } from '@coopsource/federation';
import {
  decodeFirehoseMessage,
  decodeFirehoseMessageWithRecords,
} from '@coopsource/federation';
import { logger } from '../middleware/logger.js';
import { collectionFromUri } from './utils.js';

export interface RelayConsumerConfig {
  relayUrl: string;
  collectionPrefixes: string[];
  cursor?: number;
}

const MAX_BACKOFF_MS = 30_000;
const INITIAL_BACKOFF_MS = 1_000;

/**
 * Subscribe to a relay firehose, yielding only events whose collection
 * matches one of the configured prefixes.
 *
 * Reconnects automatically with exponential backoff on disconnect.
 */
export async function* subscribeRelay(
  config: RelayConsumerConfig,
): AsyncIterable<FirehoseEvent> {
  let cursor = config.cursor ?? 0;
  let backoff = INITIAL_BACKOFF_MS;

  while (true) {
    try {
      const stream = connectRelayWebSocket(config.relayUrl, cursor);

      for await (const { raw, events: lightEvents } of stream) {
        // Pass 1: Check if any op matches our collection prefixes
        const hasMatch = lightEvents.some((e) => {
          const collection = collectionFromUri(e.uri);
          return config.collectionPrefixes.some((prefix) =>
            collection.startsWith(prefix),
          );
        });

        if (!hasMatch) {
          // Update cursor but skip expensive decode
          if (lightEvents.length > 0) {
            cursor = lightEvents[0]!.seq;
          }
          continue;
        }

        // Pass 2: Full decode with CAR block parsing for record content
        const fullEvents = await decodeFirehoseMessageWithRecords(raw);

        for (const event of fullEvents) {
          const collection = collectionFromUri(event.uri);
          if (
            config.collectionPrefixes.some((prefix) =>
              collection.startsWith(prefix),
            )
          ) {
            cursor = event.seq;
            backoff = INITIAL_BACKOFF_MS;
            yield event;
          }
        }
      }
    } catch (err) {
      logger.warn({ err, backoff, cursor }, 'Relay connection lost, reconnecting');
      await new Promise((resolve) => setTimeout(resolve, backoff));
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    }
  }
}

interface RawFrame {
  raw: Uint8Array;
  events: FirehoseEvent[];
}

/**
 * Low-level WebSocket connection to a relay endpoint.
 * Yields raw frames paired with lightweight-decoded events (no CAR parsing).
 */
async function* connectRelayWebSocket(
  relayUrl: string,
  cursor: number,
): AsyncIterable<RawFrame> {
  const endpoint = `${relayUrl}/xrpc/com.atproto.sync.subscribeRepos?cursor=${cursor}`;
  const ws = new WebSocket(endpoint);

  const queue: RawFrame[] = [];
  let resolve: (() => void) | null = null;
  let closed = false;
  let wsError: Error | null = null;

  ws.binaryType = 'arraybuffer';

  ws.addEventListener('message', (msg) => {
    try {
      const raw = new Uint8Array(msg.data as ArrayBuffer);
      const events = decodeFirehoseMessage(raw);
      queue.push({ raw, events });
      resolve?.();
      resolve = null;
    } catch {
      // Skip malformed messages
    }
  });

  ws.addEventListener('close', () => {
    closed = true;
    resolve?.();
    resolve = null;
  });

  ws.addEventListener('error', (e) => {
    wsError = new Error(`Relay WebSocket error: ${String(e)}`);
    closed = true;
    resolve?.();
    resolve = null;
  });

  // Wait for connection to open
  await new Promise<void>((res, rej) => {
    ws.addEventListener('open', () => res());
    ws.addEventListener('error', () =>
      rej(new Error('Relay WebSocket connection failed')),
    );
  });

  logger.info({ relayUrl, cursor }, 'Connected to relay');

  try {
    while (!closed || queue.length > 0) {
      if (queue.length > 0) {
        yield queue.shift()!;
      } else if (!closed) {
        await new Promise<void>((r) => {
          resolve = r;
        });
      }
    }
    if (wsError) throw wsError;
  } finally {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  }
}
