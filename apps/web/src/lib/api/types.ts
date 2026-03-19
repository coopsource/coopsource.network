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
  isNetwork?: boolean;
  status: string;
  createdAt: string;
  publicDescription?: boolean;
  publicMembers?: boolean;
  publicActivity?: boolean;
  publicAgreements?: boolean;
  publicCampaigns?: boolean;
}

export interface WorkspaceContext {
  type: 'coop' | 'network';
  handle: string;
  prefix: string;
  cooperative: CoopEntity;
}

export interface MyMembershipsResponse {
  cooperatives: CoopEntity[];
  networks: CoopEntity[];
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
  voteWeight: number;
  rationale: string | null;
  createdAt: string;
}

export interface Agreement {
  uri: string;
  did: string;
  projectUri: string;
  title: string;
  version: number;
  purpose: string | null;
  scope: string | null;
  body: string | null;
  agreementType: string;
  governanceFramework: Record<string, unknown> | null;
  disputeResolution: Record<string, unknown> | null;
  amendmentProcess: Record<string, unknown> | null;
  terminationConditions: Record<string, unknown> | null;
  status: string; // draft | open | active | amended | terminated | voided
  effectiveDate: string | null;
  authorDid: string;
  authorHandle: string | null;
  authorDisplayName: string;
  signatureCount: number;
  mySignature: boolean;
  createdAt: string;
  updatedAt: string;
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
  paymentProvider: string | null;
  paymentSessionId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface PaymentProviderInfo {
  id: string;
  displayName: string;
}

export interface PaymentProviderConfig {
  id: string;
  providerId: string;
  displayName: string;
  enabled: boolean;
  config: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentProvidersResponse {
  providers: PaymentProviderInfo[];
}

export interface PaymentConfigsResponse {
  providers: PaymentProviderConfig[];
}

export interface CheckoutResponse {
  checkoutUrl: string;
  mode: 'redirect';
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

// ─── Agreement Templates ─────────────────────────────────────────────────────

export interface AgreementTemplate {
  id: string;
  cooperativeDid: string;
  createdBy: string;
  name: string;
  description: string | null;
  agreementType: string;
  templateData: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AgreementTemplatesResponse extends PaginatedResponse<AgreementTemplate> {
  templates: AgreementTemplate[];
}

// ─── Stakeholder Terms ───────────────────────────────────────────────────────

export interface StakeholderTerms {
  uri: string;
  did: string;
  agreementUri: string;
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

// ─── Explore (Public) ─────────────────────────────────────────────────────────

export interface ExploreCooperative {
  did: string;
  handle: string | null;
  displayName: string;
  description: string | null;
  cooperativeType: string;
  memberCount: number;
  website: string | null;
}

export interface ExploreCooperativeDetail extends ExploreCooperative {
  networks: Array<{ did: string; displayName: string }>;
}

export interface ExploreCooperativesResponse {
  cooperatives: ExploreCooperative[];
  cursor: string | null;
}

export interface ExploreNetworksResponse {
  networks: Network[];
  cursor: string | null;
}

// ─── Agents ──────────────────────────────────────────────────────────────────

export interface ModelRoutingConfig {
  chat: string;
  automation?: string;
  summarization?: string;
  analysis?: string;
  fallback?: string;
}

export interface AgentConfig {
  id: string;
  cooperativeDid: string;
  name: string;
  description: string | null;
  agentType: string;
  modelConfig: ModelRoutingConfig;
  systemPrompt: string;
  allowedTools: string[];
  contextSources: string[];
  temperature: number;
  maxTokensPerRequest: number;
  maxTokensPerSession: number;
  monthlyBudgetCents: number | null;
  enabled: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentsResponse {
  agents: AgentConfig[];
}

export interface AgentSession {
  id: string;
  agentConfigId: string;
  title: string | null;
  status: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostMicrodollars: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentSessionsResponse {
  sessions: AgentSession[];
}

export interface AgentMessage {
  id: string;
  role: string;
  content: string;
  toolCalls: unknown[] | null;
  inputTokens: number;
  outputTokens: number;
  costMicrodollars: number;
  model: string | null;
  createdAt: string;
}

export interface AgentMessagesResponse {
  messages: AgentMessage[];
}

export interface ChatResult {
  sessionId: string;
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface ModelProviderConfig {
  id: string;
  providerId: string;
  displayName: string;
  enabled: boolean;
  allowedModels: string[];
  config: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface ModelProvidersResponse {
  providers: ModelProviderConfig[];
}

export interface ModelInfo {
  id: string;
  displayName: string;
  contextWindow: number;
  maxOutputTokens: number;
  inputPricePer1M: number;
  outputPricePer1M: number;
  capabilities: string[];
}

export interface AvailableModelsResponse {
  providers: Array<{ providerId: string; models: ModelInfo[] }>;
}

export interface ApiToken {
  id: string;
  name: string;
  token?: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface ApiTokensResponse {
  tokens: ApiToken[];
}

export interface ApiError {
  error: string;
  message?: string;
}

// ─── Notifications ──────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  cooperativeDid: string;
  title: string;
  body: string | null;
  category: string;
  sourceType: string | null;
  sourceId: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: Notification[];
  cursor?: string;
}

export interface UnreadCountResponse {
  count: number;
}

// ─── Agent Triggers ─────────────────────────────────────────────────────────

export interface TriggerCondition {
  field: string;
  operator: string;
  value: unknown;
}

export interface TriggerAction {
  type: string;
  config: Record<string, unknown>;
}

export interface AgentTrigger {
  id: string;
  agentConfigId: string;
  eventType: string;
  conditions: TriggerCondition[];
  actions: TriggerAction[];
  promptTemplate: string | null;
  cooldownSeconds: number;
  enabled: boolean;
  lastTriggeredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentTriggersResponse {
  triggers: AgentTrigger[];
}

export interface TriggerExecution {
  id: string;
  triggerId: string;
  eventType: string;
  eventData: Record<string, unknown>;
  conditionsMatched: boolean;
  actionsExecuted: unknown[];
  status: string;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
}

export interface TriggerExecutionsResponse {
  executions: TriggerExecution[];
  cursor?: string;
}

// ─── Legal Documents ─────────────────────────────────────────────────────────

export interface LegalDocument {
  id: string;
  uri: string;
  cooperativeDid: string;
  authorDid: string;
  title: string;
  body: string;
  bodyFormat: string;
  documentType: string;
  version: number;
  previousVersionUri: string | null;
  status: string;
  createdAt: string;
  indexedAt: string;
}

export interface LegalDocumentsResponse {
  documents: LegalDocument[];
  cursor: string | null;
}

export interface MeetingRecord {
  id: string;
  uri: string;
  cooperativeDid: string;
  authorDid: string;
  title: string;
  meetingDate: string;
  meetingType: string;
  attendees: string[];
  quorumMet: boolean;
  resolutions: string | null;
  minutes: string | null;
  certifiedBy: string | null;
  createdAt: string;
}

export interface MeetingRecordsResponse {
  meetings: MeetingRecord[];
  cursor: string | null;
}

// ─── Officers & Admin ────────────────────────────────────────────────────────

export interface Officer {
  id: string;
  uri: string;
  cooperativeDid: string;
  officerDid: string;
  title: string;
  appointedAt: string;
  termEndsAt: string | null;
  appointmentType: string;
  responsibilities: string | null;
  status: string;
  createdAt: string;
}

export interface OfficersResponse {
  officers: Officer[];
  cursor: string | null;
}

export interface ComplianceItem {
  id: string;
  uri: string;
  cooperativeDid: string;
  title: string;
  description: string | null;
  dueDate: string;
  filingType: string;
  status: string;
  completedAt: string | null;
  completedBy: string | null;
  createdAt: string;
}

export interface ComplianceItemsResponse {
  items: ComplianceItem[];
  cursor: string | null;
}

export interface MemberNotice {
  id: string;
  uri: string;
  cooperativeDid: string;
  authorDid: string;
  title: string;
  body: string;
  noticeType: string;
  targetAudience: string;
  sentAt: string | null;
  createdAt: string;
}

export interface MemberNoticesResponse {
  notices: MemberNotice[];
  cursor: string | null;
}

export interface FiscalPeriod {
  id: string;
  uri: string;
  cooperativeDid: string;
  label: string;
  startsAt: string;
  endsAt: string;
  status: string;
  createdAt: string;
}

export interface FiscalPeriodsResponse {
  fiscalPeriods: FiscalPeriod[];
  cursor: string | null;
}

// ─── Onboarding ──────────────────────────────────────────────────────────────

export interface OnboardingMilestone {
  name: string;
  description?: string;
  order: number;
}

export interface OnboardingConfig {
  id: string;
  cooperativeDid: string;
  probationDurationDays: number;
  requireTraining: boolean;
  requireBuyIn: boolean;
  buyInAmount: number | null;
  buddySystemEnabled: boolean;
  milestones: OnboardingMilestone[];
  createdAt: string;
  updatedAt: string;
}

export interface OnboardingProgress {
  id: string;
  cooperativeDid: string;
  memberDid: string;
  status: string;
  probationStartsAt: string | null;
  probationEndsAt: string | null;
  buddyDid: string | null;
  trainingCompleted: boolean;
  trainingCompletedAt: string | null;
  buyInCompleted: boolean;
  buyInCompletedAt: string | null;
  milestonesCompleted: string[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface OnboardingProgressResponse {
  items: OnboardingProgress[];
  cursor: string | null;
}

export interface OnboardingReview {
  id: string;
  cooperativeDid: string;
  memberDid: string;
  reviewerDid: string;
  reviewType: string;
  outcome: string;
  comments: string | null;
  milestoneName: string | null;
  createdAt: string;
}

export interface OnboardingReviewsResponse {
  reviews: OnboardingReview[];
}

// ─── Financial — Patronage ───────────────────────────────────────────────────

export interface PatronageConfig {
  id: string;
  cooperativeDid: string;
  stakeholderClass: string;
  metricType: string;
  metricWeights: Record<string, number> | null;
  cashPayoutPct: number;
  createdAt: string;
  updatedAt: string;
}

export interface PatronageConfigsResponse {
  configs: PatronageConfig[];
}

export interface PatronageRecord {
  id: string;
  cooperativeDid: string;
  fiscalPeriodId: string;
  memberDid: string;
  stakeholderClass: string;
  metricValue: number;
  patronageRatio: number;
  totalAllocation: number;
  cashAmount: number;
  retainedAmount: number;
  status: string;
  approvedAt: string | null;
  distributedAt: string | null;
  createdAt: string;
}

export interface PatronageRecordsResponse {
  records: PatronageRecord[];
  cursor: string | null;
}

// ─── Financial — Capital Accounts ────────────────────────────────────────────

export interface CapitalAccount {
  id: string;
  cooperativeDid: string;
  memberDid: string;
  initialContribution: number;
  totalPatronageAllocated: number;
  totalRedeemed: number;
  balance: number;
  createdAt: string;
  updatedAt: string;
}

export interface CapitalAccountsResponse {
  accounts: CapitalAccount[];
  cursor: string | null;
}

export interface CapitalAccountSummary {
  totalAccounts: number;
  totalBalance: number;
  totalContributions: number;
  totalAllocated: number;
  totalRedeemed: number;
}

export interface CapitalTransaction {
  id: string;
  capitalAccountId: string;
  cooperativeDid: string;
  memberDid: string;
  transactionType: string;
  amount: number;
  fiscalPeriodId: string | null;
  patronageRecordId: string | null;
  description: string | null;
  createdAt: string;
  createdBy: string | null;
}

export interface CapitalTransactionsResponse {
  transactions: CapitalTransaction[];
  cursor: string | null;
}

// ─── Financial — Tax Forms ───────────────────────────────────────────────────

export interface TaxForm1099 {
  id: string;
  cooperativeDid: string;
  fiscalPeriodId: string;
  memberDid: string;
  taxYear: number;
  patronageDividends: number;
  perUnitRetainAllocated: number;
  qualifiedPayments: number;
  cashPaid: number;
  cashDeadline: string | null;
  cashPaidAt: string | null;
  generationStatus: string;
  generatedAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface TaxFormsResponse {
  forms: TaxForm1099[];
  cursor: string | null;
}

// ─── Governance — Delegations & Feed ─────────────────────────────────────────

export interface Delegation {
  uri: string;
  delegatorDid: string;
  delegateeDid: string;
  scope: string;
  proposalUri: string | null;
  status: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface DelegationsResponse {
  delegations: Delegation[];
  cursor: string | null;
}

export interface DelegationChainLink {
  delegatorDid: string;
  delegateeDid: string;
}

export interface DelegationChain {
  chain: DelegationChainLink[];
}

export interface VoteWeightResponse {
  memberDid: string;
  weight: number;
}

export interface GovernanceFeedItem {
  type: string;
  proposalId: string;
  title: string;
  status: string;
  closesAt?: string;
  outcome?: string;
  resolvedAt?: string;
  createdAt: string;
}

export interface GovernanceFeedResponse {
  items: GovernanceFeedItem[];
  /** Feed endpoints return raw Page<T> where cursor is omitted (undefined) when no more pages */
  cursor?: string;
}

// ─── Member Classes ──────────────────────────────────────────────────────────

export interface MemberClass {
  id: string;
  cooperativeDid: string;
  name: string;
  description: string | null;
  voteWeight: number;
  quorumWeight: number;
  boardSeats: number;
  createdAt: string;
  updatedAt: string;
}

export interface MemberClassesResponse {
  classes: MemberClass[];
}

// ─── Cooperative Links ───────────────────────────────────────────────────────

export interface CooperativeLink {
  id: string;
  initiatorDid: string;
  targetDid: string;
  linkType: string;
  status: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  initiatedAt: string;
  respondedAt: string | null;
  dissolvedAt: string | null;
  createdAt: string;
}

export interface CooperativeLinksResponse {
  links: CooperativeLink[];
  cursor: string | null;
}

export interface CooperativePartner {
  did: string;
  displayName: string;
  handle: string | null;
  linkType: string;
  linkedSince: string;
}

// ── Operations — Phase 8 ─────────────────────────────────────────────

export interface Task {
  id: string;
  cooperativeDid: string;
  projectId: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigneeDids: string[];
  dueDate: string | null;
  labels: string[];
  linkedProposalId: string | null;
  uri: string | null;
  cid: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  indexedAt: string;
  checklist?: ChecklistItem[];
}

export interface ChecklistItem {
  id: string;
  taskId: string;
  title: string;
  completed: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface TaskLabel {
  id: string;
  cooperativeDid: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface TasksResponse {
  tasks: Task[];
  cursor: string | null;
}

export interface TimeEntry {
  id: string;
  cooperativeDid: string;
  memberDid: string;
  taskId: string | null;
  projectId: string | null;
  description: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  status: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  indexedAt: string;
}

export interface TimeEntriesResponse {
  entries: TimeEntry[];
  cursor: string | null;
}

export interface TimeSummary {
  totalMinutes: number;
  entryCount: number;
}

export interface ProjectTimeSummary {
  members: Array<{ memberDid: string; totalMinutes: number; entryCount: number }>;
}

export interface ScheduleShift {
  id: string;
  cooperativeDid: string;
  title: string;
  description: string | null;
  assignedDid: string | null;
  recurrence: string | null;
  location: string | null;
  status: string;
  createdBy: string;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShiftsResponse {
  items: ScheduleShift[];
  cursor: string | null;
}

export interface FairnessSummary {
  items: Array<{ memberDid: string; shiftCount: number }>;
}

export interface Expense {
  id: string;
  cooperativeDid: string;
  memberDid: string;
  categoryId: string | null;
  title: string;
  description: string | null;
  amount: number;
  currency: string;
  receiptBlobCid: string | null;
  status: string;
  reviewedBy: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  reimbursedAt: string | null;
  createdAt: string;
}

export interface ExpenseCategory {
  id: string;
  cooperativeDid: string;
  name: string;
  description: string | null;
  budgetLimit: number | null;
  createdAt: string;
}

export interface ExpensesResponse {
  items: Expense[];
  cursor: string | null;
}

export interface RevenueEntry {
  id: string;
  cooperativeDid: string;
  projectId: string | null;
  title: string;
  description: string | null;
  amount: number;
  currency: string;
  source: string | null;
  sourceReference: string | null;
  recordedBy: string;
  recordedAt: string;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string;
}

export interface RevenueEntriesResponse {
  items: RevenueEntry[];
  cursor: string | null;
}

// ── Commerce — Phase 9 ──────────────────────────────────────────────

export interface CommerceListing {
  id: string;
  cooperativeDid: string;
  title: string;
  description: string | null;
  category: string;
  availability: string;
  location: string | null;
  cooperativeType: string | null;
  tags: string[];
  status: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommerceNeed {
  id: string;
  cooperativeDid: string;
  title: string;
  description: string | null;
  category: string;
  urgency: string;
  location: string | null;
  tags: string[];
  status: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface IntercoopAgreement {
  id: string;
  initiatorDid: string;
  responderDid: string;
  title: string;
  description: string | null;
  agreementType: string;
  status: string;
  terms: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CollaborativeProject {
  id: string;
  hostCooperativeDid: string;
  title: string;
  description: string | null;
  status: string;
  participantDids: string[];
  revenueSplit: Record<string, unknown> | null;
  createdBy: string;
  createdAt: string;
}

export interface SharedResource {
  id: string;
  cooperativeDid: string;
  title: string;
  description: string | null;
  resourceType: string;
  location: string | null;
  costPerUnit: number | null;
  costUnit: string | null;
  status: string;
  createdBy: string;
  createdAt: string;
}

export interface ResourceBooking {
  id: string;
  resourceId: string;
  requestingDid: string;
  startsAt: string;
  endsAt: string;
  purpose: string | null;
  status: string;
  costTotal: number | null;
  createdAt: string;
}

export interface ConnectorConfig {
  id: string;
  cooperativeDid: string;
  connectorType: string;
  displayName: string;
  enabled: boolean;
  lastSyncAt: string | null;
  createdAt: string;
}

export interface WebhookEndpoint {
  id: string;
  cooperativeDid: string;
  url: string;
  eventTypes: string[];
  enabled: boolean;
  createdAt: string;
}

export interface EventCatalogEntry {
  type: string;
  description: string;
}
