import { describe, it, expect } from 'vitest';
import { collectionFromUri } from '../src/appview/utils.js';

describe('relay-consumer filtering logic', () => {
  it('collectionFromUri extracts collection from AT URI', () => {
    expect(collectionFromUri('at://did:plc:abc/network.coopsource.org.membership/rkey1'))
      .toBe('network.coopsource.org.membership');
    expect(collectionFromUri('at://did:plc:abc/app.bsky.feed.post/rkey2'))
      .toBe('app.bsky.feed.post');
    expect(collectionFromUri('at://did:plc:abc/network.coopsource.governance.vote/rkey3'))
      .toBe('network.coopsource.governance.vote');
  });

  it('collectionFromUri returns empty string for malformed URIs', () => {
    expect(collectionFromUri('')).toBe('');
    expect(collectionFromUri('at://did:plc:abc')).toBe('');
  });

  it('collection prefix filtering matches coopsource collections', () => {
    const prefixes = ['network.coopsource.'];

    const matchingCollections = [
      'network.coopsource.org.membership',
      'network.coopsource.org.memberApproval',
      'network.coopsource.governance.vote',
      'network.coopsource.governance.proposal',
      'network.coopsource.agreement.master',
      'network.coopsource.agreement.signature',
      'network.coopsource.alignment.interest',
    ];

    const nonMatchingCollections = [
      'app.bsky.feed.post',
      'app.bsky.actor.profile',
      'chat.bsky.convo.message',
      'network.other.org.membership',
    ];

    for (const col of matchingCollections) {
      expect(
        prefixes.some((p) => col.startsWith(p)),
        `Expected "${col}" to match prefix`,
      ).toBe(true);
    }

    for (const col of nonMatchingCollections) {
      expect(
        prefixes.some((p) => col.startsWith(p)),
        `Expected "${col}" to NOT match prefix`,
      ).toBe(false);
    }
  });

  it('two-pass decode skips non-matching collections', () => {
    const prefixes = ['network.coopsource.'];

    const uris = [
      'at://did:plc:test/app.bsky.feed.post/abc',
      'at://did:plc:test/app.bsky.graph.follow/def',
    ];

    const hasMatch = uris.some((uri) => {
      const collection = collectionFromUri(uri);
      return prefixes.some((p) => collection.startsWith(p));
    });

    expect(hasMatch).toBe(false);
  });

  it('two-pass decode proceeds for matching collections', () => {
    const prefixes = ['network.coopsource.'];

    const uris = [
      'at://did:plc:test/app.bsky.feed.post/abc',
      'at://did:plc:test/network.coopsource.org.membership/def',
    ];

    const hasMatch = uris.some((uri) => {
      const collection = collectionFromUri(uri);
      return prefixes.some((p) => collection.startsWith(p));
    });

    expect(hasMatch).toBe(true);
  });

  it('relay URL construction includes cursor parameter', () => {
    const relayUrl = 'wss://bsky.network';
    const cursor = 12345;
    const endpoint = `${relayUrl}/xrpc/com.atproto.sync.subscribeRepos?cursor=${cursor}`;

    expect(endpoint).toBe('wss://bsky.network/xrpc/com.atproto.sync.subscribeRepos?cursor=12345');
  });
});
