import { createDb } from '@coopsource/db';
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import { SystemClock } from '@coopsource/federation';
import type { IPdsService } from '@coopsource/federation';
import { LocalPdsService, LocalBlobStore } from '@coopsource/federation/local';
import type { FederationDatabase } from '@coopsource/federation/local';
import { AtprotoPdsService } from '@coopsource/federation/atproto';
import { DevEmailService } from '@coopsource/federation/email';
import type { AppConfig } from './config.js';
import { AuthService } from './services/auth-service.js';
import { EntityService } from './services/entity-service.js';
import { MembershipService } from './services/membership-service.js';
import { PostService } from './services/post-service.js';
import { ProposalService } from './services/proposal-service.js';
import { AgreementServiceV2 } from './services/agreement-service-v2.js';
import { NetworkService } from './services/network-service.js';
import { FundingService } from './services/funding-service.js';
import { AlignmentService } from './services/alignment-service.js';

export interface Container {
  db: Kysely<Database>;
  pdsService: IPdsService;
  blobStore: LocalBlobStore;
  clock: SystemClock;
  emailService: DevEmailService;
  authService: AuthService;
  entityService: EntityService;
  membershipService: MembershipService;
  postService: PostService;
  proposalService: ProposalService;
  agreementService: AgreementServiceV2;
  networkService: NetworkService;
  fundingService: FundingService;
  alignmentService: AlignmentService;
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

  const blobStore = new LocalBlobStore({ blobDir: config.BLOB_DIR });

  const emailService = new DevEmailService({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
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
  const fundingService = new FundingService(db, pdsService, clock);
  const alignmentService = new AlignmentService(db, pdsService, clock);

  return {
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
    fundingService,
    alignmentService,
  };
}
