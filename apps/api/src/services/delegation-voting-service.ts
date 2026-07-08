import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { IClock } from '@coopsource/federation';
import { membersSpace } from '@coopsource/arbiter-client';
import { NotFoundError, ValidationError, type DID } from '@coopsource/common';
import type { ActionAuthorizerPlugin } from '@coopsource/governance-view';
import {
  validateCoopDelegationCommand,
  type CoopVoteWeightDelegation,
} from '@coopsource/coop-view';
import type { CreateDelegationInput } from '@coopsource/common';
import type { PageParams, Page } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

export interface ActiveVoteDelegationRow {
  readonly delegator_did: string;
  readonly delegatee_did: string;
  readonly scope: string;
  readonly proposal_uri: string | null;
}

export class DelegationVotingService {
  constructor(
    private db: Kysely<Database>,
    private clock: IClock,
    private actionAuthorizer?: ActionAuthorizerPlugin,
  ) {}

  async createDelegation(
    cooperativeDid: string,
    delegatorDid: string,
    data: CreateDelegationInput,
  ) {
    await this.assertDelegationCommandAllowed(cooperativeDid, {
      delegatorDid,
      delegateeDid: data.delegateeDid,
      scope: data.scope,
      proposalUri: data.proposalUri ?? null,
    });

    // Revoke any existing active delegation in the same scope
    const existing = await this.getActiveDelegation(
      cooperativeDid,
      delegatorDid,
      data.scope,
      data.proposalUri,
    );
    if (existing) {
      await this.db
        .updateTable('delegation')
        .set({ status: 'revoked', revoked_at: this.clock.now() })
        .where('uri', '=', existing.uri)
        .execute();
    }

    const now = this.clock.now();
    const rkey = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const uri = `at://${cooperativeDid}/network.coopsource.governance.delegation/${rkey}`;

    const [row] = await this.db
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
  }

  async revokeDelegation(
    cooperativeDid: string,
    delegatorDid: string,
    delegationUri: string,
  ) {
    const delegation = await this.db
      .selectFrom('delegation')
      .where('uri', '=', delegationUri)
      .where('did', '=', cooperativeDid)
      .selectAll()
      .executeTakeFirst();

    if (!delegation) throw new NotFoundError('Delegation not found');
    await this.authorizeDelegationRevocation({
      cooperativeDid,
      actorDid: delegatorDid,
      delegationDelegatorDid: delegation.delegator_did,
    });
    if (delegation.status !== 'active') {
      throw new ValidationError('Delegation is not active');
    }

    const [row] = await this.db
      .updateTable('delegation')
      .set({ status: 'revoked', revoked_at: this.clock.now() })
      .where('uri', '=', delegationUri)
      .returningAll()
      .execute();
    return row!;
  }

  async getActiveDelegation(
    cooperativeDid: string,
    delegatorDid: string,
    scope: string,
    proposalUri?: string,
  ) {
    let query = this.db
      .selectFrom('delegation')
      .where('did', '=', cooperativeDid)
      .where('delegator_did', '=', delegatorDid)
      .where('scope', '=', scope)
      .where('status', '=', 'active')
      .selectAll();

    if (proposalUri) {
      query = query.where('proposal_uri', '=', proposalUri);
    } else {
      query = query.where('proposal_uri', 'is', null);
    }

    return query.executeTakeFirst();
  }

  async listDelegations(
    cooperativeDid: string,
    params: PageParams & { status?: string },
  ): Promise<Page<Record<string, unknown>>> {
    const limit = params.limit ?? 50;
    let query = this.db
      .selectFrom('delegation')
      .where('did', '=', cooperativeDid)
      .selectAll()
      .orderBy('created_at', 'desc')
      .orderBy('uri', 'desc')
      .limit(limit + 1);

    if (params.status) {
      query = query.where('status', '=', params.status);
    }

    if (params.cursor) {
      const { t, i } = decodeCursor(params.cursor);
      query = query.where((eb) =>
        eb.or([
          eb('created_at', '<', new Date(t)),
          eb.and([eb('created_at', '=', new Date(t)), eb('uri', '<', i)]),
        ]),
      );
    }

    const rows = await query.execute();
    const slice = rows.slice(0, limit);
    const cursor =
      rows.length > limit
        ? encodeCursor(
            slice[slice.length - 1]!.created_at as Date,
            slice[slice.length - 1]!.uri,
          )
        : undefined;

    return { items: slice as Record<string, unknown>[], cursor };
  }

  async getDelegationChain(
    cooperativeDid: string,
    memberDid: string,
    scope: string,
    proposalUri?: string,
  ) {
    const chain: Array<{ delegator_did: string; delegatee_did: string }> = [];
    const visited = new Set<string>();
    let currentDid = memberDid;

    while (true) {
      if (visited.has(currentDid)) break;
      visited.add(currentDid);

      let query = this.db
        .selectFrom('delegation')
        .where('did', '=', cooperativeDid)
        .where('delegator_did', '=', currentDid)
        .where('scope', '=', scope)
        .where('status', '=', 'active')
        .selectAll();

      if (proposalUri) {
        query = query.where('proposal_uri', '=', proposalUri);
      } else {
        query = query.where('proposal_uri', 'is', null);
      }

      const delegation = await query.executeTakeFirst();
      if (!delegation) break;

      chain.push({
        delegator_did: delegation.delegator_did,
        delegatee_did: delegation.delegatee_did,
      });
      currentDid = delegation.delegatee_did;
    }

    return chain;
  }

  async listActiveDelegationsForVoteWeight(
    cooperativeDid: string,
  ): Promise<ActiveVoteDelegationRow[]> {
    return this.db
      .selectFrom('delegation')
      .where('did', '=', cooperativeDid)
      .where('status', '=', 'active')
      .select(['delegator_did', 'delegatee_did', 'scope', 'proposal_uri'])
      .orderBy('created_at', 'asc')
      .orderBy('uri', 'asc')
      .execute();
  }

  private async assertDelegationCommandAllowed(
    cooperativeDid: string,
    candidate: CoopVoteWeightDelegation,
  ): Promise<void> {
    const activeDelegations =
      await this.listActiveDelegationsForVoteWeight(cooperativeDid);
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

function toCoopDelegation(
  row: ActiveVoteDelegationRow,
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
