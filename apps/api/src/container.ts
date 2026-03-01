import { createDb } from '@coopsource/db';
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import { SystemClock, OutboxProcessor } from '@coopsource/federation';
import type { IPdsService, IFederationClient, OutboxLogger } from '@coopsource/federation';
import { LocalPdsService, LocalBlobStore, LocalFederationClient } from '@coopsource/federation/local';
import type { FederationDatabase } from '@coopsource/federation/local';
import { HttpFederationClient, DidWebResolver, SigningKeyResolver } from '@coopsource/federation/http';
import { AtprotoPdsService } from '@coopsource/federation/atproto';
import { DevEmailService } from '@coopsource/federation/email';
import { urlToDidWeb } from '@coopsource/common';
import type { AppConfig } from './config.js';
import { AuthService } from './services/auth-service.js';
import { EntityService } from './services/entity-service.js';
import { MembershipService } from './services/membership-service.js';
import { PostService } from './services/post-service.js';
import { ProposalService } from './services/proposal-service.js';
import { AgreementService } from './services/agreement-service.js';
import { NetworkService } from './services/network-service.js';
import { FundingService } from './services/funding-service.js';
import { AlignmentService } from './services/alignment-service.js';
import { ConnectionService } from './services/connection-service.js';
import { AgreementTemplateService } from './services/agreement-template-service.js';

export interface Container {
  db: Kysely<Database>;
  pdsService: IPdsService;
  federationClient: IFederationClient;
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
  alignmentService: AlignmentService;
  connectionService: ConnectionService;
  outboxProcessor?: OutboxProcessor;
}

export function createContainer(config: AppConfig): Container {
  const db = createDb({ connectionString: config.DATABASE_URL! });
  const clock = new SystemClock();

  // When PDS_URL is set, use AtprotoPdsService (real ATProto PDS);
  // otherwise fall back to LocalPdsService (DB-backed, Stage 0-1).
  const pdsService: IPdsService = config.PDS_URL
    ? new AtprotoPdsService(
        config.PDS_URL,
        config.PDS_ADMIN_PASSWORD,
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

  // Federation client — standalone uses local dispatch, hub/coop use signed HTTP.
  const fedDb = db as unknown as import('kysely').Kysely<FederationDatabase>;
  const instanceDid = config.INSTANCE_DID ?? urlToDidWeb(config.INSTANCE_URL);

  let signingKeyResolver: SigningKeyResolver | undefined;
  let outboxProcessor: OutboxProcessor | undefined;

  const federationClient: IFederationClient =
    config.INSTANCE_ROLE === 'standalone'
      ? new LocalFederationClient(fedDb, pdsService, clock)
      : (() => {
          signingKeyResolver = new SigningKeyResolver(fedDb, config.KEY_ENC_KEY);

          const outboxLogger: OutboxLogger = {
            info(msg: string, data?: Record<string, unknown>) {
              // pino logger imported lazily to avoid circular deps
              console.log(`[outbox] ${msg}`, data ?? '');
            },
            error(msg: string, data?: Record<string, unknown>) {
              console.error(`[outbox] ${msg}`, data ?? '');
            },
          };
          outboxProcessor = new OutboxProcessor(
            db,
            signingKeyResolver,
            instanceDid,
            outboxLogger,
          );

          return new HttpFederationClient(
            signingKeyResolver,
            didResolver,
            instanceDid,
            config.HUB_URL,
          );
        })();

  const blobStore = new LocalBlobStore({ blobDir: config.BLOB_DIR });

  const emailService = new DevEmailService({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
  });

  const authService = new AuthService(db, pdsService, clock, config.INSTANCE_URL ?? 'http://localhost:3001');
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
  const fundingService = new FundingService(db, pdsService, federationClient, clock);
  const alignmentService = new AlignmentService(db, pdsService, federationClient, clock);
  const connectionService = new ConnectionService(db, pdsService, clock, config);

  return {
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
    alignmentService,
    connectionService,
    outboxProcessor,
  };
}
