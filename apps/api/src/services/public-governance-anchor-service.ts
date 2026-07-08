import {
  buildAtUri,
  type AtUri,
  type CID,
  type DID,
} from '@coopsource/common';
import type { IPdsService } from '@coopsource/federation';
import {
  LEXICON_IDS,
  type GovernanceProposalAnchor,
} from '@coopsource/lexicons';

const PROPOSAL_ANCHOR_COLLECTION = LEXICON_IDS.GovernanceProposalAnchor;

const ANCHORABLE_STATUSES = new Set([
  'open',
  'closed',
  'resolved',
  'withdrawn',
  'archived',
]);

const PUBLIC_OUTCOMES = new Set([
  'passed',
  'failed',
  'no_quorum',
  'class_quorum_not_met',
  'archived',
]);

export type ProposalAnchorRecord = Omit<
  GovernanceProposalAnchor,
  '$type'
>;

export interface PublicGovernanceAnchorPolicy {
  readonly enabled: boolean;
  readonly publishOutcome?: boolean;
  readonly minimumEligibleMembers?: number;
  readonly eligibleMemberCount?: number;
}

export interface ProposalAnchorSource {
  readonly cooperativeDid: string;
  readonly proposalId: string;
  readonly status: string;
  readonly outcome?: string | null;
  readonly openedAt?: Date | string | null;
  readonly closedAt?: Date | string | null;
  readonly resolvedAt?: Date | string | null;
}

export interface UpsertProposalAnchorInput {
  readonly policy: PublicGovernanceAnchorPolicy;
  readonly proposal: ProposalAnchorSource;
  readonly existingAnchorUri?: AtUri | null;
}

export interface PublicGovernanceAnchorWriteInput {
  readonly cooperativeDid: DID;
  readonly record: ProposalAnchorRecord;
  readonly existingAnchorUri?: AtUri | null;
}

export interface PublicGovernanceAnchorWriteResult {
  readonly uri: AtUri;
  readonly cid: CID;
  readonly record: ProposalAnchorRecord;
}

export interface PublicGovernanceAnchorWritePort {
  upsertProposalAnchor(
    input: PublicGovernanceAnchorWriteInput,
  ): Promise<PublicGovernanceAnchorWriteResult>;
}

export class PublicGovernanceAnchorService {
  constructor(
    private readonly writePort: PublicGovernanceAnchorWritePort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async upsertProposalAnchor(
    input: UpsertProposalAnchorInput,
  ): Promise<PublicGovernanceAnchorWriteResult | null> {
    if (!this.canPublish(input.policy, input.proposal.status)) {
      return null;
    }

    const record = this.buildRecord(input.policy, input.proposal);
    return this.writePort.upsertProposalAnchor({
      cooperativeDid: input.proposal.cooperativeDid as DID,
      record,
      existingAnchorUri: input.existingAnchorUri,
    });
  }

  private canPublish(
    policy: PublicGovernanceAnchorPolicy,
    status: string,
  ): boolean {
    if (!policy.enabled) return false;
    if (!ANCHORABLE_STATUSES.has(status)) return false;

    if (policy.minimumEligibleMembers !== undefined) {
      return (
        (policy.eligibleMemberCount ?? 0) >= policy.minimumEligibleMembers
      );
    }

    return true;
  }

  private buildRecord(
    policy: PublicGovernanceAnchorPolicy,
    proposal: ProposalAnchorSource,
  ): ProposalAnchorRecord {
    const record: ProposalAnchorRecord = {
      cooperativeDid: proposal.cooperativeDid,
      proposalId: proposal.proposalId,
      status: proposal.status as ProposalAnchorRecord['status'],
      updatedAt: this.now().toISOString(),
      anchorVersion: 1,
    };

    const openedAt = toIsoDate(proposal.openedAt);
    if (openedAt) record.openedAt = openedAt;

    const closedAt = toIsoDate(proposal.closedAt);
    if (closedAt) record.closedAt = closedAt;

    const resolvedAt = toIsoDate(proposal.resolvedAt);
    if (resolvedAt) record.resolvedAt = resolvedAt;

    if (
      policy.publishOutcome === true &&
      proposal.outcome &&
      PUBLIC_OUTCOMES.has(proposal.outcome)
    ) {
      record.outcome = proposal.outcome as ProposalAnchorRecord['outcome'];
    }

    return record;
  }
}

export class PdsPublicGovernanceAnchorWritePort
  implements PublicGovernanceAnchorWritePort
{
  constructor(private readonly pdsService: IPdsService) {}

  async upsertProposalAnchor(
    input: PublicGovernanceAnchorWriteInput,
  ): Promise<PublicGovernanceAnchorWriteResult> {
    const record = input.record as unknown as Record<string, unknown>;
    const existingAnchor = input.existingAnchorUri
      ? parseExpectedAnchorUri(input.existingAnchorUri, input.cooperativeDid)
      : null;

    const ref = existingAnchor
      ? await this.pdsService.putRecord({
          did: input.cooperativeDid,
          collection: PROPOSAL_ANCHOR_COLLECTION,
          rkey: existingAnchor.rkey,
          record,
        })
      : await this.pdsService.createRecord({
          did: input.cooperativeDid,
          collection: PROPOSAL_ANCHOR_COLLECTION,
          record,
        });

    return { ...ref, record: input.record };
  }
}

export class InMemoryPublicGovernanceAnchorWritePort
  implements PublicGovernanceAnchorWritePort
{
  private rkeySequence = 0;
  private cidSequence = 0;
  private readonly records = new Map<
    AtUri,
    { readonly cid: CID; readonly record: ProposalAnchorRecord }
  >();

  async upsertProposalAnchor(
    input: PublicGovernanceAnchorWriteInput,
  ): Promise<PublicGovernanceAnchorWriteResult> {
    if (input.existingAnchorUri) {
      parseExpectedAnchorUri(input.existingAnchorUri, input.cooperativeDid);
    }

    const uri =
      input.existingAnchorUri ??
      (buildAtUri(
        input.cooperativeDid,
        PROPOSAL_ANCHOR_COLLECTION,
        `test-anchor-${++this.rkeySequence}`,
      ) as AtUri);
    const cid = `anchor-${++this.cidSequence}` as CID;
    const record = { ...input.record };
    this.records.set(uri, { cid, record });
    return { uri, cid, record };
  }

  get(uri: AtUri): ProposalAnchorRecord | undefined {
    return this.records.get(uri)?.record;
  }

  all(): ReadonlyArray<PublicGovernanceAnchorWriteResult> {
    return Array.from(this.records.entries()).map(([uri, row]) => ({
      uri,
      cid: row.cid,
      record: row.record,
    }));
  }
}

function toIsoDate(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function parseExpectedAnchorUri(
  uri: AtUri,
  cooperativeDid: DID,
): { readonly rkey: string } {
  const match = /^at:\/\/([^/]+)\/([^/]+)\/([^/?#]+)$/.exec(uri);
  const [, did, collection, rkey] = match ?? [];
  if (
    !did ||
    did !== cooperativeDid ||
    collection !== PROPOSAL_ANCHOR_COLLECTION ||
    !rkey
  ) {
    throw new Error(
      `Existing public governance anchor URI must target ${PROPOSAL_ANCHOR_COLLECTION} for ${cooperativeDid}`,
    );
  }
  return { rkey };
}
