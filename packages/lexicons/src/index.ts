/**
 * @coopsource/lexicons — ATProto lexicon schemas and generated TypeScript types.
 *
 * Exports:
 * - Generated lexicon objects (for runtime schema access)
 * - TypeScript type definitions for all record types
 * - Runtime validator using @atproto/lexicon
 */

// Generated lexicon schema objects
export { lexicons as lexiconSchemas } from './generated/lexicons.js';

// TypeScript types for all record types
export type {
  // Agreement types
  AgreementAmendment,
  AmendmentChanges,
  FieldChange,
  AgreementContribution,
  AgreementMaster,
  AgreementSignature,
  AgreementStakeholderTerms,
  GovernanceFramework,
  SignatureData,
  TermsContribution,
  FinancialTerms,
  IpTerms,
  GovernanceRights,
  ExitTerms,

  // Alignment types
  AlignmentInterest,
  AlignmentInterestMap,
  AlignmentOutcome,
  AlignmentStakeholder,
  InterestItem,
  ContributionItem,
  ConstraintItem,
  RedLineItem,
  WorkPreferences,
  AlignmentZone,
  ConflictZone,
  AiAnalysis,
  SuccessCriterion,
  SupportEntry,

  // Connection types
  ConnectionBinding,
  ConnectionLink,
  ConnectionSync,
  ConnectionMetadata,
  ResourceMetadata,

  // Funding types
  FundingCampaign,
  FundingPledge,

  // Governance types
  GovernanceDelegation,
  GovernanceProposal,
  GovernanceProposalAnchor,
  GovernanceVote,

  // Org types
  OrgCooperative,
  OrgMemberConsent,
  OrgProject,
  OrgTeam,
  OrgRole,

  // Utility types
  LexiconId,
  LexiconRecordMap,
} from './generated/types.js';

// Lexicon ID constants
export { LEXICON_IDS } from './generated/types.js';

// Proposal 0016 draft space type declarations. These are intentionally
// exported outside the generated record-schema pipeline until atproto lex tooling
// accepts Lexicon definitions with `"type": "space"`.
export {
  CSN_MEMBER_CLASS_SPACE_TYPE,
  CSN_MEMBERS_SPACE_TYPE,
  CSN_ROLE_SPACE_TYPE,
  CSN_SPACE_TYPE_DECLARATIONS,
} from './space-types.js';
export type { SpaceTypeDeclaration } from './space-types.js';
export {
  formatSpaceReadScope,
  formatSpaceReadSelfScope,
  formatSpaceScope,
} from './space-scopes.js';
export type {
  SpaceScopeAction,
  SpaceScopeManageAction,
  SpaceScopeOptions,
} from './space-scopes.js';
export {
  CSN_SPACE_PLACEMENT_MATRIX,
  findCsnSpacePlacement,
  formatPlacementAppViewReadScope,
  formatPlacementMemberSelfReadScope,
} from './space-placement.js';
export type {
  CsnSpacePlacement,
  CsnSpacePlacementKind,
  CsnSpaceSkeyPattern,
  CsnSpaceTypeId,
  PlacementScopeOptions,
} from './space-placement.js';
export {
  formatCsnAppViewReadScopePlan,
  formatCsnMemberSelfReadScopePlan,
} from './space-oauth-plan.js';
export type {
  CsnScopePlanSkeyMode,
  CsnSpaceScopePlanOptions,
} from './space-oauth-plan.js';

// Runtime validation
export {
  validateRecord,
  isValidRecord,
  lexicons,
  LexiconValidationError,
} from './validator.js';
