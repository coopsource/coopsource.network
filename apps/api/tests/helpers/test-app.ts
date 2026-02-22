import express from 'express';
import session from 'express-session';
import supertest from 'supertest';
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import { MockClock } from '@coopsource/federation';
import { LocalPdsService, LocalBlobStore } from '@coopsource/federation/local';
import type { FederationDatabase } from '@coopsource/federation/local';
import { DevEmailService } from '@coopsource/federation/email';
import type { Container } from '../../src/container.js';
import { AuthService } from '../../src/services/auth-service.js';
import { EntityService } from '../../src/services/entity-service.js';
import { MembershipService } from '../../src/services/membership-service.js';
import { PostService } from '../../src/services/post-service.js';
import { ProposalService } from '../../src/services/proposal-service.js';
import { AgreementServiceV2 } from '../../src/services/agreement-service-v2.js';
import { NetworkService } from '../../src/services/network-service.js';
import { setDb, resetSetupCache } from '../../src/auth/middleware.js';
import { createHealthRoutes } from '../../src/routes/health.js';
import { createSetupRoutes } from '../../src/routes/setup.js';
import { createAuthRoutes } from '../../src/routes/auth.js';
import { createCooperativeRoutes } from '../../src/routes/org/cooperatives.js';
import { createMembershipRoutes } from '../../src/routes/org/memberships.js';
import { createPostRoutes } from '../../src/routes/posts.js';
import { createProposalRoutes } from '../../src/routes/governance/proposals.js';
import { createAgreementRoutes } from '../../src/routes/agreement/agreements.js';
import { createNetworkRoutes } from '../../src/routes/org/networks.js';
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

  const emailService = new DevEmailService({
    host: 'localhost',
    port: 1025,
  });

  const authService = new AuthService(db, pdsService, clock);
  const entityService = new EntityService(db, blobStore);
  const membershipService = new MembershipService(
    db,
    pdsService,
    emailService,
    clock,
  );
  const postService = new PostService(db, clock);
  const proposalService = new ProposalService(db, pdsService, clock);
  const agreementService = new AgreementServiceV2(db, pdsService, clock);
  const networkService = new NetworkService(db, pdsService, clock);

  const container: Container = {
    db,
    pdsService,
    blobStore,
    clock,
    emailService,
    authService,
    entityService,
    membershipService,
    postService,
    proposalService,
    agreementService,
    networkService,
  };

  // Set the DB reference for auth middleware
  setDb(db);
  resetSetupCache();

  const app = express();

  // Health routes (no body parsing needed)
  app.use(createHealthRoutes(db));

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
  app.use(createSetupRoutes(container));
  app.use(createAuthRoutes(container));
  app.use(createCooperativeRoutes(container));
  app.use(createMembershipRoutes(container));
  app.use(createPostRoutes(container));
  app.use(createProposalRoutes(container));
  app.use(createAgreementRoutes(container));
  app.use(createNetworkRoutes(container));

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
