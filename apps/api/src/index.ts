import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load .env from monorepo root (apps/api/src/ → ../../..)
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
// Also try CWD for local overrides (dotenv won't override already-set vars)
dotenv.config();

import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { loadConfig } from './config.js';
import { httpLogger, logger } from './middleware/logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { createContainer } from './container.js';
import { setDb } from './auth/middleware.js';
import { createSessionMiddleware } from './auth/session.js';
import { createHealthRoutes } from './routes/health.js';
import { createSetupRoutes } from './routes/setup.js';
import { createAuthRoutes } from './routes/auth.js';
import { createCooperativeRoutes } from './routes/org/cooperatives.js';
import { createMembershipRoutes } from './routes/org/memberships.js';
import { createNetworkRoutes } from './routes/org/networks.js';
import { createPostRoutes } from './routes/posts.js';
import { createProposalRoutes } from './routes/governance/proposals.js';
import { createAgreementRoutes } from './routes/agreement/agreements.js';
import { createBlobRoutes } from './routes/blobs.js';
import { createEventRoutes } from './routes/events.js';
import { createAdminRoutes } from './routes/admin.js';
import { createCampaignRoutes } from './routes/funding/campaigns.js';
import { createStripeWebhookRoutes } from './routes/funding/stripe-webhook.js';
import { createInterestRoutes } from './routes/alignment/interests.js';
import { createOutcomeRoutes } from './routes/alignment/outcomes.js';
import { createMapRoutes } from './routes/alignment/map.js';
import { createConnectionRoutes } from './routes/connections/connections.js';
import { startAppViewLoop } from './appview/loop.js';
import { createOAuthClient } from './auth/oauth-client.js';

const config = loadConfig();
const app: Express = express();

// Middleware
app.use(helmet());
app.use(
  cors({
    origin:
      config.NODE_ENV === 'production'
        ? 'https://coopsource.network'
        : 'http://localhost:5173',
    credentials: true,
  }),
);
app.use(compression());

async function start(): Promise<void> {
  if (!config.DATABASE_URL) {
    logger.fatal('DATABASE_URL is required');
    process.exit(1);
  }

  // Create dependency injection container
  const container = createContainer(config);
  setDb(container.db);
  logger.info('Container created');

  // Health routes (always available, no auth required)
  app.use(createHealthRoutes(container.db));

  // Stripe webhook (must be before JSON body parsing — needs raw body)
  app.use(
    '/api/v1/webhooks/stripe',
    express.raw({ type: 'application/json' }),
    (req, _res, next) => {
      (req as typeof req & { rawBody?: Buffer }).rawBody = req.body as Buffer;
      next();
    },
  );
  app.use(createStripeWebhookRoutes(container, config));

  // JSON body parsing
  app.use(express.json());
  app.use(httpLogger);

  // Session middleware (PostgreSQL-backed)
  app.use(createSessionMiddleware(config));

  // Setup routes (available before setup is complete)
  app.use(createSetupRoutes(container));

  // Blob routes
  app.use(createBlobRoutes(container));

  // SSE events
  app.use(createEventRoutes());

  // ATProto OAuth client (Stage 2 — only when PDS_URL is configured)
  const oauthClient = config.PDS_URL
    ? createOAuthClient({ publicUrl: config.PUBLIC_API_URL, db: container.db })
    : undefined;

  // Auth routes
  app.use(createAuthRoutes(container, {
    oauthClient,
    frontendUrl: config.FRONTEND_URL,
  }));

  // Org/member/invitation routes
  app.use(createCooperativeRoutes(container));
  app.use(createMembershipRoutes(container));

  // Network routes
  app.use(createNetworkRoutes(container));

  // Post/thread routes
  app.use(createPostRoutes(container));

  // Governance routes
  app.use(createProposalRoutes(container));

  // Agreement routes
  app.use(createAgreementRoutes(container));

  // Admin routes
  app.use(createAdminRoutes(container));

  // Funding routes (Stage 3)
  app.use(createCampaignRoutes(container));

  // Alignment routes (Stage 3)
  app.use(createInterestRoutes(container));
  app.use(createOutcomeRoutes(container));
  app.use(createMapRoutes(container));

  // Connection routes
  app.use(createConnectionRoutes(container, config));

  // TODO: Stage 3 — Automation, AI Agents, MCP, CLI Auth, OIDC

  // Error handling (must be last)
  app.use(errorHandler);

  // Start AppView subscription loop
  startAppViewLoop(container.pdsService, container.db).catch((err) => {
    logger.error(err, 'AppView loop failed to start');
  });

  // Background: resolve expired proposals every 60s
  setInterval(() => {
    container.proposalService.resolveExpiredProposals().catch((err) => {
      logger.error(err, 'Failed to resolve expired proposals');
    });
  }, 60_000);

  app.listen(config.PORT, () => {
    logger.info(`API server listening on port ${config.PORT}`);
  });
}

start().catch((err) => {
  logger.fatal(err, 'Failed to start server');
  process.exit(1);
});

export default app;
