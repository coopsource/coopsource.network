import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as crypto from 'node:crypto';
import {
  verifyCommitSignature,
  resolveDidDocument,
  clearDidCache,
} from '../src/appview/commit-verifier.js';
import { BlockedAddressError } from '@coopsource/federation/http';
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
  // `BufferSource` requires an `ArrayBuffer`-backed view (TS 5.9 generic typed
  // arrays); `data` is `Uint8Array<ArrayBufferLike>`, so copy it into one.
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new Uint8Array(data),
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

// ── Audit S-08 ────────────────────────────────────────────────────────────

describe('Commit verifier DID resolution is guarded (S-08)', () => {
  beforeEach(() => {
    clearDidCache();
  });

  it('refuses a did:web naming a private address, without fetching', async () => {
    const fetchImpl = vi.fn();

    await expect(
      resolveDidDocument('did:web:169.254.169.254' as DID, {
        fetchImpl,
        lookup: async () => ['93.184.216.34'],
      }),
    ).rejects.toThrow(BlockedAddressError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a did:web whose host resolves to a private address', async () => {
    const fetchImpl = vi.fn();

    await expect(
      resolveDidDocument('did:web:rebind.example' as DID, {
        fetchImpl,
        lookup: async () => ['10.0.0.1'],
      }),
    ).rejects.toThrow(BlockedAddressError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('resolves an ordinary did:web', async () => {
    const doc = await resolveDidDocument('did:web:example.com' as DID, {
      lookup: async () => ['93.184.216.34'],
      fetchImpl: async () =>
        new Response(JSON.stringify({ id: 'did:web:example.com', verificationMethod: [] }), {
          status: 200,
        }),
    });

    expect(doc.id).toBe('did:web:example.com');
  });
});
