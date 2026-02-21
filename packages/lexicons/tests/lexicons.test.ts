import { describe, it, expect } from 'vitest';
import { lexiconSchemas, LEXICON_IDS } from '../src/index.js';

describe('lexicon schemas', () => {
  it('should export all 13 lexicon schemas', () => {
    expect(lexiconSchemas).toHaveLength(13);
  });

  it('should contain all expected lexicon IDs', () => {
    const ids = lexiconSchemas.map((l: { id: string }) => l.id).sort();
    expect(ids).toEqual([
      'network.coopsource.agreement.contribution',
      'network.coopsource.agreement.master',
      'network.coopsource.agreement.signature',
      'network.coopsource.agreement.stakeholderTerms',
      'network.coopsource.alignment.interest',
      'network.coopsource.alignment.interestMap',
      'network.coopsource.alignment.outcome',
      'network.coopsource.alignment.stakeholder',
      'network.coopsource.org.cooperative',
      'network.coopsource.org.membership',
      'network.coopsource.org.project',
      'network.coopsource.org.role',
      'network.coopsource.org.team',
    ]);
  });

  it('LEXICON_IDS should map to all 13 collections', () => {
    const values = Object.values(LEXICON_IDS).sort();
    expect(values).toHaveLength(13);
    expect(values).toContain('network.coopsource.org.cooperative');
    expect(values).toContain('network.coopsource.alignment.interest');
    expect(values).toContain('network.coopsource.agreement.master');
  });
});
