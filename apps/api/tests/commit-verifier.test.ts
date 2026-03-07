import { describe, it, expect, vi } from 'vitest';
import * as crypto from 'node:crypto';
import { verifyCommitSignature } from '../src/appview/commit-verifier.js';
import type { DidDocument } from '@coopsource/federation';
import type { DID } from '@coopsource/common';

// Generate a real P-256 key pair for testing
async function generateTestKeyPair() {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  return keyPair;
}

async function exportPublicKeyJwk(key: CryptoKey): Promise<Record<string, unknown>> {
  return (await crypto.subtle.exportKey('jwk', key)) as Record<string, unknown>;
}

async function signData(privateKey: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    data,
  );
  return new Uint8Array(sig);
}

function makeDidDoc(did: DID, publicKeyJwk: Record<string, unknown>): DidDocument {
  return {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: did,
    verificationMethod: [
      {
        id: `${did}#atproto`,
        type: 'EcdsaSecp256r1VerificationKey2019',
        controller: did,
        publicKeyJwk,
      },
    ],
    service: [],
  };
}

describe('commit-verifier', () => {
  it('returns true for a valid signature', async () => {
    const keyPair = await generateTestKeyPair();
    const jwk = await exportPublicKeyJwk(keyPair.publicKey);
    const did = 'did:plc:test123' as DID;
    const didDoc = makeDidDoc(did, jwk);

    const signedBytes = new TextEncoder().encode('test commit data');
    const sig = await signData(keyPair.privateKey, signedBytes);

    const result = await verifyCommitSignature(
      { did, sig, signedBytes },
      async () => didDoc,
    );

    expect(result).toBe(true);
  });

  it('returns false for an invalid signature', async () => {
    const keyPair = await generateTestKeyPair();
    const jwk = await exportPublicKeyJwk(keyPair.publicKey);
    const did = 'did:plc:test456' as DID;
    const didDoc = makeDidDoc(did, jwk);

    const signedBytes = new TextEncoder().encode('test commit data');
    // Sign different data to produce an invalid sig for our signedBytes
    const wrongData = new TextEncoder().encode('wrong data');
    const sig = await signData(keyPair.privateKey, wrongData);

    const result = await verifyCommitSignature(
      { did, sig, signedBytes },
      async () => didDoc,
    );

    expect(result).toBe(false);
  });

  it('returns false when DID resolution fails', async () => {
    const did = 'did:plc:unreachable' as DID;
    const signedBytes = new TextEncoder().encode('data');
    const sig = new Uint8Array(64);

    const result = await verifyCommitSignature(
      { did, sig, signedBytes },
      async () => {
        throw new Error('DID resolution failed');
      },
    );

    expect(result).toBe(false);
  });

  it('returns false when DID document has no verification method', async () => {
    const did = 'did:plc:nokey' as DID;
    const didDoc: DidDocument = {
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: did,
      verificationMethod: [],
      service: [],
    };

    const signedBytes = new TextEncoder().encode('data');
    const sig = new Uint8Array(64);

    const result = await verifyCommitSignature(
      { did, sig, signedBytes },
      async () => didDoc,
    );

    expect(result).toBe(false);
  });
});
