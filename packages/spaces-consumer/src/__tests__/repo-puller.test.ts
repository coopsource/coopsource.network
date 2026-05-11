import { describe, it, expect } from 'vitest';
import { InMemoryRepoPuller } from '../repo-puller.js';
import { buildPulledRecord, fakeDid } from './helpers/factories.js';
import type { SpaceRef } from '../types.js';

const ref: SpaceRef = { arbiter: fakeDid('did:plc:coop'), type: 'X', skey: 'members' };

describe('InMemoryRepoPuller', () => {
  it('returns records authored by the requested DID after the cursor', async () => {
    const records = [
      buildPulledRecord({ space: ref, authorDid: fakeDid('did:plc:alice'), rkey: 'r1', rev: '1' }),
      buildPulledRecord({ space: ref, authorDid: fakeDid('did:plc:alice'), rkey: 'r2', rev: '2' }),
    ];
    const p = new InMemoryRepoPuller(records);
    const pulled = await p.pull({ space: ref, memberDid: fakeDid('did:plc:alice'), since: '0' });
    expect(pulled).toHaveLength(2);
  });

  it('filters by space', async () => {
    const otherRef: SpaceRef = { ...ref, skey: 'board' };
    const records = [
      buildPulledRecord({ space: ref, authorDid: fakeDid('did:plc:alice'), rkey: 'r1', rev: '1' }),
      buildPulledRecord({ space: otherRef, authorDid: fakeDid('did:plc:alice'), rkey: 'r2', rev: '2' }),
    ];
    const p = new InMemoryRepoPuller(records);
    const pulled = await p.pull({ space: ref, memberDid: fakeDid('did:plc:alice'), since: '0' });
    expect(pulled).toHaveLength(1);
    expect(pulled[0]?.space.skey).toBe('members');
  });

  it('filters by author DID', async () => {
    const records = [
      buildPulledRecord({ space: ref, authorDid: fakeDid('did:plc:alice'), rkey: 'r1', rev: '1' }),
      buildPulledRecord({ space: ref, authorDid: fakeDid('did:plc:bob'), rkey: 'r2', rev: '2' }),
    ];
    const p = new InMemoryRepoPuller(records);
    const pulled = await p.pull({ space: ref, memberDid: fakeDid('did:plc:alice'), since: '0' });
    expect(pulled).toHaveLength(1);
    expect(pulled[0]?.authorDid).toBe('did:plc:alice');
  });

  it('respects the since cursor (only records with rev > since)', async () => {
    const records = [
      buildPulledRecord({ space: ref, authorDid: fakeDid('did:plc:alice'), rkey: 'r1', rev: '1' }),
      buildPulledRecord({ space: ref, authorDid: fakeDid('did:plc:alice'), rkey: 'r2', rev: '2' }),
      buildPulledRecord({ space: ref, authorDid: fakeDid('did:plc:alice'), rkey: 'r3', rev: '3' }),
    ];
    const p = new InMemoryRepoPuller(records);
    const pulled = await p.pull({ space: ref, memberDid: fakeDid('did:plc:alice'), since: '1' });
    expect(pulled).toHaveLength(2);
    expect(pulled.map((r) => r.rev)).toEqual(['2', '3']);
  });
});
