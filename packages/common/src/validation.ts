import { z } from 'zod';

export const MoneySchema = z.object({
  amount: z.number().nonnegative(),
  currency: z.string().min(1).max(10),
});

export const PaginationSchema = z.object({
  limit: z.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});

export const DidSchema = z.string()
  .min(1)
  .regex(/^did:(plc|web|key):/, 'Invalid DID format');

export type MoneyInput = z.infer<typeof MoneySchema>;
export type PaginationInput = z.infer<typeof PaginationSchema>;

// --- Organization Schemas ---

export const CreateCooperativeSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  logoUrl: z.string().url().optional(),
  website: z.string().url().optional(),
});

export const UpdateCooperativeSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  logoUrl: z.string().url().nullable().optional(),
  website: z.string().url().nullable().optional(),
  status: z.enum(['active', 'inactive', 'archived']).optional(),
});

export const CreateProjectSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  cooperativeUri: z.string().optional(),
  visibility: z.enum(['public', 'private', 'members']).default('public'),
});

export const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  cooperativeUri: z.string().nullable().optional(),
  visibility: z.enum(['public', 'private', 'members']).optional(),
  status: z.enum(['active', 'inactive', 'archived']).optional(),
});

export const CreateMembershipSchema = z.object({
  entityUri: z.string().min(1),
  memberDid: z.string().min(1),
  role: z.enum(['admin', 'member', 'observer']).default('member'),
});

export type CreateCooperativeInput = z.infer<typeof CreateCooperativeSchema>;
export type UpdateCooperativeInput = z.infer<typeof UpdateCooperativeSchema>;
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;
export type CreateMembershipInput = z.infer<typeof CreateMembershipSchema>;

// --- Alignment Schemas ---

const InterestItemSchema = z.object({
  category: z.string().min(1).max(100),
  description: z.string().min(1).max(2000),
  priority: z.number().int().min(1).max(5),
  scope: z.enum(['short-term', 'medium-term', 'long-term']).optional(),
});

const ContributionItemSchema = z.object({
  type: z.enum(['skill', 'resource', 'capital', 'network', 'time']),
  description: z.string().min(1).max(2000),
  capacity: z.string().max(500).optional(),
});

const ConstraintItemSchema = z.object({
  description: z.string().min(1).max(2000),
  hardConstraint: z.boolean().optional(),
});

const RedLineItemSchema = z.object({
  description: z.string().min(1).max(2000),
  reason: z.string().max(2000).optional(),
});

const WorkPreferencesSchema = z.object({
  decisionMaking: z.string().max(500).optional(),
  communication: z.string().max(500).optional(),
  pace: z.string().max(500).optional(),
});

export const CreateInterestSchema = z.object({
  interests: z.array(InterestItemSchema).min(1).max(50),
  contributions: z.array(ContributionItemSchema).max(50).optional(),
  constraints: z.array(ConstraintItemSchema).max(50).optional(),
  redLines: z.array(RedLineItemSchema).max(50).optional(),
  preferences: WorkPreferencesSchema.optional(),
});

export const UpdateInterestSchema = z.object({
  interests: z.array(InterestItemSchema).min(1).max(50).optional(),
  contributions: z.array(ContributionItemSchema).max(50).optional(),
  constraints: z.array(ConstraintItemSchema).max(50).optional(),
  redLines: z.array(RedLineItemSchema).max(50).optional(),
  preferences: WorkPreferencesSchema.optional(),
});

export const CreateOutcomeSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(3000).optional(),
  category: z.enum(['financial', 'social', 'environmental', 'governance', 'other']),
  successCriteria: z.array(z.object({
    metric: z.string().min(1).max(500),
    target: z.string().min(1).max(500),
    timeline: z.string().max(200).optional(),
  })).max(20).optional(),
});

export type CreateInterestInput = z.infer<typeof CreateInterestSchema>;
export type UpdateInterestInput = z.infer<typeof UpdateInterestSchema>;
export type CreateOutcomeInput = z.infer<typeof CreateOutcomeSchema>;

// --- Agreement Schemas ---

const GovernanceFrameworkSchema = z.object({
  decisionMethod: z.string().max(500).optional(),
  quorum: z.number().int().min(0).max(100).optional(),
  votingThreshold: z.number().int().min(0).max(100).optional(),
  disputeResolution: z.string().max(2000).optional(),
});

const DisputeResolutionSchema = z.object({
  method: z.string().max(500).optional(),
  escalationPath: z.string().max(2000).optional(),
  mediator: z.string().max(500).optional(),
});

const AmendmentProcessSchema = z.object({
  requiredApproval: z.string().max(500).optional(),
  noticePeriod: z.string().max(200).optional(),
  process: z.string().max(2000).optional(),
});

const TerminationConditionsSchema = z.object({
  noticePeriod: z.string().max(200).optional(),
  conditions: z.array(z.string().max(1000)).max(20).optional(),
  consequences: z.string().max(2000).optional(),
});

export const CreateMasterAgreementSchema = z.object({
  title: z.string().min(1).max(255),
  purpose: z.string().max(3000).optional(),
  scope: z.string().max(3000).optional(),
  agreementType: z.enum([
    'worker-cooperative',
    'multi-stakeholder',
    'platform-cooperative',
    'open-source',
    'producer-cooperative',
    'hybrid-member-investor',
    'custom',
  ]).default('custom'),
  governanceFramework: GovernanceFrameworkSchema.optional(),
  disputeResolution: DisputeResolutionSchema.optional(),
  amendmentProcess: AmendmentProcessSchema.optional(),
  terminationConditions: TerminationConditionsSchema.optional(),
});

export const UpdateMasterAgreementSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  purpose: z.string().max(3000).optional(),
  scope: z.string().max(3000).optional(),
  governanceFramework: GovernanceFrameworkSchema.optional(),
  disputeResolution: DisputeResolutionSchema.optional(),
  amendmentProcess: AmendmentProcessSchema.optional(),
  terminationConditions: TerminationConditionsSchema.optional(),
  status: z.enum(['draft', 'active', 'amended', 'terminated']).optional(),
  effectiveDate: z.string().optional(),
});

const ContributionTermSchema = z.object({
  type: z.enum(['labor', 'capital', 'resources', 'ip', 'network']),
  description: z.string().min(1).max(2000),
  value: z.string().max(500).optional(),
});

const FinancialTermsSchema = z.object({
  compensationType: z.string().max(200).optional(),
  compensationAmount: z.number().int().nonnegative().optional(),
  currency: z.string().max(10).optional(),
  profitShare: z.number().int().min(0).max(100).optional(),
  equityStake: z.number().int().min(0).max(100).optional(),
});

const IpTermsSchema = z.object({
  ownership: z.enum(['individual', 'collective', 'shared']).optional(),
  licensing: z.string().max(1000).optional(),
});

const GovernanceRightsSchema = z.object({
  votingPower: z.number().int().min(0).max(100).optional(),
  boardSeat: z.boolean().optional(),
  decisionCategories: z.array(z.string().max(200)).max(20).optional(),
});

const ExitTermsSchema = z.object({
  buybackPrice: z.string().max(500).optional(),
  noticePeriod: z.string().max(200).optional(),
  conditions: z.array(z.string().max(1000)).max(20).optional(),
});

export const CreateStakeholderTermsSchema = z.object({
  stakeholderDid: z.string().min(1),
  stakeholderType: z.enum(['worker', 'investor', 'customer', 'supplier', 'community', 'partner']),
  stakeholderClass: z.string().max(200).optional(),
  contributions: z.array(ContributionTermSchema).max(50).optional(),
  financialTerms: FinancialTermsSchema.optional(),
  ipTerms: IpTermsSchema.optional(),
  governanceRights: GovernanceRightsSchema.optional(),
  exitTerms: ExitTermsSchema.optional(),
});

export const CreateSignatureSchema = z.object({
  signatureType: z.enum(['digital', 'witnessed', 'notarized']).default('digital'),
});

export type CreateMasterAgreementInput = z.infer<typeof CreateMasterAgreementSchema>;
export type UpdateMasterAgreementInput = z.infer<typeof UpdateMasterAgreementSchema>;
export type CreateStakeholderTermsInput = z.infer<typeof CreateStakeholderTermsSchema>;
export type CreateSignatureInput = z.infer<typeof CreateSignatureSchema>;

// --- Agreement Template Schemas ---

const TemplateDataSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  purpose: z.string().max(3000).optional(),
  scope: z.string().max(3000).optional(),
  body: z.string().max(50000).optional(),
  bodyFormat: z.string().max(50).optional(),
  governanceFramework: GovernanceFrameworkSchema.optional(),
  disputeResolution: DisputeResolutionSchema.optional(),
  amendmentProcess: AmendmentProcessSchema.optional(),
  terminationConditions: TerminationConditionsSchema.optional(),
});

export const CreateAgreementTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  agreementType: z.enum([
    'worker-cooperative',
    'multi-stakeholder',
    'platform-cooperative',
    'open-source',
    'producer-cooperative',
    'hybrid-member-investor',
    'custom',
  ]).default('custom'),
  templateData: TemplateDataSchema.default({}),
});

export const UpdateAgreementTemplateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  agreementType: z.enum([
    'worker-cooperative',
    'multi-stakeholder',
    'platform-cooperative',
    'open-source',
    'producer-cooperative',
    'hybrid-member-investor',
    'custom',
  ]).optional(),
  templateData: TemplateDataSchema.optional(),
});

export type CreateAgreementTemplateInput = z.infer<typeof CreateAgreementTemplateSchema>;
export type UpdateAgreementTemplateInput = z.infer<typeof UpdateAgreementTemplateSchema>;

// --- Amendment Schemas ---

const FieldChangeSchema = z.object({
  from: z.unknown(),
  to: z.unknown(),
});

const AmendmentChangesSchema = z.object({
  title: FieldChangeSchema.optional(),
  purpose: FieldChangeSchema.optional(),
  scope: FieldChangeSchema.optional(),
  governanceFramework: FieldChangeSchema.optional(),
  disputeResolution: FieldChangeSchema.optional(),
  amendmentProcess: FieldChangeSchema.optional(),
  terminationConditions: FieldChangeSchema.optional(),
}).refine(
  (data) => Object.values(data).some((v) => v !== undefined),
  { message: 'At least one field change is required' },
);

export const CreateAmendmentSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().min(1).max(10000),
  changes: AmendmentChangesSchema,
  votingMethod: z.enum(['simple_majority', 'supermajority', 'consensus']).default('simple_majority'),
  quorumRequired: z.number().min(0).max(1).optional(),
  votingEndsAt: z.string().optional(),
});

export type CreateAmendmentInput = z.infer<typeof CreateAmendmentSchema>;

// --- Connection Schemas ---

export const ConnectServiceSchema = z.object({
  service: z.enum(['github', 'google', 'slack', 'linear', 'zoom']),
});

const ResourceMetadataSchema = z.object({
  displayName: z.string().max(500).optional(),
  url: z.string().max(2000).optional(),
  description: z.string().max(2000).optional(),
});

export const BindResourceSchema = z.object({
  projectUri: z.string().min(1),
  resourceType: z.enum(['github_repo', 'google_doc', 'google_sheet', 'google_drive_folder', 'slack_channel', 'linear_team', 'linear_project', 'zoom_meeting']),
  resourceId: z.string().min(1).max(1000),
  metadata: ResourceMetadataSchema.optional(),
});

export type ConnectServiceInput = z.infer<typeof ConnectServiceSchema>;
export type BindResourceInput = z.infer<typeof BindResourceSchema>;

// --- Governance Schemas ---

export const CreateProposalSchema = z.object({
  title: z.string().min(1).max(256),
  body: z.string().min(1).max(10000),
  proposalType: z.enum(['amendment', 'budget', 'membership', 'policy', 'election', 'other']),
  votingMethod: z.enum(['simple_majority', 'supermajority', 'consensus', 'ranked_choice']).default('simple_majority'),
  quorumRequired: z.number().min(0).max(1).optional(),
  discussionEndsAt: z.string().optional(),
  votingEndsAt: z.string().optional(),
});

export const UpdateProposalStatusSchema = z.object({
  status: z.enum(['discussion', 'voting', 'passed', 'failed', 'withdrawn']),
});

export type CreateProposalInput = z.infer<typeof CreateProposalSchema>;
export type UpdateProposalStatusInput = z.infer<typeof UpdateProposalStatusSchema>;

// --- Voting Schemas ---

export const CastVoteSchema = z.object({
  choice: z.string().min(1),
  rationale: z.string().max(2000).optional(),
});

export const CreateDelegationSchema = z.object({
  delegateeDid: z.string().min(1),
  scope: z.enum(['project', 'proposal']).default('project'),
  proposalUri: z.string().optional(),
});

export type CastVoteInput = z.infer<typeof CastVoteSchema>;
export type CreateDelegationInput = z.infer<typeof CreateDelegationSchema>;

// --- Funding Schemas ---

export const CampaignTier = z.enum(['network', 'cooperative', 'project']);
export const CampaignType = z.enum(['rewards', 'patronage', 'donation', 'revenue_share']);
export const CampaignStatus = z.enum(['draft', 'active', 'funded', 'completed', 'cancelled']);
export const FundingModel = z.enum(['all_or_nothing', 'keep_it_all']);

export const CreateCampaignSchema = z.object({
  beneficiaryUri: z.string().min(1),
  title: z.string().min(1).max(256),
  description: z.string().max(5000).optional(),
  tier: CampaignTier,
  campaignType: CampaignType,
  goalAmount: z.number().int().min(1),
  goalCurrency: z.string().min(1).max(10).default('USD'),
  fundingModel: FundingModel.default('all_or_nothing'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const UpdateCampaignSchema = z.object({
  title: z.string().min(1).max(256).optional(),
  description: z.string().max(5000).optional(),
  goalAmount: z.number().int().min(1).optional(),
  goalCurrency: z.string().min(1).max(10).optional(),
  fundingModel: FundingModel.optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const UpdateCampaignStatusSchema = z.object({
  status: CampaignStatus.exclude(['draft']),
});

export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof UpdateCampaignSchema>;
export type UpdateCampaignStatusInput = z.infer<typeof UpdateCampaignStatusSchema>;

// --- Pledge Schemas ---

export const PaymentStatus = z.enum(['pending', 'completed', 'failed', 'refunded']);

export const CreatePledgeSchema = z.object({
  campaignUri: z.string().min(1),
  amount: z.number().int().min(1),
  currency: z.string().min(1).max(10).default('USD'),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type CreatePledgeInput = z.infer<typeof CreatePledgeSchema>;

// --- OIDC Client Registration ---

export const RegisterOidcClientSchema = z.object({
  client_name: z.string().min(1).max(255),
  redirect_uris: z.array(z.string().url()).min(1).max(20),
  grant_types: z
    .array(z.enum(['authorization_code', 'refresh_token']))
    .max(5)
    .default(['authorization_code']),
  response_types: z.array(z.string()).max(5).default(['code']),
  token_endpoint_auth_method: z
    .enum(['client_secret_basic', 'client_secret_post'])
    .default('client_secret_basic'),
  scope: z.string().optional(),
  logo_uri: z.string().url().optional(),
  tos_uri: z.string().url().optional(),
  policy_uri: z.string().url().optional(),
});

export type RegisterOidcClientInput = z.infer<typeof RegisterOidcClientSchema>;

// --- Automation Schemas ---

export const EventTypeEnum = z.enum([
  'org.cooperative.created',
  'org.project.created',
  'org.membership.created',
  'org.membership.removed',
  'alignment.interest.submitted',
  'alignment.interest.updated',
  'alignment.outcome.created',
  'agreement.created',
  'agreement.signed',
  'agreement.activated',
  'agreement.amended',
  'governance.proposal.created',
  'governance.proposal.status_changed',
  'governance.vote.cast',
  'funding.campaign.created',
  'funding.campaign.status_changed',
  'funding.pledge.created',
  'connection.connected',
  'connection.disconnected',
  'connection.resource.bound',
  'agent.config.created',
  'agent.config.updated',
  'agent.message.sent',
  'agent.budget.exceeded',
]);

export const TriggerActionTypeEnum = z.enum(['notify', 'call_webhook', 'create_task']);

export const CreateWorkflowSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  enabled: z.boolean().default(true),
});

export const UpdateWorkflowSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  enabled: z.boolean().optional(),
});

export const TriggerActionSchema = z.object({
  type: TriggerActionTypeEnum,
  config: z.record(z.string(), z.unknown()),
});

export const TriggerConditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(['eq', 'neq', 'contains', 'gt', 'lt']),
  value: z.unknown(),
});

export const CreateTriggerSchema = z.object({
  eventType: EventTypeEnum,
  conditions: z.array(TriggerConditionSchema).max(20).optional(),
  actions: z.array(TriggerActionSchema).min(1).max(20),
  enabled: z.boolean().default(true),
});

export const UpdateTriggerSchema = z.object({
  conditions: z.array(TriggerConditionSchema).max(20).optional(),
  actions: z.array(TriggerActionSchema).min(1).max(20).optional(),
  enabled: z.boolean().optional(),
});

// --- Workflow Definition Schemas ---

export const WorkflowNodeTypeEnum = z.enum(['trigger', 'condition', 'action', 'delay']);

export const WorkflowNodeSchema = z.object({
  id: z.string().min(1),
  type: WorkflowNodeTypeEnum,
  label: z.string().max(255).optional(),
  config: z.record(z.string(), z.unknown()).default({}),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});

export const WorkflowConnectionSchema = z.object({
  id: z.string().min(1),
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  label: z.string().max(100).optional(),
});

export const WorkflowDefinitionSchema = z.object({
  nodes: z.array(WorkflowNodeSchema).min(1),
  connections: z.array(WorkflowConnectionSchema).default([]),
  description: z.string().max(2000).nullable().optional(),
});

export const UpdateWorkflowDefinitionSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  definition: WorkflowDefinitionSchema.optional(),
  enabled: z.boolean().optional(),
});

export type CreateWorkflowInput = z.infer<typeof CreateWorkflowSchema>;
export type UpdateWorkflowInput = z.infer<typeof UpdateWorkflowSchema>;
export type CreateTriggerInput = z.infer<typeof CreateTriggerSchema>;
export type UpdateTriggerInput = z.infer<typeof UpdateTriggerSchema>;
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;
export type WorkflowConnection = z.infer<typeof WorkflowConnectionSchema>;
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;
export type UpdateWorkflowDefinitionInput = z.infer<typeof UpdateWorkflowDefinitionSchema>;

// --- Agent Schemas ---

export const AgentTypeEnum = z.enum(['custom', 'facilitator', 'governance', 'coordinator', 'analyst']);

export const CreateAgentConfigSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  agentType: AgentTypeEnum.default('custom'),
  model: z.string().min(1).max(100).default('claude-sonnet-4-20250514'),
  systemPrompt: z.string().min(1).max(10000),
  allowedTools: z.array(z.string().min(1).max(100)).max(50).default([]),
  contextSources: z.array(z.string().min(1).max(200)).max(50).default([]),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokensPerRequest: z.number().int().min(100).max(64000).default(4096),
  maxTokensPerSession: z.number().int().min(1000).max(1000000).default(100000),
  monthlyBudgetCents: z.number().int().min(0).optional(),
  enabled: z.boolean().default(true),
});

export const UpdateAgentConfigSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  agentType: AgentTypeEnum.optional(),
  model: z.string().min(1).max(100).optional(),
  systemPrompt: z.string().min(1).max(10000).optional(),
  allowedTools: z.array(z.string().min(1).max(100)).optional(),
  contextSources: z.array(z.string().min(1).max(200)).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokensPerRequest: z.number().int().min(100).max(64000).optional(),
  maxTokensPerSession: z.number().int().min(1000).max(1000000).optional(),
  monthlyBudgetCents: z.number().int().min(0).nullable().optional(),
  enabled: z.boolean().optional(),
});

export const SendAgentMessageSchema = z.object({
  message: z.string().min(1).max(10000),
  sessionId: z.string().optional(),
});

export const CreateAgentFromTemplateSchema = z.object({
  agentType: AgentTypeEnum,
  name: z.string().min(1).max(255).optional(),
  monthlyBudgetCents: z.number().int().min(0).optional(),
});

export type CreateAgentConfigInput = z.infer<typeof CreateAgentConfigSchema>;
export type UpdateAgentConfigInput = z.infer<typeof UpdateAgentConfigSchema>;
export type SendAgentMessageInput = z.infer<typeof SendAgentMessageSchema>;
export type CreateAgentFromTemplateInput = z.infer<typeof CreateAgentFromTemplateSchema>;

// --- Route-Level Request Body Schemas ---
// Used by API route handlers for runtime validation

export const SetupInitializeSchema = z.object({
  cooperativeName: z.string().min(1).max(255),
  cooperativeHandle: z.string().max(100).optional(),
  adminDisplayName: z.string().min(1).max(255),
  adminHandle: z.string().max(100).optional(),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8).max(256),
});

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(256),
  displayName: z.string().min(1).max(255),
  invitationToken: z.string().optional(),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const UpdateCoopSchema = z.object({
  displayName: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  website: z.string().url().optional(),
});

export const CreateInvitationSchema = z.object({
  email: z.string().email(),
  roles: z.array(z.string().min(1)).max(10).optional(),
  intendedRoles: z.array(z.string().min(1)).max(10).optional(),
  message: z.string().max(2000).optional(),
});

export const AcceptInvitationSchema = z.object({
  displayName: z.string().min(1).max(255),
  handle: z.string().max(255).optional(),
  password: z.string().min(8).max(256),
});

export const UpdateRolesSchema = z.object({
  roles: z.array(z.string().min(1)).max(10),
});

export const CreateProposalBodySchema = z.object({
  title: z.string().min(1).max(256),
  body: z.string().min(1).max(50000),
  bodyFormat: z.string().max(50).optional(),
  votingType: z.string().min(1),
  options: z.array(z.unknown()).max(20).optional(),
  quorumType: z.string().min(1),
  quorumBasis: z.string().optional(),
  quorumThreshold: z.number().min(0).max(1).optional(),
  closesAt: z.string().optional(),
  tags: z.array(z.string()).max(20).optional(),
});

export const UpdateProposalBodySchema = z.object({
  title: z.string().min(1).max(256).optional(),
  body: z.string().min(1).max(50000).optional(),
  closesAt: z.string().optional(),
  tags: z.array(z.string()).max(20).optional(),
});

export const CreateAgreementBodySchema = z.object({
  title: z.string().min(1).max(255),
  body: z.string().min(1).max(50000),
  bodyFormat: z.string().max(50).optional(),
  agreementType: z.string().min(1),
  partyDids: z.array(z.string()).max(100).optional(),
});

export const UpdateAgreementBodySchema = z.object({
  title: z.string().min(1).max(255).optional(),
  body: z.string().min(1).max(50000).optional(),
});

export const CreateThreadSchema = z.object({
  title: z.string().max(255).optional(),
  threadType: z.string().max(50).optional(),
  memberDids: z.array(z.string()).max(100).optional(),
});

export const CreatePostSchema = z.object({
  body: z.string().min(1).max(50000),
  parentPostId: z.string().optional(),
});

export const UpdatePostSchema = z.object({
  body: z.string().min(1).max(50000),
});

export const SignAgreementSchema = z.object({
  statement: z.string().max(2000).optional(),
});

export const RetractSignatureSchema = z.object({
  reason: z.string().max(2000).optional(),
});
