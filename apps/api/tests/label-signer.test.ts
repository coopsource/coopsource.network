import { describe, it, expect } from 'vitest';
import { LabelSigner } from '../src/services/label-signer.js';
import { generateRotationKeypair } from '@coopsource/federation/local';

describe('LabelSigner', () => {
  it('signs a label and produces a Uint8Array sig', async () => {
    const { privateKeyHex } = await generateRotationKeypair();
    const signer = new LabelSigner(privateKeyHex);

    const sig = await signer.sign({
      ver: 1,
      src: 'did:plc:test123',
      uri: 'at://did:plc:test123/network.coopsource.governance.proposal/abc',
      val: 'proposal-approved',
      neg: false,
      cts: new Date().toISOString(),
    });

    expect(sig).toBeInstanceOf(Uint8Array);
    expect(sig.length).toBe(64); // secp256k1 compact signature
  });

  it('produces deterministic signatures for same input and key', async () => {
    const { privateKeyHex } = await generateRotationKeypair();
    const signer = new LabelSigner(privateKeyHex);

    const label = {
      ver: 1 as const,
      src: 'did:plc:test123',
      uri: 'at://did:plc:test123/proposal/abc',
      val: 'proposal-approved',
      neg: false,
      cts: '2026-04-05T12:00:00.000Z',
    };

    const sig1 = await signer.sign(label);
    const sig2 = await signer.sign(label);

    expect(Buffer.from(sig1)).toEqual(Buffer.from(sig2));
  });
});
