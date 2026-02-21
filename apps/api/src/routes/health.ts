import { Router } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import { sql } from 'kysely';

export function createHealthRoutes(db?: Kysely<Database>): Router {
  const router = Router();

  router.get('/health', async (_req, res) => {
    const status: Record<string, unknown> = {
      status: 'ok',
      version: '0.1.0',
      uptime: process.uptime(),
    };

    if (db) {
      try {
        await sql`SELECT 1`.execute(db);
        status.database = 'connected';
      } catch {
        res.status(503).json({
          ...status,
          status: 'degraded',
          database: 'disconnected',
        });
        return;
      }
    }

    res.json(status);
  });

  return router;
}
