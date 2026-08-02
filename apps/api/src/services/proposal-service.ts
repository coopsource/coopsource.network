import type { Kysely, Selectable } from 'kysely';
import type {
  Database,
  ProposalTable,
  PublicGovernanceAnchorTable,
  VoteTable,
} from '@coopsource/db';
import { membersSpace } from '@coopsource/arbiter-client';
import type {
  PermissionedRecordWritePort,
  PermissionedRecordWriteResult,
  SpaceRef,
} from '@coopsource/spaces-consumer';
import type {
  GovernanceClassDenominator,
  GovernanceClassQuorumRule,
  GovernanceGroupRef,
  GovernanceProposalLifecycleAction,
  GovernanceProposalRef,
  GovernanceQuorumConfig,
  GovernanceView,
} from '@coopsource/governance-view';
import {
  formatPermissionedRecordLocationUri,
  isSpaceRecordUri,
  parseSpaceRecordUri,
  PermissionedRecordWriteError,
} from '@coopsource/spaces-consumer';

type ProposalRow = Selectable<ProposalTable>;
type PublicGovernanceAnchorRow = Selectable<PublicGovernanceAnchorTable>;
type VoteRow = Selectable<VoteTable>;
import type {
  AtUri,
  CID,
  CreateProposalRequest,
  DID,
  UpdateProposalRequest,
} from '@coopsource/common';
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@coopsource/common';
import type { IPdsService, IClock, RecordRef } from '@coopsource/federation';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';
import { logger } from '../middleware/logger.js';
import type { MembershipReadModel } from './membership-read-model.js';

export interface ProposalWithVotes {
  proposal: ProposalRow;
  votes: VoteRow[];
  voteSummary: Readonly<Record<string, number>>;
}

export interface CreateProposalInput extends CreateProposalRequest {
  cooperativeDid: string;
}

export type UpdateDraftProposalInput = UpdateProposalRequest;

import type { IMemberRecordWriter } from './member-write-proxy.js';
import type { GovernanceLabeler } from './governance-labeler.js';
import type { GovernanceRecordPlacementPort } from './governance-record-placement-port.js';
import type {
  PublicGovernanceAnchorService,
  PublicGovernanceAnchorWriteResult,
  ProposalAnchorRecord,
} from './public-governance-anchor-service.js';

const PROPOSAL_COLLECTION = 'network.coopsource.governance.proposal';
const VOTE_COLLECTION = 'network.coopsource.governance.vote';

export class ProposalService {
  constructor(
    private db: Kysely<Database>,
    private pdsService: IPdsService,
    private clock: IClock,
    private membershipReadModel: MembershipReadModel,
    private governanceView: GovernanceView,
    private governanceRecordPlacement: GovernanceRecordPlacementPort,
    private memberWriteProxy?: IMemberRecordWriter,
    private labeler?: GovernanceLabeler,
    private permissionedRecordWriter?: PermissionedRecordWritePort,
    private publicGovernanceAnchorService?: PublicGovernanceAnchorService,
  ) {}

  async listProposals(
    cooperativeDid: string,
    params: PageParams & { status?: string },
  ): Promise<Page<ProposalRow>> {
    const limit = params.limit ?? 50;
    let query = this.db
      .selectFrom('proposal')
      .where('cooperative_did', '=', cooperativeDid)
      .where('invalidated_at', 'is', null)
      .selectAll()
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1);

    if (params.status) {
      query = query.where('status', '=', params.status);
    }

    if (params.cursor) {
      const { t, i } = decodeCursor(params.cursor);
      query = query.where((eb) =>
        eb.or([
          eb('created_at', '<', new Date(t)),
          eb.and([eb('created_at', '=', new Date(t)), eb('id', '<', i)]),
        ]),
      );
    }

    const rows = await query.execute();
    const slice = rows.slice(0, limit);
    const cursor =
      rows.length > limit
        ? encodeCursor(
            slice[slice.length - 1]!.created_at,
            slice[slice.length - 1]!.id,
          )
        : undefined;

    return { items: slice, cursor };
  }

  /**
   * V8.5 — public-safe proposal listing for `/explore/[handle]` profile pages.
   * Returns a narrow projection of up to `limit` non-draft, non-tombstoned
   * proposals for the given coop. Closed-governance coops route proposals into
   * `private_record` (Tier 2) so they're naturally excluded from this query.
   */
  async listPublicProposals(
    cooperativeDid: string,
    limit = 5,
  ): Promise<
    Array<{
      id: string;
      title: string;
      status: string;
      created_at: Date;
      resolved_at: Date | null;
    }>
  > {
    const rows = await this.db
      .selectFrom('proposal')
      .where('cooperative_did', '=', cooperativeDid)
      .where('invalidated_at', 'is', null)
      .where('status', 'in', ['open', 'closed', 'resolved'])
      .select(['id', 'title', 'status', 'created_at', 'resolved_at'])
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit)
      .execute();

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      created_at: r.created_at,
      resolved_at: r.resolved_at,
    }));
  }

  async listPublicProposalAnchors(
    cooperativeDid: string,
    params: PageParams & { status?: string } = {},
  ): Promise<Page<PublicGovernanceAnchorRow>> {
    const limit = params.limit ?? 50;
    let query = this.db
      .selectFrom('public_governance_anchor')
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .orderBy('updated_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1);

    if (params.status) {
      query = query.where('status', '=', params.status);
    }

    if (params.cursor) {
      const { t, i } = decodeCursor(params.cursor);
      query = query.where((eb) =>
        eb.or([
          eb('updated_at', '<', new Date(t)),
          eb.and([eb('updated_at', '=', new Date(t)), eb('id', '<', i)]),
        ]),
      );
    }

    const rows = await query.execute();
    const slice = rows.slice(0, limit);
    const cursor =
      rows.length > limit
        ? encodeCursor(
            slice[slice.length - 1]!.updated_at,
            slice[slice.length - 1]!.id,
          )
        : undefined;

    return { items: slice, cursor };
  }

  async getProposal(
    id: string,
    cooperativeDid?: string,
  ): Promise<ProposalWithVotes | null> {
    let query = this.db
      .selectFrom('proposal')
      .where('id', '=', id)
      .where('invalidated_at', 'is', null)
      .selectAll();

    if (cooperativeDid) {
      query = query.where('cooperative_did', '=', cooperativeDid);
    }

    const proposal = await query.executeTakeFirst();

    if (!proposal) return null;

    const votes = await this.db
      .selectFrom('vote')
      .where('proposal_id', '=', id)
      .where('retracted_at', 'is', null)
      .selectAll()
      .execute();

    return {
      proposal,
      votes,
      voteSummary: this.projectVoteSummary(votes),
    };
  }

  async getProposalByUri(
    uri: string,
    cooperativeDid?: string,
  ): Promise<ProposalWithVotes | null> {
    let query = this.db
      .selectFrom('proposal')
      .where('uri', '=', uri)
      .where('invalidated_at', 'is', null)
      .selectAll();

    if (cooperativeDid) {
      query = query.where('cooperative_did', '=', cooperativeDid);
    }

    const proposal = await query.executeTakeFirst();

    if (!proposal) return null;

    const votes = await this.db
      .selectFrom('vote')
      .where('proposal_id', '=', proposal.id)
      .where('retracted_at', 'is', null)
      .selectAll()
      .execute();

    return {
      proposal,
      votes,
      voteSummary: this.projectVoteSummary(votes),
    };
  }

  async createProposal(
    authorDid: string,
    data: CreateProposalInput,
  ): Promise<ProposalRow> {
    const now = this.clock.now();

    const collection = PROPOSAL_COLLECTION;
    const record = proposalRecordFromCreateInput(data, now);
    const placement =
      await this.governanceRecordPlacement.resolveWritePlacement({
        cooperativeDid: data.cooperativeDid,
        collection,
        // The row below is inserted as `draft`; publishing the text before the
        // cooperative has opened it is irreversible (audit C-03).
        lifecycleState: 'draft',
      });

    let ref: RecordRef | undefined;
    try {
      if (placement.kind === 'permissioned-space') {
        ref = await this.writePermissionedRecordRef({
          space: placement.space,
          authorDid,
          collection,
          record,
        });
      } else {
        ref = await this.pdsService.createRecord({
          did: authorDid as DID,
          collection,
          record,
        });
      }

      const [row] = await this.db
        .insertInto('proposal')
        .values({
          uri: ref.uri,
          cid: ref.cid,
          cooperative_did: data.cooperativeDid,
          author_did: authorDid,
          title: data.title,
          body: data.body,
          body_format: data.bodyFormat ?? 'text',
          voting_type: data.votingType,
          options: null,
          quorum_type: data.quorumType,
          quorum_basis: data.quorumBasis ?? 'votesCast',
          quorum_threshold: data.quorumThreshold ?? null,
          status: 'draft',
          closes_at: data.closesAt ? new Date(data.closesAt) : null,
          tags: data.tags ?? [],
          meeting_event: data.meetingEvent ?? null,
          full_document: data.fullDocument ?? null,
          discussion_thread: data.discussionThread ?? null,
          created_at: now,
          created_by: authorDid,
          indexed_at: now,
        })
        .returningAll()
        .execute();

      return row!;
    } catch (err) {
      if (ref) {
        await this.deleteProposalSourceUri(ref.uri).catch((cleanupErr) => {
          logger.warn(
            { err: cleanupErr, uri: ref?.uri },
            'Failed to clean up proposal record after projection failure',
          );
        });
      }
      throw err;
    }
  }

  async updateDraftProposal(params: {
    readonly id: string;
    readonly cooperativeDid: string;
    readonly data: UpdateDraftProposalInput;
  }): Promise<ProposalRow> {
    const proposal = await this.db
      .selectFrom('proposal')
      .where('id', '=', params.id)
      .where('cooperative_did', '=', params.cooperativeDid)
      .where('invalidated_at', 'is', null)
      .selectAll()
      .executeTakeFirst();
    if (!proposal) throw new NotFoundError('Proposal not found');
    this.assertProposalActionAllowed(proposal.status, 'edit');

    const closesAt =
      params.data.closesAt === undefined
        ? proposal.closes_at
        : params.data.closesAt === null
          ? null
          : new Date(params.data.closesAt);
    const nextProposal: ProposalRow = {
      ...proposal,
      ...(params.data.title !== undefined ? { title: params.data.title } : {}),
      ...(params.data.body !== undefined ? { body: params.data.body } : {}),
      ...(params.data.tags !== undefined ? { tags: params.data.tags } : {}),
      closes_at: closesAt,
    };

    const sourceRef = await this.updateProposalSourceRecord(nextProposal);
    const now = this.clock.now();
    const [updated] = await this.db
      .updateTable('proposal')
      .set({
        ...(params.data.title !== undefined
          ? { title: params.data.title }
          : {}),
        ...(params.data.body !== undefined ? { body: params.data.body } : {}),
        ...(params.data.closesAt !== undefined ? { closes_at: closesAt } : {}),
        ...(params.data.tags !== undefined ? { tags: params.data.tags } : {}),
        uri: sourceRef.uri,
        cid: sourceRef.cid,
        indexed_at: now,
      })
      .where('id', '=', params.id)
      .returningAll()
      .execute();

    return updated!;
  }

  async deleteProposal(params: {
    readonly id: string;
    readonly cooperativeDid: string;
    readonly actorDid: string;
  }): Promise<void> {
    const proposal = await this.db
      .selectFrom('proposal')
      .where('id', '=', params.id)
      .where('cooperative_did', '=', params.cooperativeDid)
      .where('invalidated_at', 'is', null)
      .selectAll()
      .executeTakeFirst();
    if (!proposal) throw new NotFoundError('Proposal not found');

    await this.deleteProposalSourceRecord(proposal);
    await this.withdrawPublicGovernanceAnchorIfPresent(proposal);

    const now = this.clock.now();
    await this.db
      .updateTable('proposal')
      .set({
        status: 'withdrawn',
        invalidated_at: now,
        invalidated_by: params.actorDid,
        indexed_at: now,
      })
      .where('id', '=', params.id)
      .execute();
  }

  async openProposal(
    id: string,
    actorDid: string,
    cooperativeDid?: string,
  ): Promise<ProposalRow> {
    const proposal = await this._getOwnedProposal(id, actorDid, cooperativeDid);
    this.assertProposalActionAllowed(proposal.status, 'open');
    this.assertExecutableVotingType(proposal);

    const now = this.clock.now();
    const [updated] = await this.db
      .updateTable('proposal')
      .set({ status: 'open', opens_at: now, indexed_at: now })
      .where('id', '=', id)
      .returningAll()
      .execute();

    await this.upsertPublicGovernanceAnchor(updated!);

    return updated!;
  }

  async closeProposal(
    id: string,
    _actorDid: string,
    cooperativeDid?: string,
  ): Promise<ProposalRow> {
    let query = this.db
      .selectFrom('proposal')
      .where('id', '=', id)
      .where('invalidated_at', 'is', null)
      .selectAll();

    if (cooperativeDid) {
      query = query.where('cooperative_did', '=', cooperativeDid);
    }

    const proposal = await query.executeTakeFirst();

    if (!proposal) throw new NotFoundError('Proposal not found');
    this.assertProposalActionAllowed(proposal.status, 'close');

    const now = this.clock.now();
    const [updated] = await this.db
      .updateTable('proposal')
      .set({ status: 'closed', closes_at: now, indexed_at: now })
      .where('id', '=', id)
      .returningAll()
      .execute();

    await this.upsertPublicGovernanceAnchor(updated!);

    return updated!;
  }

  async castVote(params: {
    proposalId: string;
    cooperativeDid?: string;
    voterDid: string;
    choice: string;
    rationale?: string;
  }): Promise<VoteRow> {
    let query = this.db
      .selectFrom('proposal')
      .where('id', '=', params.proposalId)
      .where('invalidated_at', 'is', null)
      .selectAll();

    if (params.cooperativeDid) {
      query = query.where('cooperative_did', '=', params.cooperativeDid);
    }

    const proposal = await query.executeTakeFirst();

    if (!proposal) throw new NotFoundError('Proposal not found');
    this.assertProposalActionAllowed(proposal.status, 'vote');
    this.assertExecutableVotingType(proposal);

    const now = this.clock.now();
    const weight = await this.weightForVote({
      proposal,
      voterDid: params.voterDid,
      choice: params.choice,
      at: now,
    });

    const collection = VOTE_COLLECTION;
    const voteRecord = {
      proposal: proposal.uri,
      proposalCid: proposal.cid,
      choice: params.choice,
      rationale: params.rationale,
      createdAt: now.toISOString(),
    };
    const writePublicVote = () =>
      this.memberWriteProxy
        ? this.memberWriteProxy.writeRecord({
            memberDid: params.voterDid as DID,
            collection,
            record: voteRecord,
          })
        : this.pdsService.createRecord({
            did: params.voterDid as DID,
            collection,
            record: voteRecord,
          });

    let ref: RecordRef | undefined;
    try {
      const placement =
        await this.governanceRecordPlacement.resolveWritePlacement({
          cooperativeDid: proposal.cooperative_did,
          collection,
        });
      if (placement.kind === 'permissioned-space') {
        ref = await this.writePermissionedRecordRef({
          space: placement.space,
          authorDid: params.voterDid,
          collection,
          record: voteRecord,
        });
      } else {
        ref = await writePublicVote();
      }

      await this.retractActiveVotes({
        proposalId: params.proposalId,
        voterDid: params.voterDid,
        retractedAt: now,
      });

      const [vote] = await this.db
        .insertInto('vote')
        .values({
          uri: ref.uri,
          cid: ref.cid,
          proposal_id: params.proposalId,
          proposal_uri: proposal.uri ?? '',
          proposal_cid: proposal.cid ?? '',
          voter_did: params.voterDid,
          choice: params.choice,
          vote_weight: weight,
          rationale: params.rationale ?? null,
          created_at: now,
          indexed_at: now,
        })
        .returningAll()
        .execute();

      return vote!;
    } catch (err) {
      if (ref?.uri) {
        await this.deletePermissionedRecordIfNeeded(ref.uri).catch(
          (cleanupErr) => {
            logger.warn(
              { err: cleanupErr, uri: ref?.uri },
              'Failed to clean up permissioned vote record after cast failure',
            );
          },
        );
      }
      throw err;
    }
  }

  async retractVote(params: {
    proposalId: string;
    actorDid: string;
    cooperativeDid?: string;
    voterDid?: string;
  }): Promise<void> {
    const voterDid = params.voterDid ?? params.actorDid;
    let proposalQuery = this.db
      .selectFrom('proposal')
      .where('id', '=', params.proposalId)
      .where('invalidated_at', 'is', null)
      .select(['id', 'uri', 'cid', 'cooperative_did']);

    if (params.cooperativeDid) {
      proposalQuery = proposalQuery.where(
        'cooperative_did',
        '=',
        params.cooperativeDid,
      );
    }

    const proposal = await proposalQuery.executeTakeFirst();
    if (!proposal) throw new NotFoundError('Proposal not found');

    const votes = await this.db
      .selectFrom('vote')
      .where('proposal_id', '=', params.proposalId)
      .where('voter_did', '=', voterDid)
      .where('retracted_at', 'is', null)
      .select(['id', 'uri', 'voter_did'])
      .execute();

    if (votes.length === 0) throw new NotFoundError('Vote not found');

    await this.authorizeVoteRetraction({
      proposal,
      actorDid: params.actorDid,
      voteVoterDid: votes[0]!.voter_did,
    });

    await this.retractVoteRows(votes, voterDid, this.clock.now());
  }

  async resolveProposal(
    id: string,
    cooperativeDid?: string,
  ): Promise<ProposalRow> {
    let proposalQuery = this.db
      .selectFrom('proposal')
      .where('id', '=', id)
      .where('invalidated_at', 'is', null)
      .selectAll();

    if (cooperativeDid) {
      proposalQuery = proposalQuery.where(
        'cooperative_did',
        '=',
        cooperativeDid,
      );
    }

    const proposal = await proposalQuery.executeTakeFirst();

    if (!proposal) throw new NotFoundError('Proposal not found');
    this.assertProposalActionAllowed(proposal.status, 'resolve');
    this.assertExecutableVotingType(proposal);

    // Tally votes
    const votes = await this.db
      .selectFrom('vote')
      .where('proposal_id', '=', id)
      .where('retracted_at', 'is', null)
      .selectAll()
      .execute();

    const memberCounts =
      await this.membershipReadModel.countProjectedActiveMembersByCooperative([
        proposal.cooperative_did as DID,
      ]);
    const totalMembers = memberCounts.get(proposal.cooperative_did) ?? 0;

    const { weightedTally } = this.governanceView.reduceVoteTally(
      votes.map((vote) => ({
        choice: vote.choice,
        weight: vote.vote_weight ?? 1,
      })),
    );

    // Per-class quorum check
    const classQuorumRules = classQuorumRulesFromRecord(
      proposal.class_quorum_rules,
    );
    const classMap = classQuorumRules
      ? await this.membershipReadModel.getProjectedMemberClassMap(
          proposal.cooperative_did as DID,
          votes.map((v) => v.voter_did as DID),
        )
      : undefined;
    const quorumResult = await this.governanceView.plugins.quorum.evaluate({
      proposal: this.proposalRef(proposal),
      cooperative: this.cooperativeRef(proposal.cooperative_did),
      votes: votes.map((vote) => ({
        voter: { did: vote.voter_did },
        choice: vote.choice,
        weight: vote.vote_weight ?? 1,
        ...(classMap
          ? { memberClass: classMap.get(vote.voter_did) ?? null }
          : {}),
        at: vote.created_at.toISOString(),
      })),
      eligibleVoterCount: totalMembers,
      quorum: quorumConfigFromProposal(proposal),
      ...(classQuorumRules ? { classQuorumRules } : {}),
      ...(classQuorumRules
        ? {
            classDenominators: await this.classDenominators(
              proposal.cooperative_did,
              classQuorumRules,
            ),
          }
        : {}),
    });

    const outcome = this.governanceView.decideProposalOutcome({
      votingType: proposal.voting_type,
      weightedTally,
      quorum: quorumResult,
    });

    const now = this.clock.now();
    const [updated] = await this.db
      .updateTable('proposal')
      .set({
        status: 'resolved',
        outcome,
        resolved_at: now,
        indexed_at: now,
      })
      .where('id', '=', id)
      .returningAll()
      .execute();

    const publicAnchor = await this.upsertPublicGovernanceAnchor(updated!);

    // Emit governance label (best-effort)
    const labelSubject = updated
      ? getPublicGovernanceLabelSubject(updated, publicAnchor)
      : null;
    if (this.labeler && labelSubject) {
      const labelValue =
        outcome === 'passed'
          ? 'proposal-approved'
          : outcome === 'failed'
            ? 'proposal-rejected'
            : 'proposal-archived';
      await this.labeler.emitLabel(
        updated.cooperative_did,
        labelSubject.uri,
        labelValue as
          | 'proposal-approved'
          | 'proposal-rejected'
          | 'proposal-archived',
        labelSubject.cid,
      );
    }

    return updated!;
  }

  async resolveExpiredProposals(): Promise<void> {
    const now = this.clock.now();

    const expired = await this.db
      .selectFrom('proposal')
      .where('status', 'in', ['open', 'closed'])
      .where('closes_at', '<=', now)
      .where('invalidated_at', 'is', null)
      .select(['id', 'status', 'cooperative_did'])
      .execute();

    for (const proposal of expired) {
      try {
        for (const action of this.governanceView.planProposalExpiry(
          proposal.status,
        )) {
          if (action === 'close') {
            await this.closeProposal(
              proposal.id,
              proposal.cooperative_did,
              proposal.cooperative_did,
            );
          } else {
            await this.resolveProposal(proposal.id, proposal.cooperative_did);
          }
        }
      } catch (err) {
        logger.error(
          { err, proposalId: proposal.id },
          'Failed to resolve expired proposal',
        );
      }
    }
  }

  private projectVoteSummary(
    votes: ReadonlyArray<VoteRow>,
  ): Readonly<Record<string, number>> {
    return this.governanceView.reduceVoteTally(
      votes.map((vote) => ({ choice: vote.choice })),
    ).tally;
  }

  private assertProposalActionAllowed(
    status: string,
    action: GovernanceProposalLifecycleAction,
  ): void {
    const decision = this.governanceView.evaluateProposalAction(status, action);
    if (decision.allowed) return;

    throw new ValidationError(PROPOSAL_ACTION_ERROR_MESSAGES[action]);
  }

  private assertExecutableVotingType(proposal: ProposalRow): void {
    if (proposal.voting_type === 'binary') return;
    throw new ValidationError(
      `Voting type '${proposal.voting_type}' is readable but not executable`,
    );
  }

  private async writePermissionedRecordRef(args: {
    space: SpaceRef;
    authorDid: string;
    collection: string;
    record: Record<string, unknown>;
    rkey?: string;
  }): Promise<RecordRef> {
    if (!this.permissionedRecordWriter) {
      throw new Error(
        'GovernanceRecordPlacementPort selected a permissioned space without a PermissionedRecordWritePort',
      );
    }

    const write = await this.permissionedRecordWriter.createRecord({
      space: args.space,
      authorDid: args.authorDid as DID,
      collection: args.collection,
      record: args.record,
      rkey: args.rkey,
    });
    return permissionedRecordRef(write);
  }

  private async updateProposalSourceRecord(
    proposal: ProposalRow,
  ): Promise<RecordRef> {
    if (!proposal.uri) {
      throw new Error('Cannot update a proposal without a source URI');
    }

    const record = proposalRecordFromRow(proposal);
    const permissioned = parseSpaceRecordUri(proposal.uri);
    if (permissioned) {
      if (!this.permissionedRecordWriter) {
        throw new Error(
          'Permissioned proposal update requires a PermissionedRecordWritePort',
        );
      }
      const write = await this.permissionedRecordWriter.updateRecord({
        space: {
          arbiterDid: permissioned.spaceDid as DID,
          spaceKey: permissioned.skey,
          expectedSpaceType: permissioned.spaceType,
        },
        authorDid: permissioned.authorDid as DID,
        collection: permissioned.collection,
        rkey: permissioned.rkey,
        record,
      });
      return permissionedRecordRef(write);
    }

    const publicRecord = parsePublicRecordUri(proposal.uri);
    if (!publicRecord || publicRecord.collection !== PROPOSAL_COLLECTION) {
      throw new Error(`Unsupported proposal source URI: ${proposal.uri}`);
    }
    return this.pdsService.putRecord({
      did: publicRecord.did as DID,
      collection: publicRecord.collection,
      rkey: publicRecord.rkey,
      record,
    });
  }

  private async deleteProposalSourceRecord(
    proposal: ProposalRow,
  ): Promise<void> {
    if (!proposal.uri) return;
    await this.deleteProposalSourceUri(proposal.uri);
  }

  private async deleteProposalSourceUri(uri: string): Promise<void> {
    const permissioned = parseSpaceRecordUri(uri);
    if (permissioned) {
      await this.deletePermissionedRecordIfNeeded(uri);
      return;
    }

    const publicRecord = parsePublicRecordUri(uri);
    if (!publicRecord || publicRecord.collection !== PROPOSAL_COLLECTION) {
      throw new Error(`Unsupported proposal source URI: ${uri}`);
    }
    try {
      await this.pdsService.deleteRecord({
        did: publicRecord.did as DID,
        collection: publicRecord.collection,
        rkey: publicRecord.rkey,
      });
    } catch (err) {
      if (err instanceof NotFoundError) return;
      throw err;
    }
  }

  private async withdrawPublicGovernanceAnchorIfPresent(
    proposal: ProposalRow,
  ): Promise<void> {
    const existing = await this.db
      .selectFrom('public_governance_anchor')
      .where('proposal_id', '=', proposal.id)
      .select('id')
      .executeTakeFirst();
    if (!existing) return;

    await this.upsertPublicGovernanceAnchor({
      ...proposal,
      status: 'withdrawn',
    });
  }

  private async retractActiveVotes(args: {
    proposalId: string;
    voterDid: string;
    retractedAt: Date;
  }): Promise<void> {
    const votes = await this.db
      .selectFrom('vote')
      .where('proposal_id', '=', args.proposalId)
      .where('voter_did', '=', args.voterDid)
      .where('retracted_at', 'is', null)
      .select(['id', 'uri'])
      .execute();

    if (votes.length === 0) return;
    await this.retractVoteRows(votes, args.voterDid, args.retractedAt);
  }

  private async retractVoteRows(
    votes: Array<{ id: string; uri: string | null }>,
    voterDid: string,
    retractedAt: Date,
  ): Promise<void> {
    for (const vote of votes) {
      if (vote.uri) {
        await this.deletePermissionedRecordIfNeeded(vote.uri);
      }
    }

    await this.db
      .updateTable('vote')
      .set({ retracted_at: retractedAt, retracted_by: voterDid })
      .where(
        'id',
        'in',
        votes.map((vote) => vote.id),
      )
      .execute();
  }

  private async deletePermissionedRecordIfNeeded(uri: string): Promise<void> {
    const parsed = parseSpaceRecordUri(uri);
    if (!parsed) return;
    if (!this.permissionedRecordWriter) {
      throw new Error(
        'Permissioned vote retraction requires a PermissionedRecordWritePort',
      );
    }

    try {
      await this.permissionedRecordWriter.deleteRecord({
        space: {
          arbiterDid: parsed.spaceDid as DID,
          spaceKey: parsed.skey,
          expectedSpaceType: parsed.spaceType,
        },
        authorDid: parsed.authorDid as DID,
        collection: parsed.collection,
        rkey: parsed.rkey,
      });
    } catch (err) {
      if (
        err instanceof PermissionedRecordWriteError &&
        err.kind === 'not-found'
      ) {
        return;
      }
      throw err;
    }
  }

  private async weightForVote(params: {
    readonly proposal: ProposalRow;
    readonly voterDid: string;
    readonly choice: string;
    readonly at: Date;
  }): Promise<number> {
    const result = await this.governanceView.plugins.voteWeight.weightForVote({
      voter: { did: params.voterDid },
      proposal: this.proposalRef(params.proposal),
      cooperative: this.cooperativeRef(params.proposal.cooperative_did),
      voteChoice: params.choice,
      at: params.at.toISOString(),
    });

    return result.weight;
  }

  private async authorizeVoteRetraction(args: {
    readonly proposal: Pick<
      ProposalRow,
      'id' | 'uri' | 'cid' | 'cooperative_did'
    >;
    readonly actorDid: string;
    readonly voteVoterDid: string;
  }): Promise<void> {
    if (args.actorDid !== args.voteVoterDid) {
      throw new UnauthorizedError('Not the vote owner');
    }

    const decision =
      await this.governanceView.plugins.actionAuthorizer.authorize({
        actor: { did: args.actorDid },
        cooperative: this.cooperativeRef(args.proposal.cooperative_did),
        action: 'vote.retract.own',
        at: this.clock.now().toISOString(),
        ...(args.proposal.uri
          ? {
              proposal: {
                uri: args.proposal.uri,
                ...(args.proposal.cid ? { cid: args.proposal.cid } : {}),
                collection: PROPOSAL_COLLECTION,
              },
            }
          : {}),
        payload: { voteVoterDid: args.voteVoterDid },
      });

    if (!decision.authorized) {
      throw new UnauthorizedError('Not the vote owner');
    }
  }

  private proposalRef(proposal: ProposalRow): GovernanceProposalRef {
    if (!proposal.uri) {
      throw new Error(
        `Cannot evaluate proposal ${proposal.id}: missing proposal URI`,
      );
    }

    return {
      uri: proposal.uri,
      ...(proposal.cid ? { cid: proposal.cid } : {}),
      collection: PROPOSAL_COLLECTION,
    };
  }

  private cooperativeRef(cooperativeDid: string): GovernanceGroupRef {
    const memberSpace = membersSpace(cooperativeDid as DID);
    return {
      authorityDid: cooperativeDid,
      spaceKey: memberSpace.spaceKey,
      spaceType: memberSpace.expectedSpaceType,
    };
  }

  private async classDenominators(
    cooperativeDid: string,
    rules: Readonly<Record<string, GovernanceClassQuorumRule>>,
  ): Promise<readonly GovernanceClassDenominator[]> {
    const classes = Object.entries(rules)
      .filter(([, rule]) => rule.minWeightRatio !== undefined)
      .map(([className]) => className);

    return Promise.all(
      classes.map(async (className) => ({
        className,
        totalWeight:
          await this.membershipReadModel.getProjectedClassWeightDenominator(
            cooperativeDid as DID,
            className,
          ),
      })),
    );
  }

  private async upsertPublicGovernanceAnchor(
    proposal: ProposalRow,
  ): Promise<PublicGovernanceAnchorWriteResult | null> {
    if (
      !this.publicGovernanceAnchorService ||
      !proposal.uri ||
      !isSpaceRecordUri(proposal.uri)
    ) {
      return null;
    }

    try {
      const policy = await this.db
        .selectFrom('cooperative_profile')
        .where('entity_did', '=', proposal.cooperative_did)
        .select([
          'public_governance_anchors',
          'public_governance_anchor_outcomes',
        ])
        .executeTakeFirst();

      if (!policy) return null;

      const existingAnchor = await this.db
        .selectFrom('public_governance_anchor')
        .where('proposal_id', '=', proposal.id)
        .select('anchor_uri')
        .executeTakeFirst();

      const result =
        await this.publicGovernanceAnchorService.upsertProposalAnchor({
          policy: {
            enabled: policy.public_governance_anchors,
            publishOutcome: policy.public_governance_anchor_outcomes,
          },
          proposal: {
            cooperativeDid: proposal.cooperative_did,
            proposalId: proposal.id,
            status: proposal.status,
            outcome: proposal.outcome,
            openedAt: proposal.opens_at,
            closedAt: proposal.closes_at,
            resolvedAt: proposal.resolved_at,
          },
          existingAnchorUri: existingAnchor?.anchor_uri as AtUri | undefined,
        });

      if (!result) return null;
      await this.persistPublicGovernanceAnchor(proposal, result);
      return result;
    } catch (err) {
      logger.warn(
        { err, proposalId: proposal.id },
        'Failed to publish public governance anchor',
      );
      return null;
    }
  }

  private async persistPublicGovernanceAnchor(
    proposal: ProposalRow,
    result: PublicGovernanceAnchorWriteResult,
  ): Promise<void> {
    const now = this.clock.now();
    const row = publicGovernanceAnchorRow(proposal, result.record, now);

    await this.db
      .insertInto('public_governance_anchor')
      .values({
        ...row,
        anchor_uri: result.uri,
        anchor_cid: result.cid,
        created_at: now,
      })
      .onConflict((oc) =>
        oc.column('proposal_id').doUpdateSet({
          anchor_uri: result.uri,
          anchor_cid: result.cid,
          status: row.status,
          outcome: row.outcome,
          opened_at: row.opened_at,
          closed_at: row.closed_at,
          resolved_at: row.resolved_at,
          anchor_version: row.anchor_version,
          updated_at: now,
        }),
      )
      .execute();
  }

  private async _getOwnedProposal(
    id: string,
    actorDid: string,
    cooperativeDid?: string,
  ): Promise<ProposalRow> {
    let query = this.db
      .selectFrom('proposal')
      .where('id', '=', id)
      .where('invalidated_at', 'is', null)
      .selectAll();

    if (cooperativeDid) {
      query = query.where('cooperative_did', '=', cooperativeDid);
    }

    const proposal = await query.executeTakeFirst();

    if (!proposal) throw new NotFoundError('Proposal not found');
    if (proposal.author_did !== actorDid) {
      throw new UnauthorizedError('Not the proposal author');
    }

    return proposal;
  }
}

const PROPOSAL_ACTION_ERROR_MESSAGES: Readonly<
  Record<GovernanceProposalLifecycleAction, string>
> = {
  edit: 'Can only edit draft proposals',
  open: 'Can only open a draft proposal',
  close: 'Can only close an open proposal',
  vote: 'Proposal is not open for voting',
  resolve: 'Can only resolve a closed proposal',
};

function permissionedRecordRef(
  write: PermissionedRecordWriteResult,
): RecordRef {
  return {
    uri: formatPermissionedRecordLocationUri(write.location) as AtUri,
    cid: write.cid as CID,
  };
}

function proposalRecordFromCreateInput(
  data: CreateProposalInput,
  createdAt: Date,
): Record<string, unknown> {
  return withoutUndefinedRecord({
    title: data.title,
    body: data.body,
    bodyFormat: data.bodyFormat ?? 'text',
    votingType: data.votingType,
    quorumType: data.quorumType,
    quorumBasis: data.quorumBasis,
    quorumThreshold: data.quorumThreshold,
    cooperative: data.cooperativeDid,
    closesAt: data.closesAt,
    tags: data.tags,
    meetingEvent: data.meetingEvent,
    fullDocument: data.fullDocument,
    discussionThread: data.discussionThread,
    createdAt: createdAt.toISOString(),
  });
}

function proposalRecordFromRow(proposal: ProposalRow): Record<string, unknown> {
  return withoutUndefinedRecord({
    title: proposal.title,
    body: proposal.body,
    bodyFormat: proposal.body_format,
    votingType: proposal.voting_type,
    options: proposal.options ?? undefined,
    quorumType: proposal.quorum_type,
    quorumBasis: proposal.quorum_basis,
    quorumThreshold: proposal.quorum_threshold ?? undefined,
    cooperative: proposal.cooperative_did,
    closesAt: proposal.closes_at ? toIsoString(proposal.closes_at) : undefined,
    tags: proposal.tags.length > 0 ? proposal.tags : undefined,
    meetingEvent: proposal.meeting_event ?? undefined,
    fullDocument: proposal.full_document ?? undefined,
    discussionThread: proposal.discussion_thread ?? undefined,
    createdAt: toIsoString(proposal.created_at),
  });
}

function withoutUndefinedRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  );
}

function parsePublicRecordUri(uri: string): {
  readonly did: string;
  readonly collection: string;
  readonly rkey: string;
} | null {
  const match = /^at:\/\/([^/]+)\/([^/]+)\/([^/?#]+)$/.exec(uri);
  const [, did, collection, rkey] = match ?? [];
  if (!did || !collection || !rkey) return null;
  return { did, collection, rkey };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function quorumConfigFromProposal(
  proposal: ProposalRow,
): GovernanceQuorumConfig | undefined {
  const configuredThreshold =
    proposal.quorum_threshold === null
      ? null
      : Number(proposal.quorum_threshold);

  switch (proposal.quorum_type) {
    case 'none':
      return { type: 'none' };
    case 'simpleMajority':
      return {
        type: 'simpleMajority',
        threshold: configuredThreshold ?? 0.5,
        comparison: 'greaterThan',
      };
    case 'superMajority':
      return {
        type: 'superMajority',
        threshold: configuredThreshold ?? 2 / 3,
        comparison: 'atLeast',
      };
    case 'unanimous':
      return {
        type: 'unanimous',
        threshold: 1,
        comparison: 'atLeast',
      };
    case 'custom':
      return {
        type: 'custom',
        ...(configuredThreshold === null
          ? {}
          : { threshold: configuredThreshold }),
        comparison: 'atLeast',
      };
    default:
      return undefined;
  }
}

function classQuorumRulesFromRecord(
  record: Record<string, unknown> | null,
): Readonly<Record<string, GovernanceClassQuorumRule>> | undefined {
  if (!record) return undefined;

  const entries: Array<[string, GovernanceClassQuorumRule]> = [];
  for (const [className, rawRule] of Object.entries(record)) {
    if (!rawRule || typeof rawRule !== 'object' || Array.isArray(rawRule)) {
      continue;
    }

    const source = rawRule as Record<string, unknown>;
    const minVotes = numberField(source.minVotes);
    const minWeightRatio =
      numberField(source.minWeightRatio) ?? numberField(source.minWeight);
    const rule: GovernanceClassQuorumRule = {
      ...(minVotes === undefined ? {} : { minVotes }),
      ...(minWeightRatio === undefined ? {} : { minWeightRatio }),
    };
    if (Object.keys(rule).length > 0) {
      entries.push([className, rule]);
    }
  }

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function shouldEmitPublicGovernanceLabel(uri: string): boolean {
  return !isSpaceRecordUri(uri);
}

function getPublicGovernanceLabelSubject(
  proposal: ProposalRow,
  publicAnchor: PublicGovernanceAnchorWriteResult | null,
): { readonly uri: AtUri; readonly cid?: CID } | null {
  if (proposal.uri && shouldEmitPublicGovernanceLabel(proposal.uri)) {
    return {
      uri: proposal.uri as AtUri,
      cid: proposal.cid ? (proposal.cid as CID) : undefined,
    };
  }
  if (publicAnchor?.record.outcome) {
    return { uri: publicAnchor.uri, cid: publicAnchor.cid };
  }
  return null;
}

function publicGovernanceAnchorRow(
  proposal: ProposalRow,
  record: ProposalAnchorRecord,
  updatedAt: Date,
) {
  return {
    cooperative_did: proposal.cooperative_did,
    proposal_id: proposal.id,
    status: record.status,
    outcome: record.outcome ?? null,
    opened_at: dateOrNull(record.openedAt),
    closed_at: dateOrNull(record.closedAt),
    resolved_at: dateOrNull(record.resolvedAt),
    anchor_version: record.anchorVersion,
    updated_at: updatedAt,
  };
}

function dateOrNull(value: string | undefined): Date | null {
  return value ? new Date(value) : null;
}
