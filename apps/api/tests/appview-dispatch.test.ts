import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { FirehoseEvent } from '@coopsource/federation';
import type { AtUri, CID, DID } from '@coopsource/common';
import { dispatchFirehoseEvent } from '../src/appview/loop.js';

// Mock all indexers
vi.mock('../src/appview/indexers/membership-indexer.js', () => ({
  indexMembership: vi.fn(),
  indexMemberApproval: vi.fn(),
}));

vi.mock('../src/appview/indexers/proposal-indexer.js', () => ({
  indexProposal: vi.fn(),
  indexVote: vi.fn(),
}));

vi.mock('../src/appview/indexers/agreement-indexer.js', () => ({
  indexAgreement: vi.fn(),
  indexSignature: vi.fn(),
}));

vi.mock('../src/appview/indexers/alignment-indexer.js', () => ({
  indexInterest: vi.fn(),
  indexOutcome: vi.fn(),
  indexInterestMap: vi.fn(),
}));

// Also need to mock relay-consumer and commit-verifier since loop.ts imports them
vi.mock('../src/appview/relay-consumer.js', () => ({
  subscribeRelay: vi.fn(),
}));

vi.mock('../src/appview/commit-verifier.js', () => ({
  verifyCommitSignature: vi.fn().mockResolvedValue(true),
}));

function makeEvent(collection: string, operation: 'create' | 'update' | 'delete' = 'create'): FirehoseEvent {
  return {
    seq: 1,
    did: 'did:plc:test' as DID,
    operation,
    uri: `at://did:plc:test/${collection}/rkey1` as AtUri,
    cid: 'bafytest' as CID,
    record: { $type: collection },
    time: '2026-01-01T00:00:00Z',
  };
}

// Use a fake db — the indexers are mocked so it won't be called
const fakeDb = {} as Kysely<Database>;

describe('dispatchFirehoseEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches org.membership create to indexMembership', async () => {
    const { indexMembership } = await import('../src/appview/indexers/membership-indexer.js');
    const event = makeEvent('network.coopsource.org.membership');

    await dispatchFirehoseEvent(fakeDb, event);

    expect(indexMembership).toHaveBeenCalledWith(fakeDb, event);
  });

  it('dispatches org.memberApproval create to indexMemberApproval', async () => {
    const { indexMemberApproval } = await import('../src/appview/indexers/membership-indexer.js');
    const event = makeEvent('network.coopsource.org.memberApproval');

    await dispatchFirehoseEvent(fakeDb, event);

    expect(indexMemberApproval).toHaveBeenCalledWith(fakeDb, event);
  });

  it('dispatches governance.proposal to indexProposal', async () => {
    const { indexProposal } = await import('../src/appview/indexers/proposal-indexer.js');
    const event = makeEvent('network.coopsource.governance.proposal');

    await dispatchFirehoseEvent(fakeDb, event);

    expect(indexProposal).toHaveBeenCalledWith(fakeDb, event);
  });

  it('dispatches governance.vote to indexVote', async () => {
    const { indexVote } = await import('../src/appview/indexers/proposal-indexer.js');
    const event = makeEvent('network.coopsource.governance.vote');

    await dispatchFirehoseEvent(fakeDb, event);

    expect(indexVote).toHaveBeenCalledWith(fakeDb, event);
  });

  it('dispatches agreement.master to indexAgreement', async () => {
    const { indexAgreement } = await import('../src/appview/indexers/agreement-indexer.js');
    const event = makeEvent('network.coopsource.agreement.master');

    await dispatchFirehoseEvent(fakeDb, event);

    expect(indexAgreement).toHaveBeenCalledWith(fakeDb, event);
  });

  it('dispatches agreement.signature to indexSignature', async () => {
    const { indexSignature } = await import('../src/appview/indexers/agreement-indexer.js');
    const event = makeEvent('network.coopsource.agreement.signature');

    await dispatchFirehoseEvent(fakeDb, event);

    expect(indexSignature).toHaveBeenCalledWith(fakeDb, event);
  });

  it('dispatches alignment.interest to indexInterest', async () => {
    const { indexInterest } = await import('../src/appview/indexers/alignment-indexer.js');
    const event = makeEvent('network.coopsource.alignment.interest');

    await dispatchFirehoseEvent(fakeDb, event);

    expect(indexInterest).toHaveBeenCalledWith(fakeDb, event);
  });

  it('dispatches alignment.outcome to indexOutcome', async () => {
    const { indexOutcome } = await import('../src/appview/indexers/alignment-indexer.js');
    const event = makeEvent('network.coopsource.alignment.outcome');

    await dispatchFirehoseEvent(fakeDb, event);

    expect(indexOutcome).toHaveBeenCalledWith(fakeDb, event);
  });

  it('dispatches alignment.interestMap to indexInterestMap', async () => {
    const { indexInterestMap } = await import('../src/appview/indexers/alignment-indexer.js');
    const event = makeEvent('network.coopsource.alignment.interestMap');

    await dispatchFirehoseEvent(fakeDb, event);

    expect(indexInterestMap).toHaveBeenCalledWith(fakeDb, event);
  });

  it('skips unknown collections silently', async () => {
    const { indexMembership } = await import('../src/appview/indexers/membership-indexer.js');
    const { indexProposal } = await import('../src/appview/indexers/proposal-indexer.js');
    const event = makeEvent('app.bsky.feed.post');

    await dispatchFirehoseEvent(fakeDb, event);

    expect(indexMembership).not.toHaveBeenCalled();
    expect(indexProposal).not.toHaveBeenCalled();
  });

  it('dispatches delete events to indexers', async () => {
    const { indexMembership } = await import('../src/appview/indexers/membership-indexer.js');
    const event = makeEvent('network.coopsource.org.membership', 'delete');

    await dispatchFirehoseEvent(fakeDb, event);

    expect(indexMembership).toHaveBeenCalledWith(fakeDb, event);
    expect(event.operation).toBe('delete');
  });
});
