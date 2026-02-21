/**
 * Response formatters — transform raw DB rows into camelCase API shapes
 * matching the SvelteKit web frontend's expectations.
 */

export interface ProposalResponse {
  id: string;
  title: string;
  body: string;
  status: string;
  votingType: string;
  quorumType: string;
  quorumBasis: string | null;
  closesAt: string | null;
  authorDid: string;
  authorDisplayName: string | null;
  authorHandle: string | null;
  createdAt: string;
}

export interface VoteResponse {
  id: string;
  proposalId: string;
  voterDid: string;
  voterDisplayName: string | null;
  voterHandle: string | null;
  choice: string;
  rationale: string | null;
  createdAt: string;
}

export interface AgreementResponse {
  id: string;
  title: string;
  body: string;
  agreementType: string;
  status: string;
  authorDid: string;
  authorDisplayName: string | null;
  authorHandle: string | null;
  signatureCount: number;
  mySignature: boolean;
  createdAt: string;
}

export interface InvitationResponse {
  id: string;
  token: string;
  email: string | null;
  roles: string[];
  message: string | null;
  status: string;
  expiresAt: string;
  createdAt: string;
  invitedBy: string | null;
}

export function formatProposal(
  row: {
    id: string;
    title: string;
    body: string;
    status: string;
    voting_type: string;
    quorum_type: string;
    quorum_basis: string | null;
    closes_at: Date | null;
    author_did: string;
    created_at: Date;
  },
  enrichment: { displayName?: string | null; handle?: string | null } = {},
): ProposalResponse {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    status: row.status,
    votingType: row.voting_type,
    quorumType: row.quorum_type,
    quorumBasis: row.quorum_basis ?? null,
    closesAt: row.closes_at ? row.closes_at.toISOString() : null,
    authorDid: row.author_did,
    authorDisplayName: enrichment.displayName ?? null,
    authorHandle: enrichment.handle ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

export function formatVote(
  row: {
    id: string;
    proposal_id: string;
    voter_did: string;
    choice: string;
    rationale: string | null;
    created_at: Date;
  },
  enrichment: { displayName?: string | null; handle?: string | null } = {},
): VoteResponse {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    voterDid: row.voter_did,
    voterDisplayName: enrichment.displayName ?? null,
    voterHandle: enrichment.handle ?? null,
    choice: row.choice,
    rationale: row.rationale ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

export function formatAgreement(
  row: {
    id: string;
    title: string;
    body: string;
    agreement_type: string;
    status: string;
    created_by: string;
    created_at: Date;
  },
  enrichment: {
    displayName?: string | null;
    handle?: string | null;
    signatureCount?: number;
    mySignature?: boolean;
  } = {},
): AgreementResponse {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    agreementType: row.agreement_type,
    status: row.status,
    authorDid: row.created_by,
    authorDisplayName: enrichment.displayName ?? null,
    authorHandle: enrichment.handle ?? null,
    signatureCount: enrichment.signatureCount ?? 0,
    mySignature: enrichment.mySignature ?? false,
    createdAt: row.created_at.toISOString(),
  };
}

export interface ThreadResponse {
  id: string;
  title: string | null;
  threadType: string;
  status: string;
  createdBy: string;
  memberCount: number;
  createdAt: string;
}

export interface PostResponse {
  id: string;
  threadId: string;
  authorDid: string;
  body: string;
  bodyFormat: string;
  parentPostId: string | null;
  status: string;
  createdAt: string;
  editedAt: string | null;
}

export function formatThread(
  row: {
    id: string;
    title: string | null;
    thread_type: string;
    status: string;
    created_by: string;
    created_at: Date;
  },
  memberCount: number = 0,
): ThreadResponse {
  return {
    id: row.id,
    title: row.title,
    threadType: row.thread_type,
    status: row.status,
    createdBy: row.created_by,
    memberCount,
    createdAt: row.created_at.toISOString(),
  };
}

export function formatPost(
  row: {
    id: string;
    thread_id: string;
    author_did: string;
    body: string;
    body_format: string;
    parent_post_id: string | null;
    status: string;
    created_at: Date;
    edited_at: Date | null;
  },
): PostResponse {
  return {
    id: row.id,
    threadId: row.thread_id,
    authorDid: row.author_did,
    body: row.body,
    bodyFormat: row.body_format,
    parentPostId: row.parent_post_id ?? null,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    editedAt: row.edited_at ? row.edited_at.toISOString() : null,
  };
}

export function formatInvitation(
  row: {
    id: string;
    token: string;
    invitee_email: string | null;
    intended_roles: string[];
    message: string | null;
    status: string;
    expires_at: Date;
    created_at: Date;
  },
  invitedBy: string | null = null,
): InvitationResponse {
  return {
    id: row.id,
    token: row.token,
    email: row.invitee_email ?? null,
    roles: row.intended_roles ?? [],
    message: row.message ?? null,
    status: row.status,
    expiresAt: row.expires_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    invitedBy,
  };
}
