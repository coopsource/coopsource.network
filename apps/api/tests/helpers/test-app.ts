import express from 'express';
import session from 'express-session';
import supertest from 'supertest';
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import { MockClock, AtprotoPdsService } from '@coopsource/federation';
import { LocalPdsService, LocalBlobStore } from '@coopsource/federation/local';
import type { FederationDatabase } from '@coopsource/federation/local';
import { DidWebResolver } from '@coopsource/federation/http';
import { NoopEmailService } from '@coopsource/federation/email';
import type { Container } from '../../src/container.js';
import { AuthService } from '../../src/services/auth-service.js';
import { EntityService } from '../../src/services/entity-service.js';
import { ProfileService } from '../../src/services/profile-service.js';
import { MembershipService } from '../../src/services/membership-service.js';
import { PostService } from '../../src/services/post-service.js';
import { SearchService } from '../../src/services/search-service.js';
import { MatchmakingService } from '../../src/services/matchmaking-service.js';
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
import { McpClient } from '../../src/ai/mcp-client.js';
import { EventDispatcher } from '../../src/ai/triggers/event-dispatcher.js';
import { MemberWriteProxy } from '../../src/services/member-write-proxy.js';
import { OperatorWriteProxy } from '../../src/services/operator-write-proxy.js';
import { GovernanceLabeler } from '../../src/services/governance-labeler.js';
import { LabelSubscriptionManager } from '../../src/services/label-subscription.js';
import { LegalDocumentService } from '../../src/services/legal-document-service.js';
import { ComplianceCalendarService } from '../../src/services/compliance-calendar-service.js';
import { OfficerRecordService } from '../../src/services/officer-record-service.js';
import { MeetingRecordService } from '../../src/services/meeting-record-service.js';
import { MemberNoticeService } from '../../src/services/member-notice-service.js';
import { FiscalPeriodService } from '../../src/services/fiscal-period-service.js';
import { PrivateRecordService } from '../../src/services/private-record-service.js';
import { VisibilityRouter } from '../../src/services/visibility-router.js';
import { PatronageService } from '../../src/services/patronage-service.js';
import { CapitalAccountService } from '../../src/services/capital-account-service.js';
import { Tax1099Service } from '../../src/services/tax-1099-service.js';
import { OnboardingService } from '../../src/services/onboarding-service.js';
import { DelegationVotingService } from '../../src/services/delegation-voting-service.js';
import { GovernanceFeedService } from '../../src/services/governance-feed-service.js';
import { MemberClassService } from '../../src/services/member-class-service.js';
import { CooperativeLinkService } from '../../src/services/cooperative-link-service.js';
import { HookRegistry } from '../../src/appview/hooks/registry.js';
import { registerBuiltinHooks } from '../../src/appview/hooks/builtin/index.js';
import { lexiconValidatorHook } from '../../src/appview/hooks/builtin/lexicon-validator-hook.js';
import { LexiconManagementService } from '../../src/services/lexicon-management-service.js';
import { ScriptWorkerPool } from '../../src/scripting/worker-pool.js';
import { ScriptService } from '../../src/scripting/script-service.js';
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
import { createExplorePersonRoutes } from '../../src/routes/explore-person.js';
import { createSearchRoutes } from '../../src/routes/search.js';
import { createBlobRoutes } from '../../src/routes/blobs.js';
import { createFederationRoutes } from '../../src/routes/federation.js';
import { createAgentConfigRoutes } from '../../src/routes/agents/config.js';
import { createAgentChatRoutes } from '../../src/routes/agents/chat.js';
import { createAgentTriggerRoutes } from '../../src/routes/agents/triggers.js';
import { createApiTokenRoutes } from '../../src/routes/agents/tokens.js';
import { createModelConfigRoutes } from '../../src/routes/agents/model-config.js';
import { createNotificationRoutes } from '../../src/routes/notifications.js';
import { createMeMatchesRoutes } from '../../src/routes/me-matches.js';
import { createMeProfileRoutes } from '../../src/routes/me-profile.js';
import { createLabelRoutes } from '../../src/routes/labels.js';
import { createLegalDocumentRoutes } from '../../src/routes/legal/documents.js';
import { createMeetingRoutes } from '../../src/routes/legal/meetings.js';
import { createOfficerRoutes } from '../../src/routes/admin-legal/officers.js';
import { createComplianceRoutes } from '../../src/routes/admin-legal/compliance.js';
import { createNoticeRoutes } from '../../src/routes/admin-legal/notices.js';
import { createFiscalPeriodRoutes } from '../../src/routes/admin-legal/fiscal-periods.js';
import { createPrivateRecordRoutes } from '../../src/routes/private/records.js';
import { createPatronageRoutes } from '../../src/routes/financial/patronage.js';
import { createCapitalAccountRoutes } from '../../src/routes/financial/capital-accounts.js';
import { createTaxFormRoutes } from '../../src/routes/financial/tax-forms.js';
import { createOnboardingRoutes } from '../../src/routes/onboarding/config.js';
import { createDelegationRoutes } from '../../src/routes/governance/delegations.js';
import { createGovernanceFeedRoutes } from '../../src/routes/governance/feed.js';
import { createMemberClassRoutes } from '../../src/routes/governance/member-classes.js';
import { createCooperativeLinkRoutes } from '../../src/routes/governance/cooperative-links.js';
import { createAdminLexiconRoutes } from '../../src/routes/admin-lexicons.js';
import { createAdminScriptRoutes } from '../../src/routes/admin-scripts.js';
import { createXrpcLabelRoutes } from '../../src/routes/xrpc-labels.js';
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

  // Use real AtprotoPdsService when PDS_URL is set (Docker), otherwise LocalPdsService
  const PDS_URL = process.env.PDS_URL;
  const PLC_URL = process.env.PLC_URL;
  const pdsService = PDS_URL
    ? new AtprotoPdsService(
        PDS_URL,
        process.env.PDS_ADMIN_PASSWORD ?? 'admin',
        PLC_URL,
      )
    : new LocalPdsService(
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

  const emailService = new NoopEmailService();

  // V5: MemberWriteProxy in test mode (warns + falls back to pdsService)
  const memberWriteProxy = new MemberWriteProxy(undefined, pdsService, 'test');

  const testConfig = {
    PUBLIC_API_URL: 'http://localhost:3001',
    INSTANCE_URL: 'http://localhost:3001',
    INSTANCE_ROLE: 'standalone',
    FRONTEND_URL: 'http://localhost:5173',
  } as AppConfig;

  const operatorWriteProxy = new OperatorWriteProxy(pdsService, db, testConfig);

  const profileService = new ProfileService(db, clock);
  const authService = new AuthService(db, pdsService, clock, profileService, 'http://localhost:3001', memberWriteProxy);
  const entityService = new EntityService(db, blobStore);
  const membershipService = new MembershipService(
    db,
    pdsService,
    emailService,
    clock,
  );
  const labelSubscriptionManager = new LabelSubscriptionManager(db);
  const governanceLabeler = new GovernanceLabeler(db, labelSubscriptionManager);
  const postService = new PostService(db, clock);
  const searchService = new SearchService(db);
  const matchmakingService = new MatchmakingService(db, clock);
  const proposalService = new ProposalService(db, pdsService, clock, memberWriteProxy, governanceLabeler);
  const agreementService = new AgreementService(db, pdsService, clock, memberWriteProxy);
  const agreementTemplateService = new AgreementTemplateService(db, clock);
  const networkService = new NetworkService(db, pdsService, clock);
  const paymentRegistry = new PaymentProviderRegistry(db, 'yIknTzhyTfVpR7cc/ZrwSpewmhyiOJA97leVbKqccsY=');
  const fundingService = new FundingService(db, pdsService, clock, paymentRegistry, memberWriteProxy);
  const alignmentService = new AlignmentService(db, pdsService, clock);
  const connectionService = new ConnectionService(db, pdsService, clock, testConfig);
  const modelProviderRegistry = new ModelProviderRegistry(db, 'yIknTzhyTfVpR7cc/ZrwSpewmhyiOJA97leVbKqccsY=');
  const agentService = new AgentService(db, clock, modelProviderRegistry);
  const mcpClient = new McpClient();
  const chatEngine = new ChatEngine(db, clock, modelProviderRegistry, mcpClient);
  const eventDispatcher = new EventDispatcher(db, chatEngine);
  const legalDocumentService = new LegalDocumentService(db, clock);
  const complianceCalendarService = new ComplianceCalendarService(db, clock);
  const officerRecordService = new OfficerRecordService(db, clock);
  const meetingRecordService = new MeetingRecordService(db, clock);
  const memberNoticeService = new MemberNoticeService(db, clock);
  const fiscalPeriodService = new FiscalPeriodService(db, clock);
  const privateRecordService = new PrivateRecordService(db, clock);
  const visibilityRouter = new VisibilityRouter(db, privateRecordService);
  const patronageService = new PatronageService(db, clock);
  const capitalAccountService = new CapitalAccountService(db, clock);
  const tax1099Service = new Tax1099Service(db, clock);
  const onboardingService = new OnboardingService(db, clock);
  const delegationVotingService = new DelegationVotingService(db, clock);
  const governanceFeedService = new GovernanceFeedService(db, clock);
  const memberClassService = new MemberClassService(db, clock);
  const cooperativeLinkService = new CooperativeLinkService(db, clock);

  // V7 P6: Hook pipeline
  const hookRegistry = new HookRegistry();
  registerBuiltinHooks(hookRegistry);
  hookRegistry.register(lexiconValidatorHook);

  // V7 P7: Lexicon management
  const lexiconManagementService = new LexiconManagementService(db, hookRegistry);

  // V7 P8: Cooperative scripting
  const scriptWorkerPool = new ScriptWorkerPool();
  const scriptService = new ScriptService(
    db,
    hookRegistry,
    scriptWorkerPool,
    emailService,
    operatorWriteProxy,
  );

  const container: Container = {
    db,
    pdsService,
    didResolver,
    blobStore,
    clock,
    emailService,
    authService,
    profileService,
    entityService,
    membershipService,
    postService,
    searchService,
    matchmakingService,
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
    mcpClient,
    chatEngine,
    eventDispatcher,
    memberWriteProxy,
    operatorWriteProxy,
    governanceLabeler,
    labelSubscriptionManager,
    labelSigner: undefined,
    legalDocumentService,
    complianceCalendarService,
    officerRecordService,
    meetingRecordService,
    memberNoticeService,
    fiscalPeriodService,
    privateRecordService,
    visibilityRouter,
    patronageService,
    capitalAccountService,
    tax1099Service,
    onboardingService,
    delegationVotingService,
    governanceFeedService,
    memberClassService,
    cooperativeLinkService,
    hookRegistry,
    lexiconManagementService,
    scriptWorkerPool,
    scriptService,
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
  app.use(createExplorePersonRoutes(container));
  app.use(createSearchRoutes(container));
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
  app.use(createNotificationRoutes(container));
  app.use(createMeMatchesRoutes(container));
  app.use(createMeProfileRoutes(container));
  app.use(createLabelRoutes(governanceLabeler));
  app.use(createLegalDocumentRoutes(container));
  app.use(createMeetingRoutes(container));
  app.use(createOfficerRoutes(container));
  app.use(createComplianceRoutes(container));
  app.use(createNoticeRoutes(container));
  app.use(createFiscalPeriodRoutes(container));
  app.use(createPrivateRecordRoutes(container));
  app.use(createPatronageRoutes(container));
  app.use(createCapitalAccountRoutes(container));
  app.use(createTaxFormRoutes(container));
  app.use(createOnboardingRoutes(container));
  app.use(createDelegationRoutes(container));
  app.use(createGovernanceFeedRoutes(container));
  app.use(createMemberClassRoutes(container));
  app.use(createCooperativeLinkRoutes(container));
  app.use(createAdminLexiconRoutes(container));
  app.use(createAdminScriptRoutes(container));
  app.use(createXrpcLabelRoutes(db));

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
