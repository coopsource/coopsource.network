import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { sseEmitter, type AppEvent } from '../appview/sse.js';

export function createEventRoutes(): Router {
  const router = Router();

  // GET /api/v1/events (SSE)
  router.get('/api/v1/events', requireAuth, (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.flushHeaders();

    const cooperativeDid = req.actor!.cooperativeDid;

    const listener = (event: AppEvent) => {
      if (event.cooperativeDid === cooperativeDid) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    };

    sseEmitter.on('event', listener);

    // Keepalive every 15s
    const keepalive = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 15_000);

    req.on('close', () => {
      sseEmitter.off('event', listener);
      clearInterval(keepalive);
    });
  });

  return router;
}
