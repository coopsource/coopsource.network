/**
 * TypeScript type definitions for Co-op Source Network ATProto lexicons.
 * Generated from lexicon JSON schemas under network/coopsource/.
 *
 * Convention: Types are grouped by namespace (Agreement, Alignment, Connection, Funding, Governance, Org).
 * Sub-definition types are exported alongside their parent record type.
 */

// ============================================================
// network.coopsource.agreement.*
// ============================================================

/** network.coopsource.agreement.amendment — sub-def: fieldChange */
export interface FieldChange {
  from: unknown;
  to: unknown;
}

/** network.coopsource.agreement.amendment — sub-def: amendmentChanges */
export interface AmendmentChanges {
  title?: FieldChange;
  purpose?: FieldChange;
  scope?: FieldChange;
  governanceFramework?: FieldChange;
  disputeResolution?: FieldChange;
  amendmentProcess?: FieldChange;
  terminationConditions?: FieldChange;
}

/** network.coopsource.agreement.amendment — main record */
export interface AgreementAmendment {
  $type?: 'network.coopsource.agreement.amendment';
  agreementUri: string;
  proposalUri?: string;
  title: string;
  description: string;
  changes: AmendmentChanges;
  status: 'proposed' | 'voting' | 'approved' | 'applied' | 'rejected' | (string & {});
  fromVersion: number;
  toVersion?: number;
  proposedAt: string;
  appliedAt?: string;
}

/** network.coopsource.agreement.contribution — main record */
export interface AgreementContribution {
  $type?: 'network.coopsource.agreement.contribution';
  stakeholderTermsUri: string;
  contributionType: 'labor' | 'capital' | 'resources' | 'intellectual-property' | 'network' | (string & {});
  description: string;
  amount?: string;
  units?: string;
  startDate?: string;
  endDate?: string;
  status: 'pending' | 'in-progress' | 'fulfilled' | 'disputed' | (string & {});
  createdAt: string;
}

/** network.coopsource.agreement.master — sub-def: governanceFramework */
export interface GovernanceFramework {
  decisionMethod?: 'consensus' | 'majority-vote' | 'supermajority' | 'weighted-vote' | (string & {});
  quorum?: number;
  votingThreshold?: number;
  disputeResolution?: string;
  modificationProcess?: string;
}

/** network.coopsource.agreement.master — main record */
export interface AgreementMaster {
  $type?: 'network.coopsource.agreement.master';
  projectUri: string;
  title: string;
  version: number;
  purpose?: string;
  scope?: string;
  agreementType?: 'worker-cooperative' | 'multi-stakeholder' | 'platform-cooperative' | 'open-source' | 'producer-cooperative' | 'hybrid-member-investor' | 'custom' | (string & {});
  effectiveDate?: string;
  terminationDate?: string;
  governanceFramework?: GovernanceFramework;
  terminationConditions?: string[];
  status: 'draft' | 'active' | 'amended' | 'terminated' | (string & {});
  createdAt: string;
  updatedAt?: string;
}

/** network.coopsource.agreement.signature — sub-def: signatureData */
export interface SignatureData {
  method: 'atproto-did-proof' | 'timestamp' | 'cryptographic-hash' | (string & {});
  proof?: string;
  timestamp: string;
  witnessDids?: string[];
}

/** network.coopsource.agreement.signature — main record */
export interface AgreementSignature {
  $type?: 'network.coopsource.agreement.signature';
  agreementUri: string;
  signerDid: string;
  signerRole?: string;
  signatureType: 'digital' | 'witnessed' | 'notarized' | (string & {});
  signatureData?: SignatureData;
  signedAt: string;
}

/** network.coopsource.agreement.stakeholderTerms — sub-def: termsContribution */
export interface TermsContribution {
  type: 'labor' | 'capital' | 'resources' | 'intellectual-property' | 'network' | (string & {});
  description: string;
  amount?: string;
}

/** network.coopsource.agreement.stakeholderTerms — sub-def: financialTerms */
export interface FinancialTerms {
  compensationType?: 'salary' | 'share' | 'dividend' | 'hourly' | 'other' | (string & {});
  compensationAmount?: number;
  currency?: string;
  paymentSchedule?: string;
  profitShare?: number;
  equityStake?: number;
}

/** network.coopsource.agreement.stakeholderTerms — sub-def: ipTerms */
export interface IpTerms {
  ownership?: 'individual' | 'collective' | 'shared' | (string & {});
  licensing?: string;
}

/** network.coopsource.agreement.stakeholderTerms — sub-def: governanceRights */
export interface GovernanceRights {
  votingPower?: number;
  boardSeat?: boolean;
  decisionCategories?: string[];
}

/** network.coopsource.agreement.stakeholderTerms — sub-def: exitTerms */
export interface ExitTerms {
  buybackPrice?: string;
  noticePeriodDays?: number;
  conditions?: string;
}

/** network.coopsource.agreement.stakeholderTerms — main record */
export interface AgreementStakeholderTerms {
  $type?: 'network.coopsource.agreement.stakeholderTerms';
  masterAgreementUri: string;
  stakeholderDid: string;
  stakeholderType: 'worker' | 'investor' | 'customer' | 'supplier' | 'community' | 'partner' | (string & {});
  contributions?: TermsContribution[];
  financialTerms?: FinancialTerms;
  ipTerms?: IpTerms;
  governanceRights?: GovernanceRights;
  exitTerms?: ExitTerms;
  createdAt: string;
}

// ============================================================
// network.coopsource.alignment.*
// ============================================================

/** network.coopsource.alignment.interest — sub-def: interestItem */
export interface InterestItem {
  category: string;
  description: string;
  priority: number;
  scope?: 'short-term' | 'medium-term' | 'long-term' | (string & {});
}

/** network.coopsource.alignment.interest — sub-def: contributionItem */
export interface ContributionItem {
  type: 'skill' | 'resource' | 'capital' | 'network' | 'time' | (string & {});
  description: string;
  capacity?: string;
}

/** network.coopsource.alignment.interest — sub-def: constraintItem */
export interface ConstraintItem {
  description: string;
  hardConstraint?: boolean;
}

/** network.coopsource.alignment.interest — sub-def: redLineItem */
export interface RedLineItem {
  description: string;
  reason?: string;
}

/** network.coopsource.alignment.interest — sub-def: workPreferences */
export interface WorkPreferences {
  decisionMaking?: string;
  communication?: string;
  pace?: string;
}

/** network.coopsource.alignment.interest — main record */
export interface AlignmentInterest {
  $type?: 'network.coopsource.alignment.interest';
  projectUri: string;
  interests: InterestItem[];
  contributions?: ContributionItem[];
  constraints?: ConstraintItem[];
  redLines?: RedLineItem[];
  preferences?: WorkPreferences;
  createdAt: string;
  updatedAt?: string;
}

/** network.coopsource.alignment.interestMap — sub-def: alignmentZone */
export interface AlignmentZone {
  participants: string[];
  description: string;
  strength: number;
  interestsInvolved?: string[];
}

/** network.coopsource.alignment.interestMap — sub-def: conflictZone */
export interface ConflictZone {
  stakeholders: string[];
  description: string;
  severity: 'low' | 'medium' | 'high' | (string & {});
  potentialSolutions?: string[];
}

/** network.coopsource.alignment.interestMap — sub-def: aiAnalysis */
export interface AiAnalysis {
  summary?: string;
  recommendations?: string[];
  mediationSuggestions?: string[];
}

/** network.coopsource.alignment.interestMap — main record */
export interface AlignmentInterestMap {
  $type?: 'network.coopsource.alignment.interestMap';
  projectUri: string;
  alignmentZones?: AlignmentZone[];
  conflictZones?: ConflictZone[];
  aiAnalysis?: AiAnalysis;
  createdAt: string;
}

/** network.coopsource.alignment.outcome — sub-def: successCriterion */
export interface SuccessCriterion {
  metric: string;
  target: string;
  timeline?: string;
  ownerDid?: string;
}

/** network.coopsource.alignment.outcome — sub-def: supportEntry */
export interface SupportEntry {
  stakeholderDid: string;
  supportLevel: 'strong' | 'moderate' | 'conditional' | 'neutral' | 'opposed' | (string & {});
  conditions?: string;
}

/** network.coopsource.alignment.outcome — main record */
export interface AlignmentOutcome {
  $type?: 'network.coopsource.alignment.outcome';
  projectUri: string;
  title: string;
  description: string;
  category: 'financial' | 'social' | 'environmental' | 'governance' | 'other' | (string & {});
  successCriteria?: SuccessCriterion[];
  stakeholderSupport?: SupportEntry[];
  status: 'proposed' | 'endorsed' | 'active' | 'achieved' | 'abandoned' | (string & {});
  createdAt: string;
}

/** network.coopsource.alignment.stakeholder — main record */
export interface AlignmentStakeholder {
  $type?: 'network.coopsource.alignment.stakeholder';
  projectUri: string;
  name: string;
  role: 'worker' | 'investor' | 'customer' | 'partner' | 'supplier' | 'community' | 'other' | (string & {});
  stakeholderClass?: string;
  description?: string;
  interestsSummary?: string;
  createdAt: string;
}

// ============================================================
// network.coopsource.connection.*
// ============================================================

/** network.coopsource.connection.binding — sub-def: resourceMetadata */
export interface ResourceMetadata {
  displayName?: string;
  url?: string;
  description?: string;
}

/** network.coopsource.connection.binding — main record */
export interface ConnectionBinding {
  $type?: 'network.coopsource.connection.binding';
  connectionUri: string;
  projectUri: string;
  resourceType: 'github_repo' | 'google_doc' | 'google_sheet' | 'google_drive_folder' | (string & {});
  resourceId: string;
  metadata?: ResourceMetadata;
  createdAt: string;
}

/** network.coopsource.connection.link — sub-def: metadata */
export interface ConnectionMetadata {
  username?: string;
  email?: string;
  scopes?: string[];
}

/** network.coopsource.connection.link — main record */
export interface ConnectionLink {
  $type?: 'network.coopsource.connection.link';
  service: 'github' | 'google' | (string & {});
  status: 'active' | 'revoked' | 'expired' | (string & {});
  metadata?: ConnectionMetadata;
  createdAt: string;
}

/** network.coopsource.connection.sync — main record */
export interface ConnectionSync {
  $type?: 'network.coopsource.connection.sync';
  bindingUri: string;
  eventType: 'push' | 'pull' | 'webhook' | (string & {});
  timestamp: string;
  payload?: Record<string, unknown>;
}

// ============================================================
// network.coopsource.funding.*
// ============================================================

/** network.coopsource.funding.campaign — main record */
export interface FundingCampaign {
  $type?: 'network.coopsource.funding.campaign';
  beneficiaryUri: string;
  title: string;
  description?: string;
  tier: 'network' | 'cooperative' | 'project' | (string & {});
  campaignType: 'rewards' | 'patronage' | 'donation' | 'revenue_share' | (string & {});
  goalAmount: number;
  goalCurrency: string;
  amountRaised?: number;
  backerCount?: number;
  fundingModel: 'all_or_nothing' | 'keep_it_all' | (string & {});
  status: 'draft' | 'active' | 'funded' | 'completed' | 'cancelled' | (string & {});
  startDate?: string;
  endDate?: string;
  metadata?: unknown;
  createdAt: string;
}

/** network.coopsource.funding.pledge — main record */
export interface FundingPledge {
  $type?: 'network.coopsource.funding.pledge';
  campaignUri: string;
  backerDid: string;
  amount: number;
  currency: string;
  paymentStatus: 'pending' | 'completed' | 'failed' | 'refunded' | (string & {});
  metadata?: unknown;
  createdAt: string;
}

// ============================================================
// network.coopsource.governance.*
// ============================================================

/** network.coopsource.governance.delegation — main record */
export interface GovernanceDelegation {
  $type?: 'network.coopsource.governance.delegation';
  projectUri: string;
  delegatorDid: string;
  delegateeDid: string;
  scope: 'project' | 'proposal' | (string & {});
  proposalUri?: string;
  status: 'active' | 'revoked' | (string & {});
  revokedAt?: string;
  createdAt: string;
}

/** network.coopsource.governance.proposal — main record */
export interface GovernanceProposal {
  $type?: 'network.coopsource.governance.proposal';
  cooperativeDid: string;
  title: string;
  body: string;
  proposalType: 'amendment' | 'budget' | 'membership' | 'policy' | 'election' | 'other' | (string & {});
  votingMethod: 'simple_majority' | 'supermajority' | 'consensus' | 'ranked_choice' | (string & {});
  options?: string[];
  quorumRequired?: number;
  quorumBasis?: 'votesCast' | 'totalMembers' | (string & {});
  discussionEndsAt?: string;
  votingEndsAt?: string;
  status: 'draft' | 'discussion' | 'voting' | 'passed' | 'failed' | 'withdrawn' | (string & {});
  createdAt: string;
}

/** network.coopsource.governance.vote — main record */
export interface GovernanceVote {
  $type?: 'network.coopsource.governance.vote';
  proposalUri: string;
  voterDid: string;
  choice: string;
  weight?: number;
  rationale?: string;
  delegatedFrom?: string;
  createdAt: string;
}

// ============================================================
// network.coopsource.org.*
// ============================================================

/** network.coopsource.org.cooperative — main record */
export interface OrgCooperative {
  $type?: 'network.coopsource.org.cooperative';
  name: string;
  description?: string;
  logoUrl?: string;
  website?: string;
  status: 'active' | 'inactive' | 'dissolved' | (string & {});
  createdAt: string;
}

/** network.coopsource.org.memberApproval — main record */
export interface OrgMemberApproval {
  $type?: 'network.coopsource.org.memberApproval';
  member: string;
  roles?: string[];
  createdAt: string;
}

/** network.coopsource.org.membership — main record */
export interface OrgMembership {
  $type?: 'network.coopsource.org.membership';
  cooperative: string;
  createdAt: string;
}

/** network.coopsource.org.project — main record */
export interface OrgProject {
  $type?: 'network.coopsource.org.project';
  name: string;
  description?: string;
  cooperativeUri?: string;
  status: 'active' | 'completed' | 'on-hold' | 'cancelled' | (string & {});
  visibility: 'public' | 'members' | 'private' | (string & {});
  createdAt: string;
}

/** network.coopsource.org.team — main record */
export interface OrgTeam {
  $type?: 'network.coopsource.org.team';
  name: string;
  projectUri: string;
  description?: string;
  purpose?: string;
  decisionMethod?: 'consensus' | 'voting' | 'lead-driven' | (string & {});
  createdAt: string;
}

/** network.coopsource.org.role — main record */
export interface OrgRole {
  $type?: 'network.coopsource.org.role';
  name: string;
  entityUri: string;
  description?: string;
  responsibilities?: string[];
  permissions?: string[];
  termLengthMonths?: number;
  createdAt: string;
}

// ============================================================
// Collection IDs — all lexicon NSID strings
// ============================================================

export const LEXICON_IDS = {
  AgreementAmendment: 'network.coopsource.agreement.amendment',
  AgreementContribution: 'network.coopsource.agreement.contribution',
  AgreementMaster: 'network.coopsource.agreement.master',
  AgreementSignature: 'network.coopsource.agreement.signature',
  AgreementStakeholderTerms: 'network.coopsource.agreement.stakeholderTerms',
  AlignmentInterest: 'network.coopsource.alignment.interest',
  AlignmentInterestMap: 'network.coopsource.alignment.interestMap',
  AlignmentOutcome: 'network.coopsource.alignment.outcome',
  AlignmentStakeholder: 'network.coopsource.alignment.stakeholder',
  ConnectionBinding: 'network.coopsource.connection.binding',
  ConnectionLink: 'network.coopsource.connection.link',
  ConnectionSync: 'network.coopsource.connection.sync',
  FundingCampaign: 'network.coopsource.funding.campaign',
  FundingPledge: 'network.coopsource.funding.pledge',
  GovernanceDelegation: 'network.coopsource.governance.delegation',
  GovernanceProposal: 'network.coopsource.governance.proposal',
  GovernanceVote: 'network.coopsource.governance.vote',
  OrgCooperative: 'network.coopsource.org.cooperative',
  OrgMemberApproval: 'network.coopsource.org.memberApproval',
  OrgMembership: 'network.coopsource.org.membership',
  OrgProject: 'network.coopsource.org.project',
  OrgRole: 'network.coopsource.org.role',
  OrgTeam: 'network.coopsource.org.team',
} as const;

export type LexiconId = (typeof LEXICON_IDS)[keyof typeof LEXICON_IDS];

/** Map from lexicon NSID to its record type */
export interface LexiconRecordMap {
  [LEXICON_IDS.AgreementAmendment]: AgreementAmendment;
  [LEXICON_IDS.AgreementContribution]: AgreementContribution;
  [LEXICON_IDS.AgreementMaster]: AgreementMaster;
  [LEXICON_IDS.AgreementSignature]: AgreementSignature;
  [LEXICON_IDS.AgreementStakeholderTerms]: AgreementStakeholderTerms;
  [LEXICON_IDS.AlignmentInterest]: AlignmentInterest;
  [LEXICON_IDS.AlignmentInterestMap]: AlignmentInterestMap;
  [LEXICON_IDS.AlignmentOutcome]: AlignmentOutcome;
  [LEXICON_IDS.AlignmentStakeholder]: AlignmentStakeholder;
  [LEXICON_IDS.ConnectionBinding]: ConnectionBinding;
  [LEXICON_IDS.ConnectionLink]: ConnectionLink;
  [LEXICON_IDS.ConnectionSync]: ConnectionSync;
  [LEXICON_IDS.FundingCampaign]: FundingCampaign;
  [LEXICON_IDS.FundingPledge]: FundingPledge;
  [LEXICON_IDS.GovernanceDelegation]: GovernanceDelegation;
  [LEXICON_IDS.GovernanceProposal]: GovernanceProposal;
  [LEXICON_IDS.GovernanceVote]: GovernanceVote;
  [LEXICON_IDS.OrgCooperative]: OrgCooperative;
  [LEXICON_IDS.OrgMemberApproval]: OrgMemberApproval;
  [LEXICON_IDS.OrgMembership]: OrgMembership;
  [LEXICON_IDS.OrgProject]: OrgProject;
  [LEXICON_IDS.OrgRole]: OrgRole;
  [LEXICON_IDS.OrgTeam]: OrgTeam;
}
