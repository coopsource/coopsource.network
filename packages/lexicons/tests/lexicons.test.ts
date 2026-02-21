import { describe, it, expect } from 'vitest';
import { lexiconSchemas, LEXICON_IDS } from '../src/index.js';

describe('lexicon schemas', () => {
  it('should export all 23 lexicon schemas', () => {
    expect(lexiconSchemas).toHaveLength(23);
  });

  it('should contain all expected lexicon IDs', () => {
    const ids = lexiconSchemas.map((l: { id: string }) => l.id).sort();
    expect(ids).toEqual([
      'network.coopsource.agreement.amendment',
      'network.coopsource.agreement.contribution',
      'network.coopsource.agreement.master',
      'network.coopsource.agreement.signature',
      'network.coopsource.agreement.stakeholderTerms',
      'network.coopsource.alignment.interest',
      'network.coopsource.alignment.interestMap',
      'network.coopsource.alignment.outcome',
      'network.coopsource.alignment.stakeholder',
      'network.coopsource.connection.binding',
      'network.coopsource.connection.link',
      'network.coopsource.connection.sync',
      'network.coopsource.funding.campaign',
      'network.coopsource.funding.pledge',
      'network.coopsource.governance.delegation',
      'network.coopsource.governance.proposal',
      'network.coopsource.governance.vote',
      'network.coopsource.org.cooperative',
      'network.coopsource.org.memberApproval',
      'network.coopsource.org.membership',
      'network.coopsource.org.project',
      'network.coopsource.org.role',
      'network.coopsource.org.team',
    ]);
  });

  it('LEXICON_IDS should map to all 23 collections', () => {
    const values = Object.values(LEXICON_IDS).sort();
    expect(values).toHaveLength(23);
    expect(values).toContain('network.coopsource.org.cooperative');
    expect(values).toContain('network.coopsource.org.memberApproval');
    expect(values).toContain('network.coopsource.org.membership');
    expect(values).toContain('network.coopsource.alignment.interest');
    expect(values).toContain('network.coopsource.agreement.master');
    expect(values).toContain('network.coopsource.agreement.amendment');
    expect(values).toContain('network.coopsource.governance.proposal');
    expect(values).toContain('network.coopsource.governance.vote');
    expect(values).toContain('network.coopsource.governance.delegation');
    expect(values).toContain('network.coopsource.connection.link');
    expect(values).toContain('network.coopsource.connection.binding');
    expect(values).toContain('network.coopsource.connection.sync');
    expect(values).toContain('network.coopsource.funding.campaign');
    expect(values).toContain('network.coopsource.funding.pledge');
  });
});
