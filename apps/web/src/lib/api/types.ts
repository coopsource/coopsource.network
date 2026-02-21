export interface AuthUser {
  did: string;
  handle: string | null;
  displayName: string;
  email: string;
  roles: string[];
}

export interface CoopEntity {
  did: string;
  handle: string | null;
  displayName: string;
  description: string | null;
  website: string | null;
  status: string;
  createdAt: string;
}

export interface Member {
  did: string;
  handle: string | null;
  displayName: string;
  email: string | null;
  roles: string[];
  status: string;
  joinedAt: string;
}

export interface Invitation {
  id: string;
  token: string;
  email: string;
  roles: string[];
  message: string | null;
  status: string;
  expiresAt: string;
  createdAt: string;
  invitedBy: string | null;
}

export interface Proposal {
  id: string;
  did: string;
  title: string;
  body: string;
  proposalType: string;
  votingMethod: string;
  quorumRequired: number | null;
  votingEndsAt: string | null;
  status: string; // draft | open | closed | resolved
  result: Record<string, unknown> | null;
  authorDid: string;
  authorHandle: string | null;
  authorDisplayName: string;
  createdAt: string;
}

export interface Vote {
  id: string;
  proposalId: string;
  voterDid: string;
  voterHandle: string | null;
  voterDisplayName: string;
  choice: 'yes' | 'no' | 'abstain';
  rationale: string | null;
  createdAt: string;
}

export interface Agreement {
  id: string;
  did: string;
  title: string;
  body: string;
  agreementType: string;
  status: string; // draft | open | signed | void
  authorDid: string;
  authorHandle: string | null;
  authorDisplayName: string;
  signatureCount: number;
  mySignature: boolean;
  createdAt: string;
}

export interface SetupStatus {
  setupComplete: boolean;
}

export interface PaginatedResponse<T> {
  cursor?: string;
}

export interface MembersResponse extends PaginatedResponse<Member> {
  members: Member[];
}

export interface InvitationsResponse extends PaginatedResponse<Invitation> {
  invitations: Invitation[];
}

export interface ProposalsResponse extends PaginatedResponse<Proposal> {
  proposals: Proposal[];
}

export interface AgreementsResponse extends PaginatedResponse<Agreement> {
  agreements: Agreement[];
}

export interface VotesResponse {
  votes: Vote[];
  tally: Record<string, number>;
}

export interface Thread {
  id: string;
  title: string | null;
  threadType: string;
  status: string;
  createdBy: string;
  memberCount: number;
  createdAt: string;
}

export interface Post {
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

export interface ThreadsResponse {
  threads: Thread[];
  cursor?: string;
}

export interface PostsResponse {
  posts: Post[];
  cursor?: string;
}

export interface ApiError {
  error: string;
  message?: string;
}
