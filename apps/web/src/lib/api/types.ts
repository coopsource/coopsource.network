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

export interface Network {
  did: string;
  handle: string | null;
  displayName: string;
  description: string | null;
  cooperativeType: string;
  membershipPolicy: string;
  memberCount: number;
  website?: string | null;
  createdAt?: string;
}

export interface NetworkMember {
  did: string;
  handle: string | null;
  displayName: string;
  description: string | null;
  cooperativeType: string;
  status: string;
  joinedAt: string | null;
}

export interface NetworksResponse {
  networks: Network[];
  cursor?: string;
}

export interface NetworkMembersResponse {
  members: NetworkMember[];
  cursor?: string;
}

export interface Campaign {
  uri: string;
  did: string;
  title: string;
  description: string | null;
  tier: string;
  campaignType: string;
  goalAmount: number;
  goalCurrency: string;
  amountRaised: number;
  backerCount: number;
  fundingModel: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface Pledge {
  uri: string;
  did: string;
  campaignUri: string;
  backerDid: string;
  amount: number;
  currency: string;
  paymentStatus: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface CampaignsResponse extends PaginatedResponse<Campaign> {
  campaigns: Campaign[];
}

export interface PledgesResponse {
  pledges: Pledge[];
  cursor?: string;
}

// ─── Alignment ────────────────────────────────────────────────────────────────

export interface InterestItem {
  category: string;
  description: string;
  priority: number;
  scope?: string;
}

export interface ContributionItem {
  type: string;
  description: string;
  capacity?: string;
}

export interface ConstraintItem {
  description: string;
  hardConstraint?: boolean;
}

export interface RedLineItem {
  description: string;
  reason?: string;
}

export interface WorkPreferences {
  decisionMaking?: string;
  communication?: string;
  pace?: string;
}

export interface StakeholderInterest {
  uri: string;
  did: string;
  projectUri: string;
  interests: InterestItem[];
  contributions: ContributionItem[];
  constraints: ConstraintItem[];
  redLines: RedLineItem[];
  preferences: WorkPreferences;
  createdAt: string;
  updatedAt: string;
}

export interface SuccessCriterion {
  metric: string;
  target: string;
  timeline?: string;
}

export interface SupportEntry {
  stakeholderDid: string;
  supportLevel: string;
  conditions?: string;
}

export interface DesiredOutcome {
  uri: string;
  did: string;
  projectUri: string;
  title: string;
  description: string | null;
  category: string;
  successCriteria: SuccessCriterion[];
  stakeholderSupport: SupportEntry[];
  status: string;
  createdAt: string;
}

export interface AlignmentZone {
  participants: string[];
  description: string;
  strength: number;
  interestsInvolved: string[];
}

export interface ConflictZone {
  stakeholders: string[];
  description: string;
  severity: string;
  potentialSolutions: string[];
}

export interface InterestMap {
  uri: string;
  did: string;
  projectUri: string;
  alignmentZones: AlignmentZone[];
  conflictZones: ConflictZone[];
  aiAnalysis: Record<string, unknown> | null;
  createdAt: string;
}

export interface InterestsListResponse {
  interests: StakeholderInterest[];
}

export interface OutcomesResponse extends PaginatedResponse<DesiredOutcome> {
  outcomes: DesiredOutcome[];
}

// ─── Master Agreements ───────────────────────────────────────────────────────

export interface MasterAgreement {
  uri: string;
  did: string;
  projectUri: string;
  title: string;
  version: number;
  purpose: string | null;
  scope: string | null;
  agreementType: string;
  governanceFramework: Record<string, unknown> | null;
  disputeResolution: Record<string, unknown> | null;
  amendmentProcess: Record<string, unknown> | null;
  terminationConditions: Record<string, unknown> | null;
  status: string;
  effectiveDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StakeholderTerms {
  uri: string;
  did: string;
  masterAgreementUri: string;
  stakeholderDid: string;
  stakeholderType: string;
  stakeholderClass: string | null;
  contributions: Array<{ type: string; description: string; value?: string }>;
  financialTerms: Record<string, unknown>;
  ipTerms: Record<string, unknown>;
  governanceRights: Record<string, unknown>;
  exitTerms: Record<string, unknown>;
  signedAt: string | null;
  createdAt: string;
}

export interface MasterAgreementsResponse extends PaginatedResponse<MasterAgreement> {
  masterAgreements: MasterAgreement[];
}

export interface StakeholderTermsResponse {
  terms: StakeholderTerms[];
}

// ─── External Connections ────────────────────────────────────────────────────

export interface ExternalConnection {
  uri: string;
  did: string;
  service: string;
  status: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ConnectionBinding {
  uri: string;
  did: string;
  connectionUri: string;
  projectUri: string;
  resourceType: string;
  resourceId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AvailableServicesResponse {
  services: string[];
}

export interface ConnectionsResponse {
  connections: ExternalConnection[];
}

export interface BindingsResponse {
  bindings: ConnectionBinding[];
}

export interface ApiError {
  error: string;
  message?: string;
}
