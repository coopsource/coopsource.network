import { Router } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import { sql } from 'kysely';
import { createRequire } from 'node:module';
import { getFirehoseHealth } from '../appview/loop.js';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json') as { version: string };

export function createHealthRoutes(db?: Kysely<Database>): Router {
  const router = Router();

  router.get('/health', async (_req, res) => {
    const status: Record<string, unknown> = {
      status: 'ok',
      version,
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

    status.firehose = getFirehoseHealth();

    res.json(status);
  });

  return router;
}
