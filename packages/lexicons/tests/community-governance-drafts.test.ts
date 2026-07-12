import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Lexicons, type LexiconDoc } from '@atproto/lexicon';
import { describe, expect, it } from 'vitest';
import { lexiconSchemas } from '../src/index.js';

const DRAFT_IDS = [
  'community.lexicon.governance.deliberation',
  'community.lexicon.governance.election',
  'community.lexicon.governance.logHead',
  'community.lexicon.governance.proposal',
  'community.lexicon.governance.summary',
  'community.lexicon.governance.vote',
] as const;

const DRAFT_FILES = [
  'deliberation.json',
  'election.json',
  'logHead.json',
  'proposal.json',
  'summary.json',
  'vote.json',
] as const;

const AUTHORITY_DID = 'did:plc:abcdefghijklmnopqrstuvwx';
const PROPOSAL_URI = `at://${AUTHORITY_DID}/community.lexicon.governance.proposal/3kexample`;
const CREATED_AT = '2026-07-12T00:00:00.000Z';

const SAMPLE_RECORDS: Readonly<Record<(typeof DRAFT_IDS)[number], unknown>> = {
  'community.lexicon.governance.deliberation': {
    proposalUri: PROPOSAL_URI,
    authorDid: AUTHORITY_DID,
    body: 'Consider the operational impact before voting.',
    createdAt: CREATED_AT,
  },
  'community.lexicon.governance.election': {
    authorityDid: AUTHORITY_DID,
    spaceKey: 'members/main',
    proposerDid: AUTHORITY_DID,
    title: 'Select a meeting facilitator',
    position: 'facilitator',
    candidates: [{ id: 'candidate-a', label: 'Candidate A' }],
    status: 'open',
    createdAt: CREATED_AT,
  },
  'community.lexicon.governance.logHead': {
    authorityDid: AUTHORITY_DID,
    spaceKey: 'members/main',
    treeSize: 1,
    rootHash: 'zExampleRootHash',
    hashAlgorithm: 'sha256',
    signature: 'zExampleSignature',
    signedAt: CREATED_AT,
  },
  'community.lexicon.governance.proposal': {
    authorityDid: AUTHORITY_DID,
    spaceKey: 'members/main',
    proposerDid: AUTHORITY_DID,
    title: 'Adopt the operating policy',
    summary: 'A generic proposal with application-defined policy details.',
    proposalType: 'policy',
    votingMethod: 'binary',
    status: 'open',
    createdAt: CREATED_AT,
  },
  'community.lexicon.governance.summary': {
    authorityDid: AUTHORITY_DID,
    spaceKey: 'members/main',
    openProposalCount: 1,
    resolvedProposalCount: 2,
    memberCount: 12,
    tallies: [{ proposalKey: 'proposal-1', choice: 'yes', count: 8 }],
    generatedAt: CREATED_AT,
  },
  'community.lexicon.governance.vote': {
    proposalUri: PROPOSAL_URI,
    voterDid: AUTHORITY_DID,
    choice: 'yes',
    weight: { numerator: 1, denominator: 1 },
    createdAt: CREATED_AT,
  },
};

async function loadDrafts(): Promise<LexiconDoc[]> {
  const directory = fileURLToPath(
    new URL('../community-draft/governance/', import.meta.url),
  );

  return Promise.all(
    DRAFT_FILES.map(async (file) =>
      JSON.parse(await readFile(`${directory}${file}`, 'utf8')),
    ),
  ) as Promise<LexiconDoc[]>;
}

describe('community governance draft lexicons', () => {
  it('load as valid, uniquely named lexicon documents', async () => {
    const drafts = await loadDrafts();

    expect(drafts.map((draft) => draft.id).sort()).toEqual(DRAFT_IDS);
    expect(() => new Lexicons(drafts)).not.toThrow();
  });

  it('remain outside the canonical generated runtime schema set', async () => {
    const canonicalIds = new Set(lexiconSchemas.map((schema) => schema.id));

    for (const draft of await loadDrafts()) {
      expect(canonicalIds.has(draft.id)).toBe(false);
    }
  });

  it('validate representative generic governance records', async () => {
    const lexicons = new Lexicons(await loadDrafts());

    for (const id of DRAFT_IDS) {
      const result = lexicons.validate(id, SAMPLE_RECORDS[id]);
      expect(result.success, `${id}: ${String(result.error)}`).toBe(true);
    }
  });
});
