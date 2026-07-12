import { sql, type Kysely, type Transaction } from 'kysely';
import type { Database } from '@coopsource/db';
import type { IClock } from '@coopsource/federation';
import { membersSpace } from '@coopsource/arbiter-client';
import {
  NotFoundError,
  ValidationError,
  type CreateDelegationInput,
  type DID,
} from '@coopsource/common';
import type { ActionAuthorizerPlugin } from '@coopsource/governance-view';
import {
  validateCoopDelegationCommand,
  type CoopVoteWeightDelegation,
} from '@coopsource/coop-view';

type DelegationCommandDb = Kysely<Database> | Transaction<Database>;

export interface DelegationCommandServiceOptions {
  readonly rkey?: () => string;
}

export class DelegationCommandService {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly clock: IClock,
    private readonly actionAuthorizer?: ActionAuthorizerPlugin,
    private readonly options: DelegationCommandServiceOptions = {},
  ) {}

  async createDelegation(
    cooperativeDid: string,
    delegatorDid: string,
    data: CreateDelegationInput,
  ) {
    return this.db.transaction().execute(async (trx) => {
      await lockDelegationCommands(trx, cooperativeDid);
      await this.assertDelegationCommandAllowed(trx, cooperativeDid, {
        delegatorDid,
        delegateeDid: data.delegateeDid,
        scope: data.scope,
        proposalUri: data.proposalUri ?? null,
      });

      const existing = await getActiveDelegation(
        trx,
        cooperativeDid,
        delegatorDid,
        data.scope,
        data.proposalUri,
      );
      const now = this.clock.now();
      if (existing) {
        await trx
          .updateTable('delegation')
          .set({ status: 'revoked', revoked_at: now })
          .where('uri', '=', existing.uri)
          .execute();
      }

      const rkey = this.options.rkey?.() ?? defaultDelegationRkey();
      const uri = `at://${cooperativeDid}/network.coopsource.governance.delegation/${rkey}`;
      const [row] = await trx
        .insertInto('delegation')
        .values({
          uri,
          did: cooperativeDid,
          rkey,
          project_uri: cooperativeDid,
          delegator_did: delegatorDid,
          delegatee_did: data.delegateeDid,
          scope: data.scope,
          proposal_uri: data.proposalUri ?? null,
          status: 'active',
          created_at: now,
          indexed_at: now,
        })
        .returningAll()
        .execute();
      return row!;
    });
  }

  async revokeDelegation(
    cooperativeDid: string,
    actorDid: string,
    delegationUri: string,
  ) {
    return this.db.transaction().execute(async (trx) => {
      const delegation = await trx
        .selectFrom('delegation')
        .where('uri', '=', delegationUri)
        .where('did', '=', cooperativeDid)
        .selectAll()
        .executeTakeFirst();

      if (!delegation) throw new NotFoundError('Delegation not found');
      await lockDelegationCommands(trx, cooperativeDid);
      const lockedDelegation = await trx
        .selectFrom('delegation')
        .where('uri', '=', delegationUri)
        .where('did', '=', cooperativeDid)
        .selectAll()
        .executeTakeFirstOrThrow();
      await this.authorizeDelegationRevocation({
        cooperativeDid,
        actorDid,
        delegationDelegatorDid: lockedDelegation.delegator_did,
      });
      if (lockedDelegation.status !== 'active') {
        throw new ValidationError('Delegation is not active');
      }

      const [row] = await trx
        .updateTable('delegation')
        .set({ status: 'revoked', revoked_at: this.clock.now() })
        .where('uri', '=', delegationUri)
        .returningAll()
        .execute();
      return row!;
    });
  }

  private async assertDelegationCommandAllowed(
    db: DelegationCommandDb,
    cooperativeDid: string,
    candidate: CoopVoteWeightDelegation,
  ): Promise<void> {
    const activeDelegations = await db
      .selectFrom('delegation')
      .where('did', '=', cooperativeDid)
      .where('status', '=', 'active')
      .select(['delegator_did', 'delegatee_did', 'scope', 'proposal_uri'])
      .orderBy('created_at', 'asc')
      .orderBy('uri', 'asc')
      .execute();
    const decision = validateCoopDelegationCommand({
      activeDelegations: activeDelegations.flatMap(toCoopDelegation),
      candidate,
    });

    if (!decision.allowed) {
      throw new ValidationError(decision.message);
    }
  }

  private async authorizeDelegationRevocation(args: {
    readonly cooperativeDid: string;
    readonly actorDid: string;
    readonly delegationDelegatorDid: string;
  }): Promise<void> {
    if (!this.actionAuthorizer) {
      if (args.actorDid !== args.delegationDelegatorDid) {
        throw new ValidationError('Only the delegator can revoke a delegation');
      }
      return;
    }

    const memberSpace = membersSpace(args.cooperativeDid as DID);
    const decision = await this.actionAuthorizer.authorize({
      actor: { did: args.actorDid },
      cooperative: {
        authorityDid: args.cooperativeDid,
        spaceKey: memberSpace.spaceKey,
        spaceType: memberSpace.expectedSpaceType,
      },
      action: 'delegation.revoke.own',
      at: this.clock.now().toISOString(),
      payload: {
        delegationDelegatorDid: args.delegationDelegatorDid,
      },
    });

    if (!decision.authorized) {
      throw new ValidationError('Only the delegator can revoke a delegation');
    }
  }
}

async function getActiveDelegation(
  db: DelegationCommandDb,
  cooperativeDid: string,
  delegatorDid: string,
  scope: string,
  proposalUri?: string,
) {
  let query = db
    .selectFrom('delegation')
    .where('did', '=', cooperativeDid)
    .where('delegator_did', '=', delegatorDid)
    .where('scope', '=', scope)
    .where('status', '=', 'active')
    .selectAll();

  query = proposalUri
    ? query.where('proposal_uri', '=', proposalUri)
    : query.where('proposal_uri', 'is', null);
  return query.executeTakeFirst();
}

function toCoopDelegation(
  row: {
    readonly delegator_did: string;
    readonly delegatee_did: string;
    readonly scope: string;
    readonly proposal_uri: string | null;
  },
): readonly CoopVoteWeightDelegation[] {
  if (row.scope !== 'project' && row.scope !== 'proposal') {
    return [];
  }

  return [
    {
      delegatorDid: row.delegator_did,
      delegateeDid: row.delegatee_did,
      scope: row.scope,
      proposalUri: row.proposal_uri,
    },
  ];
}

function defaultDelegationRkey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function lockDelegationCommands(
  trx: Transaction<Database>,
  cooperativeDid: string,
): Promise<void> {
  await sql`select pg_advisory_xact_lock(hashtext('csn-delegation-command'), hashtext(${cooperativeDid}))`.execute(
    trx,
  );
}
