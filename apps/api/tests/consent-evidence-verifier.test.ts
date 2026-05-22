import { describe, expect, it } from 'vitest';
import type { CID, DID } from '@coopsource/common';
import {
  ConsentEvidenceVerifier,
  MEMBER_CONSENT_COLLECTION,
  type PublicRepoRecordResolverPort,
} from '../src/services/consent-evidence-verifier.js';

const authorDid = 'did:plc:alice' as DID;
const cooperativeDid = 'did:plc:coop' as DID;
const uri = `at://${authorDid}/${MEMBER_CONSENT_COLLECTION}/r1`;
const cid = 'bafyconsent' as CID;
const now = new Date('2026-01-01T00:00:00Z');

describe('ConsentEvidenceVerifier', () => {
  it('accepts matching member consent evidence', async () => {
    const verifier = makeVerifier();
    await expect(verify(verifier)).resolves.toMatchObject({
      ok: true,
      uri,
      cid,
      record: { cooperative: cooperativeDid, consentType: 'joinRequest' },
    });
  });

  it('rejects mismatched URI authority, collection, CID, cooperative, and consentType', async () => {
    await expect(verify(makeVerifier(), { expectedAuthorDid: 'did:plc:bob' as DID }))
      .resolves.toMatchObject({ ok: false, reason: expect.stringContaining('authority DID') });

    await expect(verify(makeVerifier(), { consentRecordUri: `at://${authorDid}/network.coopsource.org.cooperative/r1` }))
      .resolves.toMatchObject({ ok: false, reason: expect.stringContaining('memberConsent') });

    await expect(verify(makeVerifier(), { consentRecordCid: 'bafywrong' }))
      .resolves.toMatchObject({ ok: false, reason: expect.stringContaining('CID') });

    await expect(verify(makeVerifier({ cooperative: 'did:plc:other' })))
      .resolves.toMatchObject({ ok: false, reason: expect.stringContaining('cooperative') });

    await expect(verify(makeVerifier({ consentType: 'bootstrapOwner' })))
      .resolves.toMatchObject({ ok: false, reason: expect.stringContaining('consentType') });
  });

  it('rejects implausible createdAt values', async () => {
    await expect(verify(makeVerifier({ createdAt: '2027-01-01T00:00:00Z' })))
      .resolves.toMatchObject({ ok: false, reason: expect.stringContaining('createdAt') });
  });
});

function makeVerifier(
  recordOverrides: Record<string, unknown> = {},
): ConsentEvidenceVerifier {
  const resolver: PublicRepoRecordResolverPort = {
    async resolveRecord() {
      return {
        uri,
        cid,
        record: {
          $type: MEMBER_CONSENT_COLLECTION,
          cooperative: cooperativeDid,
          consentType: 'joinRequest',
          createdAt: now.toISOString(),
          ...recordOverrides,
        },
      };
    },
  };
  return new ConsentEvidenceVerifier(resolver, { now: () => now });
}

function verify(
  verifier: ConsentEvidenceVerifier,
  overrides: Partial<Parameters<ConsentEvidenceVerifier['verify']>[0]> = {},
) {
  return verifier.verify({
    expectedAuthorDid: authorDid,
    cooperativeDid,
    consentRecordUri: uri,
    consentRecordCid: cid,
    allowedConsentTypes: ['joinRequest'],
    ...overrides,
  });
}
