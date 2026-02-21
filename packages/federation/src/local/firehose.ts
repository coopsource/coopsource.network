import pg from 'pg';
import type { FirehoseEvent } from '../types.js';

export interface FirehoseEmitter {
  listen(afterSeq: number): AsyncIterable<FirehoseEvent>;
}

export function createFirehoseEmitter(
  connectionString: string,
): FirehoseEmitter {
  return {
    async *listen(afterSeq: number): AsyncIterable<FirehoseEvent> {
      // Create a dedicated pg.Client (NOT from a pool — LISTEN holds the connection)
      const client = new pg.Client(connectionString);
      await client.connect();
      await client.query('LISTEN pds_firehose');

      const queue: FirehoseEvent[] = [];
      let wakeResolve: (() => void) | null = null;

      client.on('notification', (msg: pg.Notification) => {
        if (!msg.payload) return;
        try {
          const event = JSON.parse(msg.payload) as FirehoseEvent;
          if (event.seq > afterSeq) {
            queue.push(event);
            wakeResolve?.();
            wakeResolve = null;
          }
        } catch {
          /* ignore malformed */
        }
      });

      try {
        while (true) {
          if (queue.length > 0) {
            const event = queue.shift()!;
            afterSeq = event.seq;
            yield event;
          } else {
            await new Promise<void>((resolve) => {
              wakeResolve = resolve;
            });
          }
        }
      } finally {
        client.removeAllListeners();
        await client.end().catch(() => {});
      }
    },
  };
}
