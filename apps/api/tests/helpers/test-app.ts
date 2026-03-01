import express from 'express';
import session from 'express-session';
import supertest from 'supertest';
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import { MockClock } from '@coopsource/federation';
import type { IFederationClient } from '@coopsource/federation';
import { LocalPdsService, LocalBlobStore, LocalFederationClient } from '@coopsource/federation/local';
import type { FederationDatabase } from '@coopsource/federation/local';
import { DidWebResolver } from '@coopsource/federation/http';
import { DevEmailService } from '@coopsource/federation/email';
import type { Container } from '../../src/container.js';
import { AuthService } from '../../src/services/auth-service.js';
import { EntityService } from '../../src/services/entity-service.js';
import { MembershipService } from '../../src/services/membership-service.js';
import { PostService } from '../../src/services/post-service.js';
import { ProposalService } from '../../src/services/proposal-service.js';
import { AgreementService } from '../../src/services/agreement-service.js';
import { NetworkService } from '../../src/services/network-service.js';
import { FundingService } from '../../src/services/funding-service.js';
import { PaymentProviderRegistry } from '../../src/payment/registry.js';
import { AlignmentService } from '../../src/services/alignment-service.js';
import { ConnectionService } from '../../src/services/connection-service.js';
import { AgreementTemplateService } from '../../src/services/agreement-template-service.js';
import { ModelProviderRegistry } from '../../src/ai/model-provider-registry.js';
import { AgentService } from '../../src/services/agent-service.js';
import { ChatEngine } from '../../src/ai/chat-engine.js';
import { EventDispatcher } from '../../src/ai/triggers/event-dispatcher.js';
import type { AppConfig } from '../../src/config.js';
import { setDb, resetSetupCache } from '../../src/auth/middleware.js';
import { setPermissionsDb } from '../../src/middleware/permissions.js';
import { createHealthRoutes } from '../../src/routes/health.js';
import { createWellKnownRoutes } from '../../src/routes/well-known.js';
import { createSetupRoutes } from '../../src/routes/setup.js';
import { createAuthRoutes } from '../../src/routes/auth.js';
import { createCooperativeRoutes } from '../../src/routes/org/cooperatives.js';
import { createMembershipRoutes } from '../../src/routes/org/memberships.js';
import { createPostRoutes } from '../../src/routes/posts.js';
import { createProposalRoutes } from '../../src/routes/governance/proposals.js';
import { createAgreementRoutes } from '../../src/routes/agreement/agreements.js';
import { createAgreementTemplateRoutes } from '../../src/routes/agreement/templates.js';
import { createNetworkRoutes } from '../../src/routes/org/networks.js';
import { createCampaignRoutes } from '../../src/routes/funding/campaigns.js';
import { createPaymentConfigRoutes } from '../../src/routes/funding/payment-config.js';
import { createInterestRoutes } from '../../src/routes/alignment/interests.js';
import { createOutcomeRoutes } from '../../src/routes/alignment/outcomes.js';
import { createMapRoutes } from '../../src/routes/alignment/map.js';
import { createConnectionRoutes } from '../../src/routes/connections/connections.js';
import { createAdminRoutes } from '../../src/routes/admin.js';
import { createExploreRoutes } from '../../src/routes/explore.js';
import { createBlobRoutes } from '../../src/routes/blobs.js';
import { createFederationRoutes } from '../../src/routes/federation.js';
import { createAgentConfigRoutes } from '../../src/routes/agents/config.js';
import { createAgentChatRoutes } from '../../src/routes/agents/chat.js';
import { createAgentTriggerRoutes } from '../../src/routes/agents/triggers.js';
import { createApiTokenRoutes } from '../../src/routes/agents/tokens.js';
import { createModelConfigRoutes } from '../../src/routes/agents/model-config.js';
import { errorHandler } from '../../src/middleware/error-handler.js';
import { getTestDb, getTestConnectionString } from './test-db.js';

export interface TestApp {
  app: express.Express;
  container: Container;
  agent: supertest.Agent;
  clock: MockClock;
}

export function createTestApp(): TestApp {
  const db = getTestDb();
  const clock = new MockClock();

  const pdsService = new LocalPdsService(
    db as unknown as Kysely<FederationDatabase>,
    {
      plcUrl: 'local',
      instanceUrl: 'http://localhost:3001',
      keyEncKey: 'yIknTzhyTfVpR7cc/ZrwSpewmhyiOJA97leVbKqccsY=',
      connectionString: getTestConnectionString(),
    },
    clock,
  );

  const blobStore = new LocalBlobStore({ blobDir: '/tmp/coopsource-test-blobs' });

  const didResolver = new DidWebResolver();

  const federationClient: IFederationClient = new LocalFederationClient(
    db as unknown as Kysely<FederationDatabase>,
    pdsService,
    clock,
  );

  const emailService = new DevEmailService({
    host: 'localhost',
    port: 1025,
  });

  const authService = new AuthService(db, pdsService, clock, 'http://localhost:3001');
  const entityService = new EntityService(db, blobStore);
  const membershipService = new MembershipService(
    db,
    pdsService,
    federationClient,
    emailService,
    clock,
  );
  const postService = new PostService(db, clock);
  const proposalService = new ProposalService(db, pdsService, clock);
  const agreementService = new AgreementService(db, pdsService, federationClient, clock);
  const agreementTemplateService = new AgreementTemplateService(db, clock);
  const networkService = new NetworkService(db, pdsService, federationClient, clock);
  const paymentRegistry = new PaymentProviderRegistry(db, 'yIknTzhyTfVpR7cc/ZrwSpewmhyiOJA97leVbKqccsY=');
  const fundingService = new FundingService(db, pdsService, federationClient, clock, paymentRegistry);
  const alignmentService = new AlignmentService(db, pdsService, federationClient, clock);

  const testConfig = {
    PUBLIC_API_URL: 'http://localhost:3001',
    INSTANCE_URL: 'http://localhost:3001',
    INSTANCE_ROLE: 'standalone',
    FRONTEND_URL: 'http://localhost:5173',
  } as AppConfig;
  const connectionService = new ConnectionService(db, pdsService, clock, testConfig);
  const modelProviderRegistry = new ModelProviderRegistry(db, 'yIknTzhyTfVpR7cc/ZrwSpewmhyiOJA97leVbKqccsY=');
  const agentService = new AgentService(db, clock, modelProviderRegistry);
  const chatEngine = new ChatEngine(db, clock, modelProviderRegistry);
  const eventDispatcher = new EventDispatcher(db, chatEngine);

  const container: Container = {
    db,
    pdsService,
    federationClient,
    didResolver,
    blobStore,
    clock,
    emailService,
    authService,
    entityService,
    membershipService,
    postService,
    proposalService,
    agreementService,
    agreementTemplateService,
    networkService,
    fundingService,
    paymentRegistry,
    alignmentService,
    connectionService,
    modelProviderRegistry,
    agentService,
    chatEngine,
    eventDispatcher,
  };

  // Set the DB reference for auth middleware + permissions middleware
  setDb(db);
  setPermissionsDb(db);
  resetSetupCache();

  const app = express();

  // Health routes (no body parsing needed)
  app.use(createHealthRoutes(db));

  // DID document (public, no auth required)
  app.use(createWellKnownRoutes(db, testConfig));

  // JSON body parsing
  app.use(express.json());

  // Session middleware with MemoryStore (no pg-connect in tests)
  app.use(
    session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false, httpOnly: true, sameSite: 'lax' },
    }),
  );

  // Mount routes in the same order as production
  app.use(createExploreRoutes(container));
  app.use(createBlobRoutes(container));
  app.use(createSetupRoutes(container));
  app.use(createAuthRoutes(container, { frontendUrl: 'http://localhost:5173' }));
  app.use(createCooperativeRoutes(container));
  app.use(createMembershipRoutes(container));
  app.use(createPostRoutes(container));
  app.use(createProposalRoutes(container));
  app.use(createAgreementRoutes(container));
  app.use(createAgreementTemplateRoutes(container));
  app.use(createNetworkRoutes(container));
  app.use(createCampaignRoutes(container));
  app.use(createPaymentConfigRoutes(container));
  app.use(createInterestRoutes(container));
  app.use(createOutcomeRoutes(container));
  app.use(createMapRoutes(container));
  app.use(createConnectionRoutes(container, testConfig));
  app.use(createAdminRoutes(container));
  app.use(createFederationRoutes(container, didResolver, testConfig));
  app.use(createAgentConfigRoutes(container));
  app.use(createAgentChatRoutes(container));
  app.use(createAgentTriggerRoutes(container));
  app.use(createApiTokenRoutes(container));
  app.use(createModelConfigRoutes(container));

  // Error handler (must be last)
  app.use(errorHandler);

  const agent = supertest.agent(app);

  return { app, container, agent, clock };
}

/** Run setup/initialize and log in as admin. Returns the authenticated agent. */
export async function setupAndLogin(testApp: TestApp): Promise<{
  coopDid: string;
  adminDid: string;
}> {
  resetSetupCache();

  const initRes = await testApp.agent
    .post('/api/v1/setup/initialize')
    .send({
      cooperativeName: 'Test Cooperative',
      adminEmail: 'admin@test.com',
      adminPassword: 'password123',
      adminDisplayName: 'Test Admin',
    })
    .expect(201);

  // The agent already has the session cookie from the setup response.
  // Login explicitly to ensure the session is properly set.
  await testApp.agent
    .post('/api/v1/auth/login')
    .send({ email: 'admin@test.com', password: 'password123' })
    .expect(200);

  return {
    coopDid: initRes.body.coopDid,
    adminDid: initRes.body.adminDid,
  };
}
