export { CoopSourceClient } from './client.js';
export type { ClientOptions } from './client.js';
export { ApiError } from './errors.js';
export type {
  // Common
  PaginatedResult,
  PaginationParams,

  // Auth
  User,
  LogoutResponse,

  // Organizations: Cooperatives
  Cooperative,
  CreateCooperativeInput,
  UpdateCooperativeInput,

  // Organizations: Projects
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  ListProjectsParams,

  // Organizations: Memberships
  Membership,
  CreateMembershipInput,
  ListMembersParams,

  // Organizations: Connection Bindings
  ConnectionBinding,

  // Alignment: Interests
  Interest,
  InterestItem,
  ContributionItem,
  ConstraintItem,
  RedLineItem,
  WorkPreferences,
  SubmitInterestsInput,
  UpdateInterestsInput,

  // Alignment: Interest Map
  InterestMap,
  AlignmentZone,
  ConflictZone,

  // Alignment: Outcomes
  Outcome,
  CreateOutcomeInput,

  // Agreements
  MasterAgreement,
  CreateAgreementInput,
  UpdateAgreementInput,
  StakeholderTerms,
  CreateTermsInput,
  AgreementSignature,
  SignatureStatusResponse,
  Amendment,
  CreateAmendmentInput,
  VersionHistory,
  VersionComparison,
  AgreementTemplate,

  // Governance
  Proposal,
  CreateProposalInput,
  UpdateProposalStatusInput,
  Vote,
  CastVoteInput,
  VoteResults,
  VoteListResponse,
  Delegation,
  CreateDelegationInput,
  DelegationListResponse,

  // Connections
  Connection,
  AuthorizeUrlResponse,
  BindResourceInput,

  // Funding
  Campaign,
  CreateCampaignInput,
  UpdateCampaignInput,
  UpdateCampaignStatusInput,
  ListCampaignsParams,
  DiscoverCampaignsParams,
  Pledge,
  CreatePledgeInput,
  ListPledgesParams,
  Backer,

  // Automation
  Workflow,
  CreateWorkflowInput,
  UpdateWorkflowInput,
  WorkflowExecution,
  Trigger,
  CreateTriggerInput,
  UpdateTriggerInput,
  EventLogEntry,
  WorkflowTemplate,

  // Agents
  AgentConfig,
  CreateAgentConfigInput,
  UpdateAgentConfigInput,
  CreateFromTemplateInput,
  SendMessageInput,
  AgentChatResponse,
  AgentSession,
  AgentMessage,
  AgentUsage,
  ProjectAgentUsage,
  AgentTemplate,
  AgentTool,
  AgentModel,

  // OIDC
  OidcClient,
  RegisterOidcClientInput,

  // CLI Auth
  CliLoginInitResponse,
  CliLoginStatusResponse,
  CliLoginExchangeResponse,
} from './types.js';
