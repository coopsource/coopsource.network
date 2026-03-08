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
import { setPermissionsDb } from './middleware/permissions.js';
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
import { createAgreementTemplateRoutes } from './routes/agreement/templates.js';
import { createBlobRoutes } from './routes/blobs.js';
import { createEventRoutes } from './routes/events.js';
import { createAdminRoutes } from './routes/admin.js';
import { createCampaignRoutes } from './routes/funding/campaigns.js';
import { createPaymentWebhookRoutes } from './routes/funding/payment-webhook.js';
import { createPaymentConfigRoutes } from './routes/funding/payment-config.js';
import { createInterestRoutes } from './routes/alignment/interests.js';
import { createOutcomeRoutes } from './routes/alignment/outcomes.js';
import { createMapRoutes } from './routes/alignment/map.js';
import { createConnectionRoutes } from './routes/connections/connections.js';
import { createExploreRoutes } from './routes/explore.js';
import { createWellKnownRoutes } from './routes/well-known.js';
import { createFederationRoutes } from './routes/federation.js';
import { createAgentConfigRoutes } from './routes/agents/config.js';
import { createAgentChatRoutes } from './routes/agents/chat.js';
import { createAgentTriggerRoutes } from './routes/agents/triggers.js';
import { createApiTokenRoutes } from './routes/agents/tokens.js';
import { createModelConfigRoutes } from './routes/agents/model-config.js';
import { createNotificationRoutes } from './routes/notifications.js';
import { createOnboardingRoutes } from './routes/onboarding/config.js';
import { createDelegationRoutes } from './routes/governance/delegations.js';
import { createGovernanceFeedRoutes } from './routes/governance/feed.js';
import { createMemberClassRoutes } from './routes/governance/member-classes.js';
import { createCooperativeLinkRoutes } from './routes/governance/cooperative-links.js';
import { createMcpRoutes } from './mcp/server.js';
import { createLabelRoutes } from './routes/labels.js';
import { createLegalDocumentRoutes } from './routes/legal/documents.js';
import { createMeetingRoutes } from './routes/legal/meetings.js';
import { createOfficerRoutes } from './routes/admin-legal/officers.js';
import { createComplianceRoutes } from './routes/admin-legal/compliance.js';
import { createNoticeRoutes } from './routes/admin-legal/notices.js';
import { createFiscalPeriodRoutes } from './routes/admin-legal/fiscal-periods.js';
import { createPrivateRecordRoutes } from './routes/private/records.js';
import { createPatronageRoutes } from './routes/financial/patronage.js';
import { createCapitalAccountRoutes } from './routes/financial/capital-accounts.js';
import { createTaxFormRoutes } from './routes/financial/tax-forms.js';
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
  setPermissionsDb(container.db);
  logger.info('Container created');

  // Health routes (always available, no auth required)
  app.use(createHealthRoutes(container.db));

  // DID document (public, no auth required)
  app.use(createWellKnownRoutes(container.db, config));

  // Payment webhook (must be before JSON body parsing — needs raw body)
  app.use(
    '/api/v1/webhooks/payment',
    express.raw({ type: 'application/json' }),
    (req, _res, next) => {
      (req as typeof req & { rawBody?: Buffer }).rawBody = req.body as Buffer;
      next();
    },
  );
  app.use(createPaymentWebhookRoutes(container));

  // JSON body parsing
  app.use(express.json());
  app.use(httpLogger);

  // Session middleware (PostgreSQL-backed)
  app.use(createSessionMiddleware(config));

  // Public explore routes (no auth required)
  app.use(createExploreRoutes(container));

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
  app.use(createAgreementTemplateRoutes(container));

  // Admin routes
  app.use(createAdminRoutes(container));

  // Funding routes (Stage 3)
  app.use(createCampaignRoutes(container));
  app.use(createPaymentConfigRoutes(container));

  // Alignment routes (Stage 3)
  app.use(createInterestRoutes(container));
  app.use(createOutcomeRoutes(container));
  app.use(createMapRoutes(container));

  // Connection routes
  app.use(createConnectionRoutes(container, config));

  // Federation routes (server-to-server, signed HTTP)
  app.use(createFederationRoutes(container, container.didResolver, config));

  // AI Agent routes (Stage 3)
  app.use(createAgentConfigRoutes(container));
  app.use(createAgentChatRoutes(container));
  app.use(createAgentTriggerRoutes(container));
  app.use(createApiTokenRoutes(container));
  app.use(createModelConfigRoutes(container));

  // Notification routes
  app.use(createNotificationRoutes(container));

  // Legal & Administrative routes (Phase 4)
  app.use(createLegalDocumentRoutes(container));
  app.use(createMeetingRoutes(container));
  app.use(createOfficerRoutes(container));
  app.use(createComplianceRoutes(container));
  app.use(createNoticeRoutes(container));
  app.use(createFiscalPeriodRoutes(container));

  // Private record routes (Phase 5)
  app.use(createPrivateRecordRoutes(container));

  // Financial tools (Phase 6)
  app.use(createPatronageRoutes(container));
  app.use(createCapitalAccountRoutes(container));
  app.use(createTaxFormRoutes(container));

  // Governance label routes
  app.use(createLabelRoutes(container.governanceLabeler));

  // Onboarding routes (Phase 7)
  app.use(createOnboardingRoutes(container));

  // Delegation + Governance feed routes (Phase 7)
  app.use(createDelegationRoutes(container));
  app.use(createGovernanceFeedRoutes(container));

  // Weighted voting + cooperative links (Phase 7)
  app.use(createMemberClassRoutes(container));
  app.use(createCooperativeLinkRoutes(container));

  // MCP server (bearer token auth)
  app.use(createMcpRoutes(container.db));

  // Error handling (must be last)
  app.use(errorHandler);

  // Start AppView subscription loop
  startAppViewLoop(container.pdsService, container.db, {
    relayUrl: config.RELAY_URL,
    verifySignatures: config.VERIFY_COMMIT_SIGNATURES === 'true',
  }).catch((err) => {
    logger.error(err, 'AppView loop failed to start');
  });

  // Start event dispatcher for agent triggers
  container.eventDispatcher.start();
  logger.info('Event dispatcher started');

  // Outbox processor retired — public data flows through ATProto relay firehose

  // Background: resolve expired proposals every 60s
  setInterval(() => {
    container.proposalService.resolveExpiredProposals().catch((err) => {
      logger.error(err, 'Failed to resolve expired proposals');
    });
  }, 60_000);

  const server = app.listen(config.PORT, () => {
    logger.info(`API server listening on port ${config.PORT}`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    server.close();
    container.eventDispatcher.stop();
    await container.mcpClient.disconnectAll();
    // Outbox processor retired
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  logger.fatal(err, 'Failed to start server');
  process.exit(1);
});

export default app;
