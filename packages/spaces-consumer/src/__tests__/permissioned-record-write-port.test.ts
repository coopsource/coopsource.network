import { describe, expect, it } from 'vitest';
import {
  formatPermissionedRecordLocationUri,
  InMemoryPermissionedRecordWritePort,
  PermissionedRecordWriteError,
} from '../permissioned-record-write-port.js';
import type { SpaceRef } from '../types.js';
import { fakeCid, fakeDid } from './helpers/factories.js';

const membersSpace: SpaceRef = {
  arbiterDid: fakeDid('did:plc:coop'),
  spaceKey: 'members',
  expectedSpaceType: 'network.coopsource.org.spaceType.members',
};

describe('PermissionedRecordWritePort', () => {
  it('creates records with structured locations and formatted space URIs', async () => {
    const port = new InMemoryPermissionedRecordWritePort({
      rkeyFactory: () => 'vote1',
      cidFactory: () => fakeCid('bafyvote'),
      sourceRevisionFactory: () => 'rev1',
    });

    const result = await port.createRecord({
      space: membersSpace,
      authorDid: fakeDid('did:plc:alice'),
      collection: 'network.coopsource.governance.vote',
      record: { choice: 'yes' },
    });

    expect(result).toEqual({
      location: {
        space: membersSpace,
        authorDid: fakeDid('did:plc:alice'),
        collection: 'network.coopsource.governance.vote',
        rkey: 'vote1',
      },
      cid: fakeCid('bafyvote'),
      sourceRevision: 'rev1',
    });
    expect(formatPermissionedRecordLocationUri(result.location)).toBe(
      'at://did:plc:coop/space/network.coopsource.org.spaceType.members/members/did:plc:alice/network.coopsource.governance.vote/vote1',
    );
    expect(port.writtenRecords()).toHaveLength(1);
    expect(port.writtenRecords()[0]?.record).toEqual({ choice: 'yes' });
  });

  it('awaits the async write boundary before recording the write', async () => {
    const events: string[] = [];
    const port = new InMemoryPermissionedRecordWritePort({
      rkeyFactory: () => 'vote1',
      beforeCreate: async () => {
        events.push('before-start');
        await Promise.resolve();
        events.push('before-finish');
      },
    });

    events.push('call-start');
    await port.createRecord({
      space: membersSpace,
      authorDid: fakeDid('did:plc:alice'),
      collection: 'network.coopsource.governance.vote',
      record: { choice: 'yes' },
    });
    events.push('call-finish');

    expect(events).toEqual([
      'call-start',
      'before-start',
      'before-finish',
      'call-finish',
    ]);
  });

  it('rejects duplicate writes at the same permissioned location', async () => {
    const port = new InMemoryPermissionedRecordWritePort();
    const args = {
      space: membersSpace,
      authorDid: fakeDid('did:plc:alice'),
      collection: 'network.coopsource.governance.vote',
      record: { choice: 'yes' },
      rkey: 'same',
    };

    await port.createRecord(args);
    await expect(port.createRecord(args)).rejects.toMatchObject({
      name: 'PermissionedRecordWriteError',
      kind: 'conflict',
    });
  });

  it('fails fast when formatting a URI without a space type', () => {
    expect(() =>
      formatPermissionedRecordLocationUri({
        space: { arbiterDid: fakeDid('did:plc:coop'), spaceKey: 'members' },
        authorDid: fakeDid('did:plc:alice'),
        collection: 'network.coopsource.governance.vote',
        rkey: 'vote1',
      }),
    ).toThrow(PermissionedRecordWriteError);
  });
});
