import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { IClock } from '@coopsource/federation';
import { NotFoundError, ValidationError } from '@coopsource/common';
import type { CreateDelegationInput } from '@coopsource/common';
import type { PageParams, Page } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

export interface ActiveVoteDelegationRow {
  readonly delegator_did: string;
  readonly delegatee_did: string;
  readonly scope: string;
  readonly proposal_uri: string | null;
}

interface EffectiveDelegationRow {
  readonly delegator_did: string;
  readonly delegatee_did: string;
  readonly scope: string;
  readonly proposal_uri: string | null;
}

export class DelegationVotingService {
  constructor(
    private db: Kysely<Database>,
    private clock: IClock,
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

    if (data.scope === 'proposal' && !data.proposalUri) {
      throw new ValidationError('proposalUri is required for proposal scope');
    }

    if (data.scope === 'project' && data.proposalUri) {
      throw new ValidationError('proposalUri is only valid for proposal scope');
    }

    await this.assertNoEffectiveCircularDelegation(cooperativeDid, {
      delegator_did: delegatorDid,
      delegatee_did: data.delegateeDid,
      scope: data.scope,
      proposal_uri: data.proposalUri ?? null,
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

  private async assertNoEffectiveCircularDelegation(
    cooperativeDid: string,
    candidate: EffectiveDelegationRow,
  ): Promise<void> {
    const activeDelegations =
      await this.listActiveDelegationsForVoteWeight(cooperativeDid);
    const delegations = [
      ...activeDelegations.filter(
        (delegation) => !replacesDelegation(candidate, delegation),
      ),
      candidate,
    ];

    for (const proposalUri of affectedProposalContexts(
      delegations,
      candidate,
    )) {
      const effective = effectiveDelegationsForProposal(
        delegations,
        proposalUri,
      );
      if (hasDelegationCycle(effective)) {
        throw new ValidationError('Circular delegation detected');
      }
    }
  }
}

function replacesDelegation(
  candidate: EffectiveDelegationRow,
  existing: EffectiveDelegationRow,
): boolean {
  return (
    existing.delegator_did === candidate.delegator_did &&
    existing.scope === candidate.scope &&
    existing.proposal_uri === candidate.proposal_uri
  );
}

function affectedProposalContexts(
  delegations: readonly EffectiveDelegationRow[],
  candidate: EffectiveDelegationRow,
): readonly (string | null)[] {
  if (candidate.scope === 'proposal') {
    return [candidate.proposal_uri];
  }

  const contexts = new Set<string | null>([null]);
  for (const delegation of delegations) {
    if (delegation.scope === 'proposal' && delegation.proposal_uri) {
      contexts.add(delegation.proposal_uri);
    }
  }
  return [...contexts];
}

function effectiveDelegationsForProposal(
  delegations: readonly EffectiveDelegationRow[],
  proposalUri: string | null,
): ReadonlyMap<string, EffectiveDelegationRow> {
  const effective = new Map<string, EffectiveDelegationRow>();

  for (const delegation of delegations) {
    if (delegation.scope === 'proposal') {
      if (delegation.proposal_uri === proposalUri) {
        effective.set(delegation.delegator_did, delegation);
      }
      continue;
    }

    if (
      delegation.scope === 'project' &&
      !effective.has(delegation.delegator_did)
    ) {
      effective.set(delegation.delegator_did, delegation);
    }
  }

  return effective;
}

function hasDelegationCycle(
  delegationsByDelegator: ReadonlyMap<string, EffectiveDelegationRow>,
): boolean {
  for (const startDid of delegationsByDelegator.keys()) {
    const visited = new Set<string>();
    let currentDid = startDid;

    while (true) {
      if (visited.has(currentDid)) return true;
      visited.add(currentDid);

      const delegation = delegationsByDelegator.get(currentDid);
      if (!delegation) break;

      currentDid = delegation.delegatee_did;
    }
  }

  return false;
}
