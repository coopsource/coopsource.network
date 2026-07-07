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

const roleSpace: SpaceRef = {
  arbiterDid: fakeDid('did:plc:coop'),
  spaceKey: 'roles/board',
  expectedSpaceType: 'network.coopsource.org.spaceType.role',
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

  it('formats slash-bearing space keys as parseable URI components', () => {
    expect(
      formatPermissionedRecordLocationUri({
        space: roleSpace,
        authorDid: fakeDid('did:plc:alice'),
        collection: 'network.coopsource.governance.vote',
        rkey: 'vote1',
      }),
    ).toBe(
      'at://did:plc:coop/space/network.coopsource.org.spaceType.role/roles%2Fboard/did:plc:alice/network.coopsource.governance.vote/vote1',
    );
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

  it('awaits the async delete boundary before deleting the write', async () => {
    const events: string[] = [];
    const port = new InMemoryPermissionedRecordWritePort({
      beforeDelete: async () => {
        events.push('before-start');
        await Promise.resolve();
        events.push('before-finish');
      },
    });

    await port.createRecord({
      space: membersSpace,
      authorDid: fakeDid('did:plc:alice'),
      collection: 'network.coopsource.governance.vote',
      record: { choice: 'yes' },
      rkey: 'vote1',
    });

    events.push('call-start');
    await port.deleteRecord({
      space: membersSpace,
      authorDid: fakeDid('did:plc:alice'),
      collection: 'network.coopsource.governance.vote',
      rkey: 'vote1',
    });
    events.push('call-finish');

    expect(events).toEqual([
      'call-start',
      'before-start',
      'before-finish',
      'call-finish',
    ]);
    expect(port.writtenRecords()).toHaveLength(0);
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

  it('updates an existing permissioned location in place', async () => {
    const port = new InMemoryPermissionedRecordWritePort({
      cidFactory: ({ record }) =>
        record.choice === 'no' ? fakeCid('bafyno') : fakeCid('bafyyes'),
    });

    await port.createRecord({
      space: membersSpace,
      authorDid: fakeDid('did:plc:alice'),
      collection: 'network.coopsource.governance.vote',
      record: { choice: 'yes' },
      rkey: 'vote1',
    });
    const updated = await port.updateRecord({
      space: membersSpace,
      authorDid: fakeDid('did:plc:alice'),
      collection: 'network.coopsource.governance.vote',
      record: { choice: 'no' },
      rkey: 'vote1',
    });

    expect(updated.location.rkey).toBe('vote1');
    expect(updated.cid).toBe(fakeCid('bafyno'));
    expect(port.writtenRecords()).toEqual([
      expect.objectContaining({
        cid: fakeCid('bafyno'),
        record: { choice: 'no' },
      }),
    ]);
  });

  it('generates monotonic rkeys after deleting a write', async () => {
    const port = new InMemoryPermissionedRecordWritePort();

    const first = await port.createRecord({
      space: membersSpace,
      authorDid: fakeDid('did:plc:alice'),
      collection: 'network.coopsource.governance.vote',
      record: { choice: 'yes' },
    });
    const second = await port.createRecord({
      space: membersSpace,
      authorDid: fakeDid('did:plc:alice'),
      collection: 'network.coopsource.governance.vote',
      record: { choice: 'no' },
    });

    await port.deleteRecord({
      space: first.location.space,
      authorDid: first.location.authorDid,
      collection: first.location.collection,
      rkey: first.location.rkey,
    });

    const third = await port.createRecord({
      space: membersSpace,
      authorDid: fakeDid('did:plc:alice'),
      collection: 'network.coopsource.governance.vote',
      record: { choice: 'abstain' },
    });

    expect(second.location.rkey).toBe('rk000002');
    expect(third.location.rkey).toBe('rk000003');
    expect(port.writtenRecords()).toHaveLength(2);
  });

  it('rejects deleting an absent permissioned location', async () => {
    const port = new InMemoryPermissionedRecordWritePort();

    await expect(
      port.deleteRecord({
        space: membersSpace,
        authorDid: fakeDid('did:plc:alice'),
        collection: 'network.coopsource.governance.vote',
        rkey: 'missing',
      }),
    ).rejects.toMatchObject({
      name: 'PermissionedRecordWriteError',
      kind: 'not-found',
    });
  });

  it('rejects updating an absent permissioned location', async () => {
    const port = new InMemoryPermissionedRecordWritePort();

    await expect(
      port.updateRecord({
        space: membersSpace,
        authorDid: fakeDid('did:plc:alice'),
        collection: 'network.coopsource.governance.vote',
        record: { choice: 'no' },
        rkey: 'missing',
      }),
    ).rejects.toMatchObject({
      name: 'PermissionedRecordWriteError',
      kind: 'not-found',
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
