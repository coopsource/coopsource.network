import { expand } from '@noble/hashes/hkdf';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { P256Keypair } from '@atproto/crypto';
import { describe, expect, it } from 'vitest';
import type { DID } from '@coopsource/common';
import {
  Proposal0016CommitVerifier,
  Proposal0016LtHash,
  cidForPermissionedRecord,
  encodePermissionedCommitContext,
} from '../permissioned-sync.js';
import type { SpaceRef } from '../types.js';

const space: SpaceRef = {
  arbiterDid: 'did:plc:coop' as DID,
  expectedSpaceType: 'network.coopsource.org.spaceType.members',
  spaceKey: 'members',
};
const repoDid = 'did:plc:alice' as DID;

describe('Proposal 0016 sync primitives', () => {
  it('matches the pinned empty LtHash digest and reverses additions', () => {
    const hash = new Proposal0016LtHash();
    expect(Buffer.from(hash.digest()).toString('hex')).toBe(
      'e5a00aa9991ac8a5ee3109844d84a55583bd20572ad3ffcd42792f3c36b183ad',
    );

    hash.add('app.example.record', 'one', 'bafy-one');
    expect(Buffer.from(hash.digest()).toString('hex')).not.toBe(
      'e5a00aa9991ac8a5ee3109844d84a55583bd20572ad3ffcd42792f3c36b183ad',
    );
    hash.remove('app.example.record', 'one', 'bafy-one');
    expect(Buffer.from(hash.digest()).toString('hex')).toBe(
      'e5a00aa9991ac8a5ee3109844d84a55583bd20572ad3ffcd42792f3c36b183ad',
    );
  });

  it('is independent of record insertion order', () => {
    const left = new Proposal0016LtHash();
    const right = new Proposal0016LtHash();
    left.add('app.example.record', 'one', 'bafy-one');
    left.add('app.example.record', 'two', 'bafy-two');
    right.add('app.example.record', 'two', 'bafy-two');
    right.add('app.example.record', 'one', 'bafy-one');

    expect(left.digest()).toEqual(right.digest());
  });

  it('computes deterministic DAG-CBOR record CIDs', async () => {
    const first = await cidForPermissionedRecord({
      $type: 'app.example.record',
      value: 'hello',
    });
    const second = await cidForPermissionedRecord({
      $type: 'app.example.record',
      value: 'hello',
    });

    expect(first).toBe(second);
    expect(first.startsWith('bafy')).toBe(true);
  });

  it('verifies the pinned signed-context, MAC, and repository hash', async () => {
    const keypair = await P256Keypair.create();
    const hash = new Proposal0016LtHash();
    hash.add('app.example.record', 'one', 'bafy-one');
    const digest = hash.digest();
    const ikm = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
    const context = encodePermissionedCommitContext({
      space,
      repoDid,
      revision: '3krev',
      ikm,
    });
    const key = expand(sha256, ikm, context, 32);
    const commit = {
      ver: 1,
      hash: digest,
      ikm,
      mac: hmac(sha256, key, digest),
      sig: await keypair.sign(context),
      rev: '3krev',
    };
    const verifier = new Proposal0016CommitVerifier({
      resolveSigningKey: async (did) => {
        expect(did).toBe(repoDid);
        return keypair.did();
      },
    });

    await expect(
      verifier.verify({
        space,
        repoDid,
        commit,
        calculatedHash: digest,
      }),
    ).resolves.toBe(true);
    await expect(
      verifier.verify({
        space,
        repoDid,
        commit,
        calculatedHash: new Uint8Array(32),
      }),
    ).resolves.toBe(false);
  });
});
