import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { lexiconSchemas, LEXICON_IDS } from '../src/index.js';

const GENERATED_FILE = fileURLToPath(new URL('../src/generated/lexicons.ts', import.meta.url));

describe('generated module hygiene', () => {
  // Regression guard: `lex-cli gen-ts-obj` prints validation diagnostics to stdout,
  // interleaved with the module it generates. The old `lex:generate` piped stdout
  // straight into this file, so any failing lexicon injected English prose into a
  // .ts file. See scripts/generate-lexicons.mjs.
  it('contains no lex-cli diagnostic prose', () => {
    const source = readFileSync(GENERATED_FILE, 'utf8');
    expect(source).not.toMatch(/Issues at |Invalid lexicon |Invalid discriminator/);
    expect(source.startsWith('export const lexicons = [')).toBe(true);
  });

  it('is pure data after the export prefix', () => {
    const source = readFileSync(GENERATED_FILE, 'utf8');
    const payload = source.slice('export const lexicons = '.length).trim().replace(/;$/, '');
    expect(() => JSON.parse(payload)).not.toThrow();
  });
});

describe('lexicon schemas', () => {
  it('should export all 45 valid lexicon schemas', () => {
    expect(lexiconSchemas).toHaveLength(45);
  });

  it('should contain all expected lexicon IDs', () => {
    const ids = lexiconSchemas.map((l: { id: string }) => l.id).sort();
    expect(ids).toEqual([
      'network.coopsource.admin.complianceItem',
      'network.coopsource.admin.fiscalPeriod',
      'network.coopsource.admin.getOfficers',
      'network.coopsource.admin.memberNotice',
      'network.coopsource.admin.officer',
      'network.coopsource.agreement.amendment',
      'network.coopsource.agreement.contribution',
      'network.coopsource.agreement.master',
      'network.coopsource.agreement.signature',
      'network.coopsource.agreement.stakeholderTerms',
      'network.coopsource.alignment.interest',
      'network.coopsource.alignment.interestMap',
      'network.coopsource.alignment.outcome',
      'network.coopsource.alignment.stakeholder',
      'network.coopsource.commerce.collaborativeProject',
      'network.coopsource.commerce.intercoopAgreement',
      'network.coopsource.commerce.listing',
      'network.coopsource.commerce.need',
      'network.coopsource.commerce.resource',
      'network.coopsource.connection.binding',
      'network.coopsource.connection.link',
      'network.coopsource.connection.sync',
      'network.coopsource.finance.expenseApproval',
      'network.coopsource.funding.campaign',
      'network.coopsource.funding.pledge',
      'network.coopsource.governance.delegation',
      'network.coopsource.governance.getProposal',
      'network.coopsource.governance.getVoteEligibility',
      'network.coopsource.governance.listProposalAnchors',
      'network.coopsource.governance.listProposals',
      'network.coopsource.governance.proposalAnchor',
      'network.coopsource.legal.document',
      'network.coopsource.legal.meetingRecord',
      'network.coopsource.ops.schedule',
      'network.coopsource.ops.task',
      'network.coopsource.ops.taskAcceptance',
      'network.coopsource.ops.timeEntry',
      'network.coopsource.org.cooperative',
      'network.coopsource.org.getCooperative',
      'network.coopsource.org.getMembership',
      'network.coopsource.org.listMembers',
      'network.coopsource.org.memberConsent',
      'network.coopsource.org.project',
      'network.coopsource.org.role',
      'network.coopsource.org.team',
    ]);
  });

  it('LEXICON_IDS should map to all 23 collections', () => {
    const values = Object.values(LEXICON_IDS).sort();
    expect(values).toHaveLength(23);
    expect(values).toContain('network.coopsource.org.cooperative');
    expect(values).toContain('network.coopsource.org.memberConsent');
    expect(values).toContain('network.coopsource.alignment.interest');
    expect(values).toContain('network.coopsource.agreement.master');
    expect(values).toContain('network.coopsource.agreement.amendment');
    expect(values).toContain('network.coopsource.governance.proposal');
    expect(values).toContain('network.coopsource.governance.proposalAnchor');
    expect(values).toContain('network.coopsource.governance.vote');
    expect(values).toContain('network.coopsource.governance.delegation');
    expect(values).toContain('network.coopsource.connection.link');
    expect(values).toContain('network.coopsource.connection.binding');
    expect(values).toContain('network.coopsource.connection.sync');
    expect(values).toContain('network.coopsource.funding.campaign');
    expect(values).toContain('network.coopsource.funding.pledge');
  });
});
