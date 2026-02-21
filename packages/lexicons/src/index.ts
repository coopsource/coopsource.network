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

  // Org types
  OrgCooperative,
  OrgProject,
  OrgTeam,
  OrgMembership,
  OrgRole,

  // Utility types
  LexiconId,
  LexiconRecordMap,
} from './generated/types.js';

// Lexicon ID constants
export { LEXICON_IDS } from './generated/types.js';

// Runtime validation
export {
  validateRecord,
  isValidRecord,
  lexicons,
  LexiconValidationError,
} from './validator.js';
