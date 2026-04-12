import { WebSocketServer, type WebSocket } from 'ws';
import type { Server } from 'node:http';
import type { LabelSubscriptionManager } from '../services/label-subscription.js';
import { logger } from '../middleware/logger.js';

// Note: createXrpcLabelRoutes was migrated to apps/api/src/xrpc/handlers/query-labels.ts
// as part of V9.2 (unified XRPC dispatcher). Only the WebSocket handler remains here.

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
