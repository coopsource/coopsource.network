import type { ColumnType, Generated } from 'kysely';

// ──────────────────────────────────────────────
// New tables (001–008 migrations)
// ──────────────────────────────────────────────

export interface SystemConfigTable {
  key: string;
  value: ColumnType<Record<string, unknown>, string | Record<string, unknown>, string | Record<string, unknown>>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface FactLogTable {
  id: Generated<string>;
  entity_type: string;
  entity_id: string;
  field: string;
  old_value: ColumnType<unknown | null, string | unknown | null, string | unknown | null>;
  new_value: ColumnType<unknown | null, string | unknown | null, string | unknown | null>;
  changed_by: string | null;
  changed_at: ColumnType<Date, Date | string | undefined, Date | string>;
  reason: string | null;
  ip_address: string | null;
}

export interface FactLogRedactionTable {
  fact_log_id: string;
  redacted_at: ColumnType<Date, Date | string | undefined, Date | string>;
  redacted_by: string | null;
  request_id: string | null;
}

export interface DataDeletionRequestTable {
  id: Generated<string>;
  entity_did: string;
  requested_at: ColumnType<Date, Date | string | undefined, Date | string>;
  completed_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  requested_by: string;
  reason: string | null;
}

export interface EntityTable {
  did: string;
  type: string;
  handle: string | null;
  display_name: string;
  description: string | null;
  avatar_cid: string | null;
  status: string;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  created_by: string | null;
  invalidated_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  invalidated_by: string | null;
  indexed_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface CooperativeProfileTable {
  entity_did: string;
  uri: string | null;
  cid: string | null;
  cooperative_type: string;
  is_network: boolean;
  membership_policy: string;
  max_members: number | null;
  location: string | null;
  website: string | null;
  founded_date: ColumnType<string | null, string | null, string | null>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  indexed_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface EntityKeyTable {
  id: Generated<string>;
  entity_did: string;
  key_type: string;
  public_key_jwk: string;
  private_key_enc: string;
  key_purpose: string;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  rotated_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  invalidated_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
}

export interface AuthCredentialTable {
  id: Generated<string>;
  entity_did: string;
  credential_type: string;
  identifier: string;
  secret_hash: string | null;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  last_used_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  invalidated_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
}

export interface SessionTable {
  sid: string;
  sess: ColumnType<Record<string, unknown>, string | Record<string, unknown>, string | Record<string, unknown>>;
  expire: Date;
}

export interface PdsRecordTable {
  uri: string;
  did: string;
  collection: string;
  rkey: string;
  cid: string;
  content: ColumnType<Record<string, unknown>, string | Record<string, unknown>, string | Record<string, unknown>>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  indexed_at: ColumnType<Date, Date | string | undefined, Date | string>;
  deleted_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
}

export interface PdsCommitTable {
  global_seq: Generated<number>;
  local_seq: number;
  did: string;
  commit_cid: string;
  record_uri: string;
  record_cid: string;
  operation: string;
  prev_record_cid: string | null;
  committed_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface PdsFirehoseCursorTable {
  subscriber_id: string;
  last_global_seq: number;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface InvitationTable {
  id: Generated<string>;
  cooperative_did: string;
  invitee_did: string | null;
  invitee_email: string | null;
  invited_by_did: string;
  intended_roles: string[];
  token: string;
  message: string | null;
  status: string;
  expires_at: Date;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  invalidated_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  invalidated_by: string | null;
}

export interface MembershipTable {
  id: Generated<string>;
  member_did: string;
  cooperative_did: string;
  status: string;
  member_record_uri: string | null;
  member_record_cid: string | null;
  approval_record_uri: string | null;
  approval_record_cid: string | null;
  invited_by_did: string | null;
  invitation_id: string | null;
  joined_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  departed_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  status_reason: string | null;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  created_by: string | null;
  invalidated_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  invalidated_by: string | null;
  indexed_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface MembershipRoleTable {
  membership_id: string;
  role: string;
  indexed_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface ThreadTable {
  id: Generated<string>;
  cooperative_did: string;
  title: string | null;
  thread_type: string;
  status: string;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  created_by: string;
  invalidated_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  invalidated_by: string | null;
}

export interface ThreadMemberTable {
  thread_id: string;
  entity_did: string;
  joined_at: ColumnType<Date, Date | string | undefined, Date | string>;
  last_read_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
}

export interface PostTable {
  id: Generated<string>;
  thread_id: string;
  author_did: string;
  body: string;
  body_format: string;
  parent_post_id: string | null;
  status: string;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  edited_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  invalidated_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  invalidated_by: string | null;
}

export interface ProposalTable {
  id: Generated<string>;
  uri: string | null;
  cid: string | null;
  cooperative_did: string;
  author_did: string;
  title: string;
  body: string;
  body_format: string;
  voting_type: string;
  options: ColumnType<unknown[] | null, string | unknown[] | null, string | unknown[] | null>;
  quorum_type: string;
  quorum_basis: string;
  quorum_threshold: ColumnType<number | null, number | string | null, number | string | null>;
  status: string;
  outcome: string | null;
  opens_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  closes_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  resolved_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  tags: string[];
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  created_by: string;
  invalidated_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  invalidated_by: string | null;
  indexed_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface VoteTable {
  id: Generated<string>;
  uri: string | null;
  cid: string | null;
  proposal_id: string;
  proposal_uri: string;
  proposal_cid: string;
  voter_did: string;
  choice: string;
  rationale: string | null;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  retracted_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  retracted_by: string | null;
  indexed_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface AgreementTable {
  id: Generated<string>;
  uri: string | null;
  cid: string | null;
  cooperative_did: string;
  created_by: string;
  title: string;
  agreement_type: string;
  body: string;
  body_format: string;
  status: string;
  parent_agreement_uri: string | null;
  effective_date: ColumnType<Date | null, Date | string | null, Date | string | null>;
  expires_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  executed_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  invalidated_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  invalidated_by: string | null;
  indexed_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface AgreementPartyTable {
  agreement_id: string;
  entity_did: string;
  required: boolean;
  added_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface AgreementSignatureTable {
  id: Generated<string>;
  uri: string | null;
  cid: string | null;
  agreement_id: string;
  agreement_uri: string;
  agreement_cid: string;
  signer_did: string;
  statement: string | null;
  signed_at: Date;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  retracted_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  retracted_by: string | null;
  retraction_reason: string | null;
  indexed_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

// ──────────────────────────────────────────────
// Legacy tables (kept for Stage 2-3 features)
// ──────────────────────────────────────────────

export interface StakeholderInterestTable {
  uri: string;
  did: string;
  rkey: string;
  project_uri: string;
  interests: ColumnType<unknown[], string | unknown[], string | unknown[]>;
  contributions: ColumnType<unknown[], string | unknown[], string | unknown[]>;
  constraints: ColumnType<unknown[], string | unknown[], string | unknown[]>;
  red_lines: ColumnType<unknown[], string | unknown[], string | unknown[]>;
  preferences: ColumnType<Record<string, unknown>, string | Record<string, unknown>, string | Record<string, unknown>>;
  created_at: ColumnType<Date, Date | string, Date | string>;
  updated_at: ColumnType<Date, Date | string, Date | string>;
  indexed_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface DesiredOutcomeTable {
  uri: string;
  did: string;
  rkey: string;
  project_uri: string;
  title: string;
  description: string | null;
  category: string;
  success_criteria: ColumnType<unknown[], string | unknown[], string | unknown[]>;
  stakeholder_support: ColumnType<unknown[], string | unknown[], string | unknown[]>;
  status: string;
  created_at: ColumnType<Date, Date | string, Date | string>;
  indexed_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface InterestMapTable {
  uri: string;
  did: string;
  rkey: string;
  project_uri: string;
  alignment_zones: ColumnType<unknown[], string | unknown[], string | unknown[]>;
  conflict_zones: ColumnType<unknown[], string | unknown[], string | unknown[]>;
  ai_analysis: ColumnType<Record<string, unknown> | null, string | Record<string, unknown> | null, string | Record<string, unknown> | null>;
  created_at: ColumnType<Date, Date | string, Date | string>;
  indexed_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface MasterAgreementTable {
  uri: string;
  did: string;
  rkey: string;
  project_uri: string;
  title: string;
  version: number;
  purpose: string | null;
  scope: string | null;
  agreement_type: string;
  governance_framework: ColumnType<Record<string, unknown> | null, string | Record<string, unknown> | null, string | Record<string, unknown> | null>;
  dispute_resolution: ColumnType<Record<string, unknown> | null, string | Record<string, unknown> | null, string | Record<string, unknown> | null>;
  amendment_process: ColumnType<Record<string, unknown> | null, string | Record<string, unknown> | null, string | Record<string, unknown> | null>;
  termination_conditions: ColumnType<Record<string, unknown> | null, string | Record<string, unknown> | null, string | Record<string, unknown> | null>;
  status: string;
  effective_date: ColumnType<Date | null, Date | string | null, Date | string | null>;
  created_at: ColumnType<Date, Date | string, Date | string>;
  updated_at: ColumnType<Date, Date | string, Date | string>;
  indexed_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface StakeholderTermsTable {
  uri: string;
  did: string;
  rkey: string;
  master_agreement_uri: string;
  stakeholder_did: string;
  stakeholder_type: string;
  stakeholder_class: string | null;
  contributions: ColumnType<unknown[], string | unknown[], string | unknown[]>;
  financial_terms: ColumnType<Record<string, unknown>, string | Record<string, unknown>, string | Record<string, unknown>>;
  ip_terms: ColumnType<Record<string, unknown>, string | Record<string, unknown>, string | Record<string, unknown>>;
  governance_rights: ColumnType<Record<string, unknown>, string | Record<string, unknown>, string | Record<string, unknown>>;
  exit_terms: ColumnType<Record<string, unknown>, string | Record<string, unknown>, string | Record<string, unknown>>;
  signed_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  created_at: ColumnType<Date, Date | string, Date | string>;
  indexed_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface ExternalConnectionTable {
  uri: string;
  did: string;
  rkey: string;
  service: string;
  status: string;
  oauth_token_encrypted: string | null;
  metadata: ColumnType<Record<string, unknown> | null, string | Record<string, unknown> | null, string | Record<string, unknown> | null>;
  created_at: ColumnType<Date, Date | string, Date | string>;
  indexed_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface ConnectionBindingTable {
  uri: string;
  did: string;
  rkey: string;
  connection_uri: string;
  project_uri: string;
  resource_type: string;
  resource_id: string;
  metadata: ColumnType<Record<string, unknown> | null, string | Record<string, unknown> | null, string | Record<string, unknown> | null>;
  created_at: ColumnType<Date, Date | string, Date | string>;
  indexed_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface AutomationWorkflowTable {
  id: string;
  project_uri: string;
  name: string;
  definition: ColumnType<Record<string, unknown>, string | Record<string, unknown>, string | Record<string, unknown>>;
  enabled: boolean;
  last_execution: ColumnType<Record<string, unknown> | null, string | Record<string, unknown> | null, string | Record<string, unknown> | null>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface AutomationTriggerTable {
  id: string;
  workflow_id: string;
  event_type: string;
  conditions: ColumnType<Record<string, unknown> | null, string | Record<string, unknown> | null, string | Record<string, unknown> | null>;
  actions: ColumnType<Record<string, unknown>, string | Record<string, unknown>, string | Record<string, unknown>>;
  enabled: boolean;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface FundingCampaignTable {
  uri: string;
  did: string;
  rkey: string;
  beneficiary_uri: string;
  title: string;
  description: string | null;
  tier: string;
  campaign_type: string;
  goal_amount: number;
  goal_currency: string;
  amount_raised: number;
  backer_count: number;
  funding_model: string;
  status: string;
  start_date: ColumnType<Date | null, Date | string | null, Date | string | null>;
  end_date: ColumnType<Date | null, Date | string | null, Date | string | null>;
  metadata: ColumnType<Record<string, unknown> | null, string | Record<string, unknown> | null, string | Record<string, unknown> | null>;
  created_at: ColumnType<Date, Date | string, Date | string>;
  indexed_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface FundingPledgeTable {
  uri: string;
  did: string;
  rkey: string;
  campaign_uri: string;
  backer_did: string;
  amount: number;
  currency: string;
  payment_status: string;
  stripe_checkout_session_id: string | null;
  metadata: ColumnType<Record<string, unknown> | null, string | Record<string, unknown> | null, string | Record<string, unknown> | null>;
  created_at: ColumnType<Date, Date | string, Date | string>;
  indexed_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface OidcClientTable {
  client_id: string;
  client_secret_hash: string | null;
  client_name: string;
  redirect_uris: ColumnType<string[], string | string[], string | string[]>;
  grant_types: ColumnType<string[], string | string[], string | string[]>;
  response_types: ColumnType<string[], string | string[], string | string[]>;
  scope: string | null;
  token_endpoint_auth_method: string;
  logo_uri: string | null;
  tos_uri: string | null;
  policy_uri: string | null;
  owner_did: string | null;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface OidcPayloadTable {
  id: string;
  model: string;
  payload: ColumnType<Record<string, unknown>, string | Record<string, unknown>, string | Record<string, unknown>>;
  grant_id: string | null;
  user_code: string | null;
  uid: string | null;
  expires_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  consumed_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface OidcConsentTable {
  id: string;
  client_id: string;
  account_did: string;
  granted_scopes: ColumnType<string[], string | string[], string | string[]>;
  granted_claims: ColumnType<string[], string | string[], string | string[]>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface EventLogTable {
  id: string;
  event_type: string;
  project_uri: string | null;
  actor_did: string | null;
  payload: ColumnType<Record<string, unknown>, string | Record<string, unknown>, string | Record<string, unknown>>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface WorkflowExecutionTable {
  id: string;
  workflow_id: string;
  trigger_event: string;
  status: string;
  current_node_id: string | null;
  execution_log: ColumnType<unknown[], string | unknown[], string | unknown[]>;
  started_at: ColumnType<Date, Date | string | undefined, Date | string>;
  completed_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
}

export interface AgentConfigTable {
  id: string;
  project_uri: string;
  name: string;
  description: string | null;
  agent_type: string;
  model: string;
  system_prompt: string;
  allowed_tools: ColumnType<string[], string | string[], string | string[]>;
  context_sources: ColumnType<string[], string | string[], string | string[]>;
  temperature: number;
  max_tokens_per_request: number;
  max_tokens_per_session: number;
  monthly_budget_cents: number | null;
  enabled: boolean;
  created_by: string;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface AgentSessionTable {
  id: string;
  agent_config_id: string;
  user_did: string;
  title: string | null;
  status: string;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_microdollars: number;
  memory: ColumnType<Record<string, unknown>, string | Record<string, unknown>, string | Record<string, unknown>>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
  expires_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
}

export interface AgentMessageTable {
  id: string;
  session_id: string;
  role: string;
  content: string;
  tool_calls: ColumnType<unknown[] | null, string | unknown[] | null, string | unknown[] | null>;
  input_tokens: number;
  output_tokens: number;
  cost_microdollars: number;
  model: string | null;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface AgentUsageTable {
  id: string;
  project_uri: string;
  agent_config_id: string | null;
  period: string;
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_microdollars: number;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface DelegationTable {
  uri: string;
  did: string;
  rkey: string;
  project_uri: string;
  delegator_did: string;
  delegatee_did: string;
  scope: string;
  proposal_uri: string | null;
  status: string;
  created_at: ColumnType<Date, Date | string, Date | string>;
  revoked_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  indexed_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

// ──────────────────────────────────────────────
// 009 — Local PLC store
// ──────────────────────────────────────────────

export interface PlcOperationTable {
  did: string;
  genesis_op: ColumnType<Record<string, unknown>, string | Record<string, unknown>, string | Record<string, unknown>>;
  did_document: ColumnType<Record<string, unknown>, string | Record<string, unknown>, string | Record<string, unknown>>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

// ──────────────────────────────────────────────
// Database interface
// ──────────────────────────────────────────────

export interface Database {
  // New tables (001–009)
  plc_operation: PlcOperationTable;
  system_config: SystemConfigTable;
  fact_log: FactLogTable;
  fact_log_redaction: FactLogRedactionTable;
  data_deletion_request: DataDeletionRequestTable;
  entity: EntityTable;
  cooperative_profile: CooperativeProfileTable;
  entity_key: EntityKeyTable;
  auth_credential: AuthCredentialTable;
  session: SessionTable;
  pds_record: PdsRecordTable;
  pds_commit: PdsCommitTable;
  pds_firehose_cursor: PdsFirehoseCursorTable;
  invitation: InvitationTable;
  membership: MembershipTable;
  membership_role: MembershipRoleTable;
  thread: ThreadTable;
  thread_member: ThreadMemberTable;
  post: PostTable;
  proposal: ProposalTable;
  vote: VoteTable;
  agreement: AgreementTable;
  agreement_party: AgreementPartyTable;
  agreement_signature: AgreementSignatureTable;

  // Legacy tables (kept for Stage 2-3 features)
  stakeholder_interest: StakeholderInterestTable;
  desired_outcome: DesiredOutcomeTable;
  interest_map: InterestMapTable;
  master_agreement: MasterAgreementTable;
  stakeholder_terms: StakeholderTermsTable;
  external_connection: ExternalConnectionTable;
  connection_binding: ConnectionBindingTable;
  automation_workflow: AutomationWorkflowTable;
  automation_trigger: AutomationTriggerTable;
  funding_campaign: FundingCampaignTable;
  funding_pledge: FundingPledgeTable;
  oidc_client: OidcClientTable;
  oidc_payload: OidcPayloadTable;
  oidc_consent: OidcConsentTable;
  event_log: EventLogTable;
  workflow_execution: WorkflowExecutionTable;
  agent_config: AgentConfigTable;
  agent_session: AgentSessionTable;
  agent_message: AgentMessageTable;
  agent_usage: AgentUsageTable;
  delegation: DelegationTable;
}
