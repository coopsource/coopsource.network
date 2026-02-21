import { describe, it, expect } from 'vitest';
import {
  validateRecord,
  isValidRecord,
  LexiconValidationError,
  LEXICON_IDS,
} from '../src/index.js';

describe('validateRecord', () => {
  describe('org.cooperative', () => {
    const validCoop = {
      $type: 'network.coopsource.org.cooperative',
      name: 'Test Co-op',
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    it('should validate a valid cooperative record', () => {
      const result = validateRecord(LEXICON_IDS.OrgCooperative, validCoop);
      expect(result.name).toBe('Test Co-op');
      expect(result.status).toBe('active');
    });

    it('should reject a cooperative missing required fields', () => {
      expect(() =>
        validateRecord(LEXICON_IDS.OrgCooperative, { name: 'Missing status' }),
      ).toThrow(LexiconValidationError);
    });

    it('should accept optional fields', () => {
      const coopWithOptionals = {
        ...validCoop,
        description: 'A great co-op',
        website: 'https://example.com',
      };
      const result = validateRecord(LEXICON_IDS.OrgCooperative, coopWithOptionals);
      expect(result.description).toBe('A great co-op');
    });
  });

  describe('org.project', () => {
    it('should validate a valid project record', () => {
      const project = {
        $type: 'network.coopsource.org.project',
        name: 'Test Project',
        status: 'active',
        visibility: 'public',
        createdAt: new Date().toISOString(),
      };
      const result = validateRecord(LEXICON_IDS.OrgProject, project);
      expect(result.name).toBe('Test Project');
    });

    it('should reject a project with missing visibility', () => {
      expect(() =>
        validateRecord(LEXICON_IDS.OrgProject, {
          name: 'Test',
          status: 'active',
          createdAt: new Date().toISOString(),
        }),
      ).toThrow(LexiconValidationError);
    });
  });

  describe('org.membership', () => {
    it('should validate a valid membership record', () => {
      const membership = {
        $type: 'network.coopsource.org.membership',
        cooperative: 'did:plc:abc123',
        createdAt: new Date().toISOString(),
      };
      const result = validateRecord(LEXICON_IDS.OrgMembership, membership);
      expect(result.cooperative).toBe('did:plc:abc123');
    });
  });

  describe('org.memberApproval', () => {
    it('should validate a valid member approval record', () => {
      const approval = {
        $type: 'network.coopsource.org.memberApproval',
        member: 'did:plc:member1',
        roles: ['admin', 'member'],
        createdAt: new Date().toISOString(),
      };
      const result = validateRecord(LEXICON_IDS.OrgMemberApproval, approval);
      expect(result.member).toBe('did:plc:member1');
      expect(result.roles).toEqual(['admin', 'member']);
    });

    it('should validate a member approval without roles', () => {
      const approval = {
        $type: 'network.coopsource.org.memberApproval',
        member: 'did:plc:member2',
        createdAt: new Date().toISOString(),
      };
      const result = validateRecord(LEXICON_IDS.OrgMemberApproval, approval);
      expect(result.member).toBe('did:plc:member2');
    });
  });

  describe('org.team', () => {
    it('should validate a valid team record', () => {
      const team = {
        $type: 'network.coopsource.org.team',
        name: 'Engineering',
        projectUri: 'at://did:plc:abc123/network.coopsource.org.project/tid1',
        createdAt: new Date().toISOString(),
      };
      const result = validateRecord(LEXICON_IDS.OrgTeam, team);
      expect(result.name).toBe('Engineering');
    });
  });

  describe('org.role', () => {
    it('should validate a valid role record', () => {
      const role = {
        $type: 'network.coopsource.org.role',
        name: 'Coordinator',
        entityUri: 'at://did:plc:abc123/network.coopsource.org.cooperative/tid1',
        responsibilities: ['Schedule meetings', 'Report progress'],
        createdAt: new Date().toISOString(),
      };
      const result = validateRecord(LEXICON_IDS.OrgRole, role);
      expect(result.responsibilities).toHaveLength(2);
    });
  });

  describe('alignment.stakeholder', () => {
    it('should validate a valid stakeholder record', () => {
      const stakeholder = {
        $type: 'network.coopsource.alignment.stakeholder',
        projectUri: 'at://did:plc:abc123/network.coopsource.org.project/tid1',
        name: 'Alice',
        role: 'worker',
        createdAt: new Date().toISOString(),
      };
      const result = validateRecord(LEXICON_IDS.AlignmentStakeholder, stakeholder);
      expect(result.name).toBe('Alice');
    });
  });

  describe('alignment.interest', () => {
    it('should validate a valid interest record', () => {
      const interest = {
        $type: 'network.coopsource.alignment.interest',
        projectUri: 'at://did:plc:abc123/network.coopsource.org.project/tid1',
        interests: [
          { category: 'compensation', description: 'Fair pay', priority: 5 },
        ],
        createdAt: new Date().toISOString(),
      };
      const result = validateRecord(LEXICON_IDS.AlignmentInterest, interest);
      expect(result.interests).toHaveLength(1);
      expect(result.interests[0].priority).toBe(5);
    });

    it('should reject interest with empty interests array', () => {
      expect(() =>
        validateRecord(LEXICON_IDS.AlignmentInterest, {
          projectUri: 'at://did:plc:abc123/network.coopsource.org.project/tid1',
          createdAt: new Date().toISOString(),
        }),
      ).toThrow(LexiconValidationError);
    });
  });

  describe('alignment.interestMap', () => {
    it('should validate a valid interest map record', () => {
      const map = {
        $type: 'network.coopsource.alignment.interestMap',
        projectUri: 'at://did:plc:abc123/network.coopsource.org.project/tid1',
        alignmentZones: [
          {
            participants: ['did:plc:user1', 'did:plc:user2'],
            description: 'Both want fair compensation',
            strength: 80,
          },
        ],
        createdAt: new Date().toISOString(),
      };
      const result = validateRecord(LEXICON_IDS.AlignmentInterestMap, map);
      expect(result.alignmentZones).toHaveLength(1);
    });
  });

  describe('alignment.outcome', () => {
    it('should validate a valid outcome record', () => {
      const outcome = {
        $type: 'network.coopsource.alignment.outcome',
        projectUri: 'at://did:plc:abc123/network.coopsource.org.project/tid1',
        title: 'Revenue Target',
        description: 'Reach $1M ARR',
        category: 'financial',
        status: 'active',
        createdAt: new Date().toISOString(),
      };
      const result = validateRecord(LEXICON_IDS.AlignmentOutcome, outcome);
      expect(result.title).toBe('Revenue Target');
    });
  });

  describe('agreement.master', () => {
    it('should validate a valid master agreement record', () => {
      const agreement = {
        $type: 'network.coopsource.agreement.master',
        projectUri: 'at://did:plc:abc123/network.coopsource.org.project/tid1',
        title: 'Operating Agreement',
        version: 1,
        status: 'draft',
        createdAt: new Date().toISOString(),
      };
      const result = validateRecord(LEXICON_IDS.AgreementMaster, agreement);
      expect(result.title).toBe('Operating Agreement');
      expect(result.version).toBe(1);
    });

    it('should accept governance framework sub-object', () => {
      const agreement = {
        $type: 'network.coopsource.agreement.master',
        projectUri: 'at://did:plc:abc123/network.coopsource.org.project/tid1',
        title: 'Operating Agreement',
        version: 1,
        status: 'active',
        governanceFramework: {
          decisionMethod: 'consensus',
          quorum: 67,
          votingThreshold: 51,
        },
        createdAt: new Date().toISOString(),
      };
      const result = validateRecord(LEXICON_IDS.AgreementMaster, agreement);
      expect(result.governanceFramework?.quorum).toBe(67);
    });
  });

  describe('agreement.stakeholderTerms', () => {
    it('should validate a valid stakeholder terms record', () => {
      const terms = {
        $type: 'network.coopsource.agreement.stakeholderTerms',
        masterAgreementUri: 'at://did:plc:abc123/network.coopsource.agreement.master/tid1',
        stakeholderDid: 'did:plc:member1',
        stakeholderType: 'worker',
        financialTerms: {
          compensationType: 'salary',
          compensationAmount: 7500000,
          currency: 'USD',
          profitShare: 10,
        },
        createdAt: new Date().toISOString(),
      };
      const result = validateRecord(LEXICON_IDS.AgreementStakeholderTerms, terms);
      expect(result.financialTerms?.profitShare).toBe(10);
    });
  });

  describe('agreement.signature', () => {
    it('should validate a valid signature record', () => {
      const signature = {
        $type: 'network.coopsource.agreement.signature',
        agreementUri: 'at://did:plc:abc123/network.coopsource.agreement.master/tid1',
        signerDid: 'did:plc:signer1',
        signatureType: 'digital',
        signedAt: new Date().toISOString(),
      };
      const result = validateRecord(LEXICON_IDS.AgreementSignature, signature);
      expect(result.signerDid).toBe('did:plc:signer1');
    });
  });

  describe('agreement.contribution', () => {
    it('should validate a valid contribution record', () => {
      const contribution = {
        $type: 'network.coopsource.agreement.contribution',
        stakeholderTermsUri: 'at://did:plc:abc123/network.coopsource.agreement.stakeholderTerms/tid1',
        contributionType: 'labor',
        description: '40 hours of development work',
        status: 'fulfilled',
        createdAt: new Date().toISOString(),
      };
      const result = validateRecord(LEXICON_IDS.AgreementContribution, contribution);
      expect(result.contributionType).toBe('labor');
    });
  });
});

describe('isValidRecord', () => {
  it('should return true for valid records', () => {
    const coop = {
      $type: 'network.coopsource.org.cooperative',
      name: 'Valid Co-op',
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    expect(isValidRecord(LEXICON_IDS.OrgCooperative, coop)).toBe(true);
  });

  it('should return false for invalid records', () => {
    expect(isValidRecord(LEXICON_IDS.OrgCooperative, {})).toBe(false);
  });

  it('should return false for non-object values', () => {
    expect(isValidRecord(LEXICON_IDS.OrgCooperative, 'not an object')).toBe(false);
  });
});

describe('LexiconValidationError', () => {
  it('should include collection name in error message', () => {
    try {
      validateRecord(LEXICON_IDS.OrgCooperative, {});
    } catch (error) {
      expect(error).toBeInstanceOf(LexiconValidationError);
      expect((error as LexiconValidationError).message).toContain(
        'network.coopsource.org.cooperative',
      );
      expect((error as LexiconValidationError).collection).toBe(
        'network.coopsource.org.cooperative',
      );
    }
  });
});
