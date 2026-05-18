import { describe, expect, it } from 'vitest';
import { DenyAllGroupAuthorityPort, StaticGroupAuthorityPort } from '../group-authority-port.js';
import type { SpaceRef } from '../types.js';
import { fakeDid } from './helpers/factories.js';

const ref: SpaceRef = { arbiter: fakeDid('did:plc:coop'), type: 'X', skey: 'members' };

describe('DenyAllGroupAuthorityPort', () => {
  it('fails closed without reporting stale data', async () => {
    const port = new DenyAllGroupAuthorityPort();
    await expect(
      port.isMember({ space: ref, did: fakeDid('did:plc:alice'), consistency: 'strict' }),
    ).resolves.toEqual({ ok: true, isMember: false });
    await expect(
      port.resolveMembership({ space: ref, consistency: 'strict' }),
    ).resolves.toEqual({ members: [] });
  });
});

describe('StaticGroupAuthorityPort', () => {
  it('checks membership and pages snapshots with a distinct cursor', async () => {
    const port = new StaticGroupAuthorityPort(
      [{ space: ref, members: [fakeDid('did:plc:a'), fakeDid('did:plc:b'), fakeDid('did:plc:c')] }],
      { pageSize: 2 },
    );

    const decision = await port.isMember({
      space: ref,
      did: fakeDid('did:plc:a'),
      consistency: 'strict',
    });
    expect(decision.ok).toBe(true);
    expect(decision.isMember).toBe(true);
    expect(decision.snapshotId).toBeDefined();

    const firstPage = await port.resolveMembership({ space: ref, consistency: 'strict' });
    expect(firstPage.members).toEqual([fakeDid('did:plc:a'), fakeDid('did:plc:b')]);
    expect(firstPage.cursor).toBeDefined();

    const secondPage = await port.resolveMembership({
      space: ref,
      cursor: firstPage.cursor,
      consistency: 'strict',
    });
    expect(secondPage.members).toEqual([fakeDid('did:plc:c')]);
    expect(secondPage.cursor).toBeUndefined();
    expect(secondPage.snapshotId).toBe(firstPage.snapshotId);
  });
});
