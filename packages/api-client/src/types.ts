// --- Common ---

export interface PaginatedResult<T> {
  data: T[];
  cursor: string | null;
}

export interface PaginationParams {
  limit?: number;
  cursor?: string;
}

// --- Auth ---

export interface User {
  did: string;
  handle: string | null;
  displayName: string | null;
}

export interface LogoutResponse {
  ok: true;
}

// --- Organizations: Cooperatives ---

export interface Cooperative {
  uri: string;
  did: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  website: string | null;
  status: string;
  createdAt: string;
}

export interface CreateCooperativeInput {
  name: string;
  description?: string;
  website?: string;
}

export interface UpdateCooperativeInput {
  name?: string;
  description?: string;
  website?: string;
}

// --- Organizations: Projects ---

export interface Project {
  uri: string;
  did: string;
  name: string;
  description: string | null;
  cooperativeUri: string | null;
  visibility: string;
  status: string;
  createdAt: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  cooperativeUri?: string;
  visibility?: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  status?: string;
}

export interface ListProjectsParams extends PaginationParams {
  cooperativeUri?: string;
}

// --- Organizations: Memberships ---

export interface Membership {
  uri: string;
  did: string;
  entityUri: string;
  memberDid: string;
  role: string;
  status: string;
  joinedAt: string;
}

export interface CreateMembershipInput {
  entityUri: string;
  memberDid: string;
  role?: string;
}

export interface ListMembersParams extends PaginationParams {
  entityUri: string;
}

// --- Organizations: Connection Bindings ---

export interface ConnectionBinding {
  uri: string;
  connectionUri: string;
  projectUri: string;
  resourceType: string;
  externalResourceId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

// --- Alignment: Interests ---

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

export interface Interest {
  uri: string;
  did: string;
  projectUri: string;
  interests: InterestItem[];
  contributions?: ContributionItem[];
  constraints?: ConstraintItem[];
  redLines?: RedLineItem[];
  preferences?: WorkPreferences;
  createdAt: string;
}

export interface SubmitInterestsInput {
  interests: InterestItem[];
  contributions?: ContributionItem[];
  constraints?: ConstraintItem[];
  redLines?: RedLineItem[];
  preferences?: WorkPreferences;
}

export interface UpdateInterestsInput {
  interests: InterestItem[];
  contributions?: ContributionItem[];
  constraints?: ConstraintItem[];
  redLines?: RedLineItem[];
  preferences?: WorkPreferences;
}

// --- Alignment: Interest Map ---

export interface AlignmentZone {
  theme: string;
  stakeholders: string[];
  strength: number;
  description: string;
}

export interface ConflictZone {
  theme: string;
  parties: string[];
  severity: number;
  description: string;
}

export interface InterestMap {
  uri: string;
  projectUri: string;
  alignmentZones: AlignmentZone[];
  conflictZones: ConflictZone[];
  generatedAt: string;
}

// --- Alignment: Outcomes ---

export interface Outcome {
  uri: string;
  did: string;
  projectUri: string;
  title: string;
  description: string | null;
  metrics: Record<string, unknown> | null;
  targetDate: string | null;
  status: string;
  createdAt: string;
}

export interface CreateOutcomeInput {
  title: string;
  description?: string;
  metrics?: Record<string, unknown>;
  targetDate?: string;
}

// --- Agreements ---

export interface MasterAgreement {
  uri: string;
  did: string;
  projectUri: string;
  title: string;
  version: number;
  purpose: string | null;
  scope: string | null;
  governanceFramework: string | null;
  disputeResolution: string | null;
  amendmentProcess: string | null;
  terminationConditions: string | null;
  status: string;
  effectiveDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgreementInput {
  title: string;
  purpose?: string;
  scope?: string;
  governanceFramework?: string;
  disputeResolution?: string;
  amendmentProcess?: string;
  terminationConditions?: string;
}

export interface UpdateAgreementInput {
  title?: string;
  purpose?: string;
  scope?: string;
  governanceFramework?: string;
  disputeResolution?: string;
  amendmentProcess?: string;
  terminationConditions?: string;
  status?: string;
  effectiveDate?: string;
}

export interface StakeholderTerms {
  uri: string;
  did: string;
  masterAgreementUri: string;
  stakeholderDid: string;
  stakeholderType: string;
  contributions: Record<string, unknown> | null;
  financialTerms: Record<string, unknown> | null;
  ipTerms: Record<string, unknown> | null;
  governanceRights: Record<string, unknown> | null;
  exitTerms: Record<string, unknown> | null;
  signedAt: string | null;
  createdAt: string;
}

export interface CreateTermsInput {
  stakeholderDid: string;
  stakeholderType: string;
  contributions?: Record<string, unknown>;
  financialTerms?: Record<string, unknown>;
  ipTerms?: Record<string, unknown>;
  governanceRights?: Record<string, unknown>;
  exitTerms?: Record<string, unknown>;
}

export interface AgreementSignature {
  uri: string;
  did: string;
  agreementUri: string;
  signerDid: string;
  signerRole: string;
  signatureType: string;
  signedAt: string;
}

export interface SignatureStatusResponse {
  agreementUri: string;
  signatures: AgreementSignature[];
  totalExpected: number;
  totalSigned: number;
  allSigned: boolean;
}

export interface Amendment {
  uri: string;
  did: string;
  agreementUri: string;
  proposerDid: string;
  proposedChanges: Record<string, unknown>;
  reasoning: string;
  status: string;
  createdAt: string;
}

export interface CreateAmendmentInput {
  proposedChanges: Record<string, unknown>;
  reasoning: string;
}

export interface VersionHistory {
  agreementUri: string;
  versions: Array<{
    version: number;
    createdAt: string;
    changes: Record<string, unknown> | null;
  }>;
}

export interface VersionComparison {
  agreementUri: string;
  versionA: number;
  versionB: number;
  changes: Record<string, unknown>;
}

export interface AgreementTemplate {
  id: string;
  name: string;
  description: string;
  sections: Record<string, unknown>;
}

// --- Governance ---

export interface Proposal {
  uri: string;
  did: string;
  projectUri: string;
  title: string;
  body: string;
  proposalType: string;
  status: string;
  votingMethod: string;
  quorumRequired: number | null;
  discussionEndsAt: string | null;
  votingEndsAt: string | null;
  createdAt: string;
}

export interface CreateProposalInput {
  title: string;
  body: string;
  proposalType: string;
  votingMethod?: string;
  quorumRequired?: number;
  discussionEndsAt?: string;
  votingEndsAt?: string;
}

export interface UpdateProposalStatusInput {
  status: string;
}

export interface Vote {
  uri: string;
  did: string;
  proposalUri: string;
  choice: string;
  weight: number;
  rationale: string | null;
  createdAt: string;
}

export interface CastVoteInput {
  choice: string;
  weight?: number;
  rationale?: string;
}

export interface VoteResults {
  proposalUri: string;
  totalVotes: number;
  results: Record<string, number>;
  quorumMet: boolean | null;
}

export interface VoteListResponse {
  votes: Vote[];
  proposalUri: string;
}

export interface Delegation {
  uri: string;
  did: string;
  projectUri: string;
  delegatorDid: string;
  delegateToDid: string;
  scope: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface CreateDelegationInput {
  delegateTo: string;
  scope?: string;
  expiresAt?: string;
}

export interface DelegationListResponse {
  delegations: Delegation[];
}

// --- Connections ---

export interface Connection {
  uri: string;
  did: string;
  service: string;
  externalId: string;
  displayName: string | null;
  status: string;
  createdAt: string;
}

export interface AuthorizeUrlResponse {
  url: string;
}

export interface BindResourceInput {
  projectUri: string;
  resourceId: string;
  externalResourceUri: string;
  metadata?: Record<string, unknown>;
}

// --- Funding ---

export interface Campaign {
  uri: string;
  did: string;
  beneficiaryUri: string;
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
  createdAt: string;
}

export interface CreateCampaignInput {
  beneficiaryUri: string;
  title: string;
  description?: string;
  goalAmount: number;
  goalCurrency: string;
  tier?: string;
  campaignType?: string;
  fundingModel?: string;
  startDate?: string;
  endDate?: string;
}

export interface UpdateCampaignInput {
  title?: string;
  description?: string;
  goalAmount?: number;
  tier?: string;
  startDate?: string;
  endDate?: string;
}

export interface UpdateCampaignStatusInput {
  status: string;
}

export interface ListCampaignsParams extends PaginationParams {
  beneficiaryUri?: string;
  tier?: string;
  status?: string;
  campaignType?: string;
  mine?: boolean;
}

export interface DiscoverCampaignsParams extends PaginationParams {
  tier?: string;
  campaignType?: string;
}

export interface Pledge {
  uri: string;
  did: string;
  campaignUri: string;
  backerDid: string;
  amount: number;
  currency: string;
  paymentStatus: string;
  createdAt: string;
}

export interface CreatePledgeInput {
  amount: number;
  currency: string;
  paymentMethod?: string;
  displayName?: string;
  email?: string;
}

export interface ListPledgesParams extends PaginationParams {
  paymentStatus?: string;
}

export interface Backer {
  did: string;
  handle: string;
  displayName: string | null;
  amount: number;
  pledgedAt: string;
}

// --- Automation ---

export interface Workflow {
  id: string;
  projectUri: string;
  name: string;
  description: string | null;
  definition: Record<string, unknown> | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkflowInput {
  name: string;
  description?: string;
  definition?: Record<string, unknown>;
  enabled?: boolean;
}

export interface UpdateWorkflowInput {
  definition?: Record<string, unknown>;
  enabled?: boolean;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: string;
  triggeredBy: string;
  startedAt: string;
  completedAt: string | null;
  steps: Array<Record<string, unknown>>;
  error: string | null;
}

export interface Trigger {
  id: string;
  workflowId: string;
  eventType: string;
  conditions: Record<string, unknown> | null;
  actions: Record<string, unknown> | null;
  enabled: boolean;
  createdAt: string;
}

export interface CreateTriggerInput {
  eventType: string;
  conditions?: Record<string, unknown>;
  actions?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface UpdateTriggerInput {
  eventType?: string;
  conditions?: Record<string, unknown>;
  actions?: Record<string, unknown>;
  enabled?: boolean;
}

export interface EventLogEntry {
  id: string;
  type: string;
  projectUri: string;
  actorDid: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  definition: Record<string, unknown>;
}

// --- Agents ---

export interface AgentConfig {
  id: string;
  projectUri: string;
  createdBy: string;
  name: string;
  agentType: string;
  model: string;
  systemPrompt: string;
  allowedTools: string[];
  contextSources: string[];
  temperature: number;
  maxTokensPerRequest: number;
  maxTokensPerSession: number;
  monthlyBudgetCents: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentConfigInput {
  name: string;
  agentType: string;
  model: string;
  systemPrompt: string;
  allowedTools?: string[];
  contextSources?: string[];
  temperature?: number;
  maxTokensPerRequest?: number;
  maxTokensPerSession?: number;
  monthlyBudgetCents?: number;
  enabled?: boolean;
}

export interface UpdateAgentConfigInput {
  name?: string;
  systemPrompt?: string;
  allowedTools?: string[];
  contextSources?: string[];
  temperature?: number;
  maxTokensPerRequest?: number;
  maxTokensPerSession?: number;
  monthlyBudgetCents?: number;
  enabled?: boolean;
}

export interface CreateFromTemplateInput {
  agentType: string;
  name?: string;
  monthlyBudgetCents?: number;
}

export interface SendMessageInput {
  message: string;
  sessionId?: string;
}

export interface AgentChatResponse {
  sessionId: string;
  response: string;
  toolCalls?: Array<Record<string, unknown>>;
  usage: {
    inputTokens: number;
    outputTokens: number;
    costCents: number;
  };
}

export interface AgentSession {
  id: string;
  configId: string;
  userDid: string;
  title: string | null;
  messageCount: number;
  totalTokens: number;
  totalCostCents: number;
  createdAt: string;
  lastMessageAt: string;
}

export interface AgentMessage {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  toolCalls: Array<Record<string, unknown>> | null;
  tokenCount: number;
  costCents: number;
  createdAt: string;
}

export interface AgentUsage {
  configId: string;
  period: string;
  inputTokens: number;
  outputTokens: number;
  totalCostCents: number;
}

export interface ProjectAgentUsage {
  projectUri: string;
  period: string;
  agents: AgentUsage[];
}

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  agentType: string;
  model: string;
  systemPrompt: string;
}

export interface AgentTool {
  name: string;
  description: string;
  category: string;
}

export interface AgentModel {
  id: string;
  name: string;
  provider: string;
  capabilities: string[];
}

// --- OIDC ---

export interface OidcClient {
  clientId: string;
  clientSecret: string | null;
  name: string;
  redirectUris: string[];
  scopes: string[];
  grantTypes: string[];
  createdAt: string;
}

export interface RegisterOidcClientInput {
  name: string;
  redirectUris: string[];
  scopes: string[];
  grantTypes?: string[];
  contactEmail?: string;
}

// --- CLI Auth ---

export interface CliLoginInitResponse {
  sessionId: string;
}

export interface CliLoginStatusResponse {
  status: 'pending' | 'complete';
  exchangeCode?: string;
}

export interface CliLoginExchangeResponse {
  did: string;
  handle: string | null;
}
