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
  public_description: ColumnType<boolean, boolean | undefined, boolean>;
  public_members: ColumnType<boolean, boolean | undefined, boolean>;
  public_activity: ColumnType<boolean, boolean | undefined, boolean>;
  public_agreements: ColumnType<boolean, boolean | undefined, boolean>;
  public_campaigns: ColumnType<boolean, boolean | undefined, boolean>;
  governance_visibility: ColumnType<string, string | undefined, string>;
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

// ──────────────────────────────────────────────
// Unified Agreement System (018 migration)
// ──────────────────────────────────────────────

export interface AgreementTable {
  uri: string;
  did: string;
  rkey: string;
  project_uri: string;
  title: string;
  version: number;
  purpose: string | null;
  scope: string | null;
  agreement_type: string;
  body: string | null;
  body_format: string;
  created_by: string;
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

export interface AgreementSignatureTable {
  id: Generated<string>;
  uri: string | null;
  cid: string | null;
  agreement_id: string | null;
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

export interface AgreementRevisionTable {
  id: Generated<string>;
  agreement_uri: string;
  revision_number: number;
  changed_by: string;
  change_type: string;
  field_changes: ColumnType<Record<string, unknown> | null, string | Record<string, unknown> | null, string | Record<string, unknown> | null>;
  snapshot: ColumnType<Record<string, unknown> | null, string | Record<string, unknown> | null, string | Record<string, unknown> | null>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
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

export interface StakeholderTermsTable {
  uri: string;
  did: string;
  rkey: string;
  agreement_uri: string;
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

// ──────────────────────────────────────────────
// Role Definitions (020 migration)
// ──────────────────────────────────────────────

export interface RoleDefinitionTable {
  id: Generated<string>;
  cooperative_did: string;
  name: string;
  permissions: string[];
  inherits: string[];
  is_builtin: boolean;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

// ──────────────────────────────────────────────
// Federation Peer Registry (021 migration)
// ──────────────────────────────────────────────

export interface FederationPeerTable {
  id: Generated<string>;
  did: string;
  display_name: string;
  description: string | null;
  cooperative_type: string | null;
  website: string | null;
  pds_url: string;
  registered_at: ColumnType<Date, Date | string | undefined, Date | string>;
  last_seen_at: ColumnType<Date, Date | string | undefined, Date | string>;
  status: string;
  metadata: ColumnType<Record<string, unknown> | null, string | Record<string, unknown> | null, string | Record<string, unknown> | null>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

// ──────────────────────────────────────────────
// Signature Request Tracking (022 migration)
// ──────────────────────────────────────────────

export interface SignatureRequestTable {
  id: Generated<string>;
  agreement_uri: string;
  agreement_title: string | null;
  signer_did: string;
  cooperative_did: string;
  requester_did: string;
  status: string;
  requested_at: ColumnType<Date, Date | string | undefined, Date | string>;
  responded_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  expires_at: ColumnType<Date, Date | string, Date | string>;
  response_message: string | null;
  signature_uri: string | null;
  signature_cid: string | null;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

// ──────────────────────────────────────────────
// Federation Outbox (023 migration)
// ──────────────────────────────────────────────

export interface FederationOutboxTable {
  id: Generated<string>;
  target_did: string;
  target_url: string;
  endpoint: string;
  method: string;
  payload: ColumnType<Record<string, unknown>, string | Record<string, unknown>, string | Record<string, unknown>>;
  idempotency_key: string | null;
  status: string;
  attempts: number;
  max_attempts: number;
  next_attempt_at: ColumnType<Date, Date | string, Date | string>;
  last_error: string | null;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  sent_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  completed_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
}

// ──────────────────────────────────────────────
// Agreement Templates (019 migration)
// ──────────────────────────────────────────────

export interface AgreementTemplateTable {
  id: Generated<string>;
  cooperative_did: string;
  created_by: string;
  name: string;
  description: string | null;
  agreement_type: string;
  template_data: ColumnType<Record<string, unknown>, string | Record<string, unknown>, string | Record<string, unknown>>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
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
  payment_session_id: string | null;
  payment_provider: string | null;
  metadata: ColumnType<Record<string, unknown> | null, string | Record<string, unknown> | null, string | Record<string, unknown> | null>;
  created_at: ColumnType<Date, Date | string, Date | string>;
  indexed_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface PaymentProviderConfigTable {
  id: Generated<string>;
  cooperative_did: string;
  provider_id: string;
  display_name: string;
  enabled: ColumnType<boolean, boolean | undefined, boolean>;
  credentials_enc: string;
  webhook_secret_enc: string | null;
  config: ColumnType<Record<string, unknown> | null, string | Record<string, unknown> | null, string | Record<string, unknown> | null>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
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

export interface ModelProviderConfigTable {
  id: Generated<string>;
  cooperative_did: string;
  provider_id: string;
  display_name: string;
  enabled: ColumnType<boolean, boolean | undefined, boolean>;
  credentials_enc: string;
  allowed_models: ColumnType<string[], string | string[], string | string[]>;
  config: ColumnType<Record<string, unknown> | null, string | Record<string, unknown> | null, string | Record<string, unknown> | null>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface AgentConfigTable {
  id: Generated<string>;
  cooperative_did: string;
  name: string;
  description: string | null;
  agent_type: string;
  model_config: ColumnType<Record<string, unknown>, string | Record<string, unknown>, string | Record<string, unknown>>;
  system_prompt: string;
  allowed_tools: ColumnType<string[], string | string[], string | string[]>;
  context_sources: ColumnType<string[], string | string[], string | string[]>;
  temperature: number;
  max_tokens_per_request: number;
  max_tokens_per_session: number;
  monthly_budget_cents: number | null;
  enabled: ColumnType<boolean, boolean | undefined, boolean>;
  created_by: string;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface AgentSessionTable {
  id: Generated<string>;
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
  id: Generated<string>;
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
  id: Generated<string>;
  cooperative_did: string;
  agent_config_id: string | null;
  period: string;
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_microdollars: number;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface ApiTokenTable {
  id: Generated<string>;
  cooperative_did: string;
  user_did: string;
  name: string;
  token_hash: string;
  scopes: ColumnType<string[], string | string[], string | string[]>;
  last_used_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  expires_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface AgentTriggerTable {
  id: Generated<string>;
  agent_config_id: string;
  cooperative_did: string;
  event_type: string;
  conditions: ColumnType<unknown[], string | unknown[], string | unknown[]>;
  prompt_template: string | null;
  actions: ColumnType<unknown[], string | unknown[], string | unknown[]>;
  cooldown_seconds: number;
  enabled: ColumnType<boolean, boolean | undefined, boolean>;
  last_triggered_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface TriggerExecutionLogTable {
  id: Generated<string>;
  trigger_id: string;
  cooperative_did: string;
  event_type: string;
  event_data: ColumnType<Record<string, unknown>, string | Record<string, unknown>, string | Record<string, unknown>>;
  conditions_matched: boolean;
  actions_executed: ColumnType<unknown[], string | unknown[], string | unknown[]>;
  status: string;
  error: string | null;
  started_at: ColumnType<Date, Date | string | undefined, Date | string>;
  completed_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  duration_ms: number | null;
}

export interface NotificationTable {
  id: Generated<string>;
  cooperative_did: string;
  recipient_did: string;
  title: string;
  body: string | null;
  category: string;
  source_type: string | null;
  source_id: string | null;
  read: ColumnType<boolean, boolean | undefined, boolean>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
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
// 030 — Private record + operator audit log
// ──────────────────────────────────────────────

export interface PrivateRecordTable {
  did: string;
  collection: string;
  rkey: string;
  record: ColumnType<Record<string, unknown>, Record<string, unknown> | string, Record<string, unknown> | string>;
  created_by: string | null;
  created_at: ColumnType<Date, Date | string, Date | string>;
  updated_at: ColumnType<Date, Date | string, Date | string>;
}

export interface OperatorAuditLogTable {
  id: Generated<string>;
  cooperative_did: string;
  operator_did: string;
  operation: string;
  collection: string;
  rkey: string | null;
  record_uri: string | null;
  record_cid: string | null;
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
  agreement_signature: AgreementSignatureTable;
  agreement_revision: AgreementRevisionTable;
  agreement_template: AgreementTemplateTable;
  role_definition: RoleDefinitionTable;
  federation_peer: FederationPeerTable;
  signature_request: SignatureRequestTable;
  federation_outbox: FederationOutboxTable;

  // Legacy tables (kept for Stage 2-3 features)
  stakeholder_interest: StakeholderInterestTable;
  desired_outcome: DesiredOutcomeTable;
  interest_map: InterestMapTable;
  stakeholder_terms: StakeholderTermsTable;
  external_connection: ExternalConnectionTable;
  connection_binding: ConnectionBindingTable;
  trigger_execution_log: TriggerExecutionLogTable;
  notification: NotificationTable;
  funding_campaign: FundingCampaignTable;
  funding_pledge: FundingPledgeTable;
  payment_provider_config: PaymentProviderConfigTable;
  model_provider_config: ModelProviderConfigTable;
  oidc_client: OidcClientTable;
  oidc_payload: OidcPayloadTable;
  oidc_consent: OidcConsentTable;
  agent_config: AgentConfigTable;
  agent_session: AgentSessionTable;
  agent_message: AgentMessageTable;
  agent_usage: AgentUsageTable;
  agent_trigger: AgentTriggerTable;
  api_token: ApiTokenTable;
  delegation: DelegationTable;

  // OAuth tables (013)
  oauth_state: OAuthStateTable;
  oauth_session: OAuthSessionTable;

  // V5 tables (030)
  private_record: PrivateRecordTable;
  operator_audit_log: OperatorAuditLogTable;

  // Governance labels (031)
  governance_label: GovernanceLabelTable;

  // Ecosystem references (032)
  calendar_event_ref: CalendarEventRefTable;
  frontpage_post_ref: FrontpagePostRefTable;

  // Legal & Administrative (033)
  legal_document: LegalDocumentTable;
  meeting_record: MeetingRecordTable;
  admin_officer: AdminOfficerTable;
  compliance_item: ComplianceItemTable;
  member_notice: MemberNoticeTable;
  fiscal_period: FiscalPeriodTable;
}

// ──────────────────────────────────────────────
// 013 — OAuth tables
// ──────────────────────────────────────────────

export interface OAuthStateTable {
  key: string;
  state: ColumnType<Record<string, unknown>, string | Record<string, unknown>, string | Record<string, unknown>>;
  expires_at: ColumnType<Date, Date | string, Date | string>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface OAuthSessionTable {
  did: string;
  token_set: ColumnType<Record<string, unknown>, string | Record<string, unknown>, string | Record<string, unknown>>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

// ──────────────────────────────────────────────
// 031 — Governance labels
// ──────────────────────────────────────────────

export interface GovernanceLabelTable {
  id: Generated<string>;
  src_did: string;
  subject_uri: string;
  subject_cid: string | null;
  label_value: string;
  neg: ColumnType<boolean, boolean | undefined, boolean>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

// ──────────────────────────────────────────────
// 032 — Ecosystem references
// ──────────────────────────────────────────────

export interface CalendarEventRefTable {
  id: Generated<string>;
  event_uri: string;
  proposal_uri: string | null;
  cooperative_did: string;
  title: string | null;
  starts_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  rsvp_count: ColumnType<number, number | undefined, number>;
  indexed_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface FrontpagePostRefTable {
  id: Generated<string>;
  post_uri: string;
  proposal_uri: string | null;
  cooperative_did: string;
  title: string | null;
  comment_count: ColumnType<number, number | undefined, number>;
  indexed_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

// ──────────────────────────────────────────────
// 033 — Legal & Administrative lifecycle
// ──────────────────────────────────────────────

export interface LegalDocumentTable {
  id: Generated<string>;
  uri: string | null;
  cid: string | null;
  cooperative_did: string;
  author_did: string;
  title: string;
  body: string | null;
  body_format: string;
  document_type: string;
  version: number;
  previous_version_uri: string | null;
  status: string;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  indexed_at: ColumnType<Date, Date | string | undefined, Date | string>;
  invalidated_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
}

export interface MeetingRecordTable {
  id: Generated<string>;
  uri: string | null;
  cid: string | null;
  cooperative_did: string;
  author_did: string;
  title: string;
  meeting_date: ColumnType<Date, Date | string, Date | string>;
  meeting_type: string;
  attendee_dids: ColumnType<string[], string | string[], string | string[]>;
  quorum_met: boolean | null;
  resolutions: ColumnType<string[], string | string[], string | string[]>;
  minutes: string | null;
  certified_by: string | null;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  indexed_at: ColumnType<Date, Date | string | undefined, Date | string>;
  invalidated_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
}

export interface AdminOfficerTable {
  id: Generated<string>;
  uri: string | null;
  cid: string | null;
  cooperative_did: string;
  officer_did: string;
  title: string;
  appointed_at: ColumnType<Date, Date | string, Date | string>;
  term_ends_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  appointment_type: string;
  responsibilities: string | null;
  status: string;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  indexed_at: ColumnType<Date, Date | string | undefined, Date | string>;
  invalidated_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
}

export interface ComplianceItemTable {
  id: Generated<string>;
  uri: string | null;
  cid: string | null;
  cooperative_did: string;
  title: string;
  description: string | null;
  due_date: ColumnType<Date, Date | string, Date | string>;
  filing_type: string;
  status: string;
  completed_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  completed_by: string | null;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  indexed_at: ColumnType<Date, Date | string | undefined, Date | string>;
  invalidated_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
}

export interface MemberNoticeTable {
  id: Generated<string>;
  uri: string | null;
  cid: string | null;
  cooperative_did: string;
  author_did: string;
  title: string;
  body: string;
  notice_type: string;
  target_audience: string;
  sent_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  indexed_at: ColumnType<Date, Date | string | undefined, Date | string>;
  invalidated_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
}

export interface FiscalPeriodTable {
  id: Generated<string>;
  uri: string | null;
  cid: string | null;
  cooperative_did: string;
  label: string;
  starts_at: ColumnType<Date, Date | string, Date | string>;
  ends_at: ColumnType<Date, Date | string, Date | string>;
  status: string;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
  indexed_at: ColumnType<Date, Date | string | undefined, Date | string>;
  invalidated_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
}
