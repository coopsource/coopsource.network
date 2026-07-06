import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { IClock } from '@coopsource/federation';
import { NotFoundError, ValidationError, type DID } from '@coopsource/common';
import type { CreateDelegationInput } from '@coopsource/common';
import type { PageParams, Page } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';
import type { MembershipReadModel } from './membership-read-model.js';

export class DelegationVotingService {
  constructor(
    private db: Kysely<Database>,
    private clock: IClock,
    private membershipReadModel: MembershipReadModel,
  ) {}

  async createDelegation(
    cooperativeDid: string,
    delegatorDid: string,
    data: CreateDelegationInput,
  ) {
    // Prevent self-delegation
    if (delegatorDid === data.delegateeDid) {
      throw new ValidationError('Cannot delegate to yourself');
    }

    // Check for circular delegation
    const chain = await this.getDelegationChain(
      cooperativeDid,
      data.delegateeDid,
      data.scope,
      data.proposalUri,
    );
    if (chain.some((d) => d.delegatee_did === delegatorDid)) {
      throw new ValidationError('Circular delegation detected');
    }

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
    if (delegation.delegator_did !== delegatorDid) {
      throw new ValidationError('Only the delegator can revoke a delegation');
    }
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

  async calculateVoteWeight(
    cooperativeDid: string,
    voterDid: string,
    proposalId: string,
  ): Promise<number> {
    // Find the proposal to get its URI for proposal-scoped delegations
    const proposal = await this.db
      .selectFrom('proposal')
      .where('id', '=', proposalId)
      .where('cooperative_did', '=', cooperativeDid)
      .select(['uri'])
      .executeTakeFirst();

    // Count all active delegations where the voter is the final delegatee
    // This includes both project-level and proposal-level delegations
    const allDelegations = await this.db
      .selectFrom('delegation')
      .where('did', '=', cooperativeDid)
      .where('status', '=', 'active')
      .selectAll()
      .execute();

    // Proposal-scoped delegations override project-level delegations for the
    // same delegator on the matching proposal.
    const activeDelegationByDelegator = new Map<
      string,
      (typeof allDelegations)[number]
    >();
    for (const d of allDelegations) {
      const isProposalLevel =
        d.scope === 'proposal' &&
        proposal?.uri &&
        d.proposal_uri === proposal.uri;
      if (isProposalLevel) {
        activeDelegationByDelegator.set(d.delegator_did, d);
      } else if (
        d.scope === 'project' &&
        !activeDelegationByDelegator.has(d.delegator_did)
      ) {
        activeDelegationByDelegator.set(d.delegator_did, d);
      }
    }

    const delegators = new Set<string>();
    for (const d of activeDelegationByDelegator.values()) {
      let current = d.delegatee_did;
      const visited = new Set<string>([d.delegator_did]);

      while (current !== voterDid) {
        if (visited.has(current)) break;
        visited.add(current);

        const next = activeDelegationByDelegator.get(current);
        if (!next) break;
        current = next.delegatee_did;
      }

      if (current === voterDid) {
        delegators.add(d.delegator_did);
      }
    }

    // Class-aware weight: voter's class weight + sum of delegators' class weights
    const voterWeight = await this.getMemberClassWeight(
      cooperativeDid,
      voterDid,
    );
    let totalDelegated = 0;
    for (const delegatorDid of delegators) {
      totalDelegated += await this.getMemberClassWeight(
        cooperativeDid,
        delegatorDid,
      );
    }
    return voterWeight + totalDelegated;
  }

  async calculateVoteWeightForProposalUri(
    cooperativeDid: string,
    voterDid: string,
    proposalUri: string,
  ): Promise<number> {
    const proposal = await this.db
      .selectFrom('proposal')
      .where('cooperative_did', '=', cooperativeDid)
      .where('uri', '=', proposalUri)
      .select('id')
      .executeTakeFirst();

    if (!proposal) {
      throw new NotFoundError('Proposal not found');
    }

    return this.calculateVoteWeight(cooperativeDid, voterDid, proposal.id);
  }

  private async getMemberClassWeight(
    cooperativeDid: string,
    memberDid: string,
  ): Promise<number> {
    return this.membershipReadModel.getProjectedMemberVoteWeight(
      cooperativeDid as DID,
      memberDid as DID,
    );
  }
}
