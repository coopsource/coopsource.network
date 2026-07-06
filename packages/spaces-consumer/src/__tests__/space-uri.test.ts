import { describe, it, expect } from 'vitest';
import {
  formatSpaceUri,
  formatSpaceRecordUri,
  parseSpaceUri,
  parseSpaceRecordUri,
  isSpaceRecordUri,
  type SpaceRecordUri,
  type SpaceUri,
} from '../space-uri.js';

const sample: SpaceRecordUri = {
  spaceDid: 'did:plc:abc',
  spaceType: 'network.coopsource.org.members',
  skey: 'main',
  authorDid: 'did:plc:xyz',
  collection: 'network.coopsource.governance.vote',
  rkey: '3k2a4z',
};

describe('space-uri', () => {
  it('round-trips a space URI without accepting record URIs as spaces', () => {
    const space: SpaceUri = {
      spaceDid: sample.spaceDid,
      spaceType: 'network.coopsource.org.spaceType.role',
      skey: 'roles/board',
    };
    const uri = formatSpaceUri(space);

    expect(uri).toBe(
      'at://did:plc:abc/space/network.coopsource.org.spaceType.role/roles%2Fboard',
    );
    expect(parseSpaceUri(uri)).toEqual(space);
    expect(parseSpaceUri(formatSpaceRecordUri(sample))).toBeNull();
    expect(parseSpaceUri('at://did:plc:abc/app.bsky.feed.post/xyz')).toBeNull();
  });

  it('round-trips a proposal-0016-shaped URI', () => {
    const uri = formatSpaceRecordUri(sample);
    expect(uri).toBe(
      'at://did:plc:abc/space/network.coopsource.org.members/main/did:plc:xyz/network.coopsource.governance.vote/3k2a4z',
    );
    expect(parseSpaceRecordUri(uri)).toEqual(sample);
    expect(isSpaceRecordUri(uri)).toBe(true);
  });

  it('round-trips slash-bearing role and class space keys', () => {
    const roleSpace: SpaceRecordUri = {
      ...sample,
      spaceType: 'network.coopsource.org.spaceType.role',
      skey: 'roles/board',
    };
    const classSpace: SpaceRecordUri = {
      ...sample,
      spaceType: 'network.coopsource.org.spaceType.class',
      skey: 'classes/worker',
    };

    expect(formatSpaceRecordUri(roleSpace)).toContain('/roles%2Fboard/');
    expect(parseSpaceRecordUri(formatSpaceRecordUri(roleSpace))).toEqual(
      roleSpace,
    );
    expect(formatSpaceRecordUri(classSpace)).toContain('/classes%2Fworker/');
    expect(parseSpaceRecordUri(formatSpaceRecordUri(classSpace))).toEqual(
      classSpace,
    );
  });

  it('returns null for a plain public at:// record URI', () => {
    expect(
      parseSpaceRecordUri('at://did:plc:abc/app.bsky.feed.post/xyz'),
    ).toBeNull();
    expect(isSpaceRecordUri('at://did:plc:abc/app.bsky.feed.post/xyz')).toBe(
      false,
    );
  });

  it('returns null for wrong scheme, missing space marker, and empty components', () => {
    expect(
      parseSpaceRecordUri('https://did:plc:abc/space/t/s/a/c/r'),
    ).toBeNull();
    // 7 segments but marker is not "space"
    expect(
      parseSpaceRecordUri('at://did:plc:abc/notspace/t/s/a/c/r'),
    ).toBeNull();
    // empty skey component
    expect(parseSpaceRecordUri('at://did:plc:abc/space/t//a/c/r')).toBeNull();
  });

  it('returns null for query/fragment suffixes and malformed input', () => {
    const base = formatSpaceRecordUri(sample);
    expect(parseSpaceRecordUri(`${base}?foo=1`)).toBeNull();
    expect(parseSpaceRecordUri(`${base}#frag`)).toBeNull();
    expect(parseSpaceRecordUri('at://did:plc:abc/space/t/s/a/c')).toBeNull(); // too few
    expect(
      parseSpaceRecordUri('at://did:plc:abc/space/t/s/a/c/r/extra'),
    ).toBeNull(); // too many
    expect(parseSpaceRecordUri('at://did:plc:abc/space/t/%/a/c/r')).toBeNull();
    expect(parseSpaceRecordUri('')).toBeNull();
  });
});
