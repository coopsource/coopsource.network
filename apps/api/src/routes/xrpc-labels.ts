import { Router, type Request, type Response } from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import type { Server } from 'node:http';
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { LabelSubscriptionManager, ATProtoLabel } from '../services/label-subscription.js';
import { asyncHandler } from '../lib/async-handler.js';
import { logger } from '../middleware/logger.js';

/**
 * Convert a governance_label row to an ATProto-compliant label object.
 */
function rowToAtprotoLabel(row: {
  src_did: string;
  subject_uri: string;
  subject_cid: string | null;
  label_value: string;
  neg: boolean;
  created_at: Date | string;
}): ATProtoLabel {
  return {
    ver: 1,
    src: row.src_did,
    uri: row.subject_uri,
    cid: row.subject_cid ?? undefined,
    val: row.label_value,
    neg: row.neg,
    cts: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : new Date(row.created_at).toISOString(),
  };
}

/**
 * GET /xrpc/com.atproto.label.queryLabels
 */
export function createXrpcLabelRoutes(db: Kysely<Database>): Router {
  const router = Router();

  router.get(
    '/xrpc/com.atproto.label.queryLabels',
    asyncHandler(async (req: Request, res: Response) => {
      const uriPatterns = asArray(req.query.uriPatterns);
      const sources = asArray(req.query.sources);
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 250);
      const cursor = req.query.cursor as string | undefined;

      let query = db
        .selectFrom('governance_label')
        .orderBy('seq', 'asc')
        .limit(limit + 1)
        .selectAll();

      if (cursor) {
        query = query.where('seq', '>', Number(cursor));
      }

      if (sources.length > 0) {
        query = query.where('src_did', 'in', sources);
      }

      if (uriPatterns.length > 0) {
        query = query.where((eb) =>
          eb.or(
            uriPatterns.map((pattern) => {
              if (pattern.includes('*')) {
                return eb('subject_uri', 'like', pattern.replace(/\*/g, '%'));
              }
              return eb('subject_uri', '=', pattern);
            }),
          ),
        );
      }

      const rows = await query.execute();

      const hasMore = rows.length > limit;
      const results = hasMore ? rows.slice(0, limit) : rows;
      const labels = results.map(rowToAtprotoLabel);
      const nextCursor = hasMore && results.length > 0
        ? String(results[results.length - 1]!.seq)
        : undefined;

      res.json({
        cursor: nextCursor,
        labels,
      });
    }),
  );

  return router;
}

/** Extract array query params (handles both `?a=x&a=y` and `?a[]=x`). */
function asArray(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(String);
  return [String(val)];
}

/**
 * Attach WebSocket server for com.atproto.label.subscribeLabels.
 * Returns the WebSocketServer so it can be closed during shutdown.
 */
export function setupLabelWebSocket(
  server: Server,
  subscriptionManager: LabelSubscriptionManager,
): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '', `http://${request.headers.host}`);

    if (url.pathname !== '/xrpc/com.atproto.label.subscribeLabels') {
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
      const cursorParam = url.searchParams.get('cursor');
      const cursor = cursorParam !== null ? Number(cursorParam) : undefined;

      if (cursor !== undefined && Number.isNaN(cursor)) {
        ws.close(1003, 'Invalid cursor parameter');
        return;
      }

      subscriptionManager.handleSubscription(ws, cursor).catch((err) => {
        logger.error({ err }, 'Label subscription error');
        ws.close(1011, 'Internal error');
      });
    });
  });

  logger.info('Label WebSocket endpoint registered at /xrpc/com.atproto.label.subscribeLabels');
  return wss;
}
