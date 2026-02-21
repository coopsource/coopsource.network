/** ATProto lexicon namespace for all Co-op Source records */
export const LEXICON_NAMESPACE = 'network.coopsource';

/** Current API version */
export const API_VERSION = '0.1.0';

/** ATProto collection names for Co-op Source record types */
export const COLLECTIONS = {
  COOPERATIVE: `${LEXICON_NAMESPACE}.org.cooperative`,
  PROJECT: `${LEXICON_NAMESPACE}.org.project`,
  MEMBERSHIP: `${LEXICON_NAMESPACE}.org.membership`,
  INTEREST: `${LEXICON_NAMESPACE}.alignment.interest`,
  INTEREST_MAP: `${LEXICON_NAMESPACE}.alignment.interestMap`,
  OUTCOME: `${LEXICON_NAMESPACE}.alignment.outcome`,
  MASTER_AGREEMENT: `${LEXICON_NAMESPACE}.agreement.master`,
  STAKEHOLDER_TERMS: `${LEXICON_NAMESPACE}.agreement.stakeholderTerms`,
  SIGNATURE: `${LEXICON_NAMESPACE}.agreement.signature`,
  AMENDMENT: `${LEXICON_NAMESPACE}.agreement.amendment`,
  CONNECTION_LINK: `${LEXICON_NAMESPACE}.connection.link`,
  CONNECTION_BINDING: `${LEXICON_NAMESPACE}.connection.binding`,
  CONNECTION_SYNC: `${LEXICON_NAMESPACE}.connection.sync`,
  PROPOSAL: `${LEXICON_NAMESPACE}.governance.proposal`,
  VOTE: `${LEXICON_NAMESPACE}.governance.vote`,
  DELEGATION: `${LEXICON_NAMESPACE}.governance.delegation`,
  FUNDING_CAMPAIGN: `${LEXICON_NAMESPACE}.funding.campaign`,
  FUNDING_PLEDGE: `${LEXICON_NAMESPACE}.funding.pledge`,
  AUTOMATION_WORKFLOW: `${LEXICON_NAMESPACE}.automation.workflow`,
  AUTOMATION_TRIGGER: `${LEXICON_NAMESPACE}.automation.trigger`,
} as const;
