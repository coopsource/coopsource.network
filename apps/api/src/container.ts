import { createDb } from '@coopsource/db';
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import { SystemClock } from '@coopsource/federation';
import type { IPdsService } from '@coopsource/federation';
import { LocalPdsService, LocalBlobStore } from '@coopsource/federation/local';
import type { FederationDatabase } from '@coopsource/federation/local';
import { DidWebResolver } from '@coopsource/federation/http';
import { AtprotoPdsService } from '@coopsource/federation/atproto';
import { DevEmailService } from '@coopsource/federation/email';
import type { AppConfig } from './config.js';
import { AuthService } from './services/auth-service.js';
import { EntityService } from './services/entity-service.js';
import { MembershipService } from './services/membership-service.js';
import { PostService } from './services/post-service.js';
import { ProposalService } from './services/proposal-service.js';
import { AgreementService } from './services/agreement-service.js';
import { NetworkService } from './services/network-service.js';
import { FundingService } from './services/funding-service.js';
import { PaymentProviderRegistry } from './payment/registry.js';
import { AlignmentService } from './services/alignment-service.js';
import { ConnectionService } from './services/connection-service.js';
import { AgreementTemplateService } from './services/agreement-template-service.js';
import { ModelProviderRegistry } from './ai/model-provider-registry.js';
import { AgentService } from './services/agent-service.js';
import { ChatEngine } from './ai/chat-engine.js';
import { McpClient } from './ai/mcp-client.js';
import { EventDispatcher } from './ai/triggers/event-dispatcher.js';
import { MemberWriteProxy } from './services/member-write-proxy.js';
import type { IMemberRecordWriter } from './services/member-write-proxy.js';
import { OperatorWriteProxy } from './services/operator-write-proxy.js';
import { GovernanceLabeler } from './services/governance-labeler.js';
import { LegalDocumentService } from './services/legal-document-service.js';
import { ComplianceCalendarService } from './services/compliance-calendar-service.js';
import { OfficerRecordService } from './services/officer-record-service.js';
import { MeetingRecordService } from './services/meeting-record-service.js';
import { MemberNoticeService } from './services/member-notice-service.js';
import { FiscalPeriodService } from './services/fiscal-period-service.js';
import { PrivateRecordService } from './services/private-record-service.js';
import { VisibilityRouter } from './services/visibility-router.js';
import { PatronageService } from './services/patronage-service.js';
import { CapitalAccountService } from './services/capital-account-service.js';
import { Tax1099Service } from './services/tax-1099-service.js';

export interface Container {
  db: Kysely<Database>;
  pdsService: IPdsService;
  didResolver: DidWebResolver;
  blobStore: LocalBlobStore;
  clock: SystemClock;
  emailService: DevEmailService;
  authService: AuthService;
  entityService: EntityService;
  membershipService: MembershipService;
  postService: PostService;
  proposalService: ProposalService;
  agreementService: AgreementService;
  agreementTemplateService: AgreementTemplateService;
  networkService: NetworkService;
  fundingService: FundingService;
  paymentRegistry: PaymentProviderRegistry;
  alignmentService: AlignmentService;
  connectionService: ConnectionService;
  modelProviderRegistry: ModelProviderRegistry;
  agentService: AgentService;
  mcpClient: McpClient;
  chatEngine: ChatEngine;
  eventDispatcher: EventDispatcher;
  memberWriteProxy: MemberWriteProxy;
  operatorWriteProxy: OperatorWriteProxy;
  governanceLabeler: GovernanceLabeler;
  legalDocumentService: LegalDocumentService;
  complianceCalendarService: ComplianceCalendarService;
  officerRecordService: OfficerRecordService;
  meetingRecordService: MeetingRecordService;
  memberNoticeService: MemberNoticeService;
  fiscalPeriodService: FiscalPeriodService;
  privateRecordService: PrivateRecordService;
  visibilityRouter: VisibilityRouter;
  patronageService: PatronageService;
  capitalAccountService: CapitalAccountService;
  tax1099Service: Tax1099Service;
}

export function createContainer(config: AppConfig): Container {
  const db = createDb({ connectionString: config.DATABASE_URL! });
  const clock = new SystemClock();

  // When PDS_URL (or COOP_PDS_URL) is set, use AtprotoPdsService (real ATProto PDS);
  // otherwise fall back to LocalPdsService (DB-backed, Stage 0-1).
  // COOP_PDS_URL/COOP_PDS_ADMIN_PASSWORD take precedence (V5 cooperative identity).
  const effectivePdsUrl = config.COOP_PDS_URL ?? config.PDS_URL;
  const effectivePdsPassword = config.COOP_PDS_ADMIN_PASSWORD ?? config.PDS_ADMIN_PASSWORD;
  const pdsService: IPdsService = effectivePdsUrl
    ? new AtprotoPdsService(
        effectivePdsUrl,
        effectivePdsPassword,
        config.PLC_URL === 'local' ? undefined : config.PLC_URL,
      )
    : new LocalPdsService(
        db as unknown as import('kysely').Kysely<FederationDatabase>,
        {
          plcUrl: config.PLC_URL,
          instanceUrl: config.INSTANCE_URL,
          keyEncKey: config.KEY_ENC_KEY,
          connectionString: config.DATABASE_URL!,
        },
        clock,
      );

  const didResolver = new DidWebResolver();

  const blobStore = new LocalBlobStore({ blobDir: config.BLOB_DIR });

  const emailService = new DevEmailService({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
  });

  // V5: Member write proxy (OAuth → member PDS) + operator write proxy (ACL + audit)
  // oauthClient is undefined here; it's created in index.ts and could be passed via config.
  // For now, services use the proxy in dev-fallback mode (writes to cooperative PDS with warning).
  const memberWriteProxy = new MemberWriteProxy(undefined, pdsService, config.NODE_ENV);
  const operatorWriteProxy = new OperatorWriteProxy(pdsService, db, config);

  const authService = new AuthService(db, pdsService, clock, config.INSTANCE_URL ?? 'http://localhost:3001', memberWriteProxy);
  const entityService = new EntityService(db, blobStore);
  const membershipService = new MembershipService(
    db,
    pdsService,
    emailService,
    clock,
  );
  const governanceLabeler = new GovernanceLabeler(db);
  const postService = new PostService(db, clock);
  const proposalService = new ProposalService(db, pdsService, clock, memberWriteProxy, governanceLabeler);
  const agreementService = new AgreementService(db, pdsService, clock, memberWriteProxy);
  const agreementTemplateService = new AgreementTemplateService(db, clock);
  const networkService = new NetworkService(db, pdsService, clock);
  const paymentRegistry = new PaymentProviderRegistry(db, config.KEY_ENC_KEY);
  const fundingService = new FundingService(db, pdsService, clock, paymentRegistry, memberWriteProxy);
  const alignmentService = new AlignmentService(db, pdsService, clock);
  const connectionService = new ConnectionService(db, pdsService, clock, config);
  const modelProviderRegistry = new ModelProviderRegistry(db, config.KEY_ENC_KEY);
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

  return {
    db,
    pdsService,
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
    mcpClient,
    chatEngine,
    eventDispatcher,
    memberWriteProxy,
    operatorWriteProxy,
    governanceLabeler,
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
  };
}
