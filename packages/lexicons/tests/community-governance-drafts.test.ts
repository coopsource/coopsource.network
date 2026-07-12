import { readFile, readdir } from 'node:fs/promises';
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
    proposalUri: PROPOSAL_URI,
    position: 'facilitator',
    candidates: [{ id: 'candidate-a', label: 'Candidate A' }],
    createdAt: CREATED_AT,
  },
  'community.lexicon.governance.logHead': {
    authorityDid: AUTHORITY_DID,
    spaceKey: 'members/main',
    version: 1,
    treeSize: 1,
    rootHash: new Uint8Array([1, 2, 3]),
    hashAlgorithm: 'sha256',
    signature: new Uint8Array([4, 5, 6]),
    signatureAlgorithm: 'ed25519',
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
  const files = (await readdir(directory))
    .filter((file) => file.endsWith('.json'))
    .sort();

  return Promise.all(
    files.map(async (file) =>
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

  it('requires elections to target proposals and log heads to use typed bytes', async () => {
    const lexicons = new Lexicons(await loadDrafts());
    const election = SAMPLE_RECORDS['community.lexicon.governance.election'];
    const logHead = SAMPLE_RECORDS['community.lexicon.governance.logHead'];

    expect(
      lexicons.validate('community.lexicon.governance.election', {
        ...(election as Record<string, unknown>),
        proposalUri: undefined,
      }).success,
    ).toBe(false);
    expect(
      lexicons.validate('community.lexicon.governance.logHead', {
        ...(logHead as Record<string, unknown>),
        signature: 'not-bytes',
      }).success,
    ).toBe(false);
  });
});
