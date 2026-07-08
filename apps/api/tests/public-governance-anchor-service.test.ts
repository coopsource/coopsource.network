import { describe, expect, it, vi } from 'vitest';
import type { AtUri, CID, DID } from '@coopsource/common';
import type { IPdsService } from '@coopsource/federation';
import { LEXICON_IDS } from '@coopsource/lexicons';
import {
  InMemoryPublicGovernanceAnchorWritePort,
  PdsPublicGovernanceAnchorWritePort,
  PublicGovernanceAnchorService,
  type ProposalAnchorSource,
} from '../src/services/public-governance-anchor-service.js';

describe('PublicGovernanceAnchorService', () => {
  const now = new Date('2026-07-06T12:30:00.000Z');

  const source: ProposalAnchorSource = {
    cooperativeDid: 'did:plc:coop123',
    proposalId: '550e8400-e29b-41d4-a716-446655440000',
    status: 'open',
    openedAt: new Date('2026-07-06T12:00:00.000Z'),
  };

  it('does not publish when anchor policy is disabled', async () => {
    const writePort = new InMemoryPublicGovernanceAnchorWritePort();
    const service = new PublicGovernanceAnchorService(writePort, () => now);

    const result = await service.upsertProposalAnchor({
      policy: { enabled: false },
      proposal: source,
    });

    expect(result).toBeNull();
    expect(writePort.all()).toHaveLength(0);
  });

  it('does not publish draft or unknown-status proposals', async () => {
    const writePort = new InMemoryPublicGovernanceAnchorWritePort();
    const service = new PublicGovernanceAnchorService(writePort, () => now);

    await expect(
      service.upsertProposalAnchor({
        policy: { enabled: true },
        proposal: { ...source, status: 'draft' },
      }),
    ).resolves.toBeNull();

    await expect(
      service.upsertProposalAnchor({
        policy: { enabled: true },
        proposal: { ...source, status: 'internal-review' },
      }),
    ).resolves.toBeNull();

    expect(writePort.all()).toHaveLength(0);
  });

  it('does not publish when the minimum eligible member rule is unmet', async () => {
    const writePort = new InMemoryPublicGovernanceAnchorWritePort();
    const service = new PublicGovernanceAnchorService(writePort, () => now);

    const result = await service.upsertProposalAnchor({
      policy: {
        enabled: true,
        minimumEligibleMembers: 5,
        eligibleMemberCount: 4,
      },
      proposal: source,
    });

    expect(result).toBeNull();
    expect(writePort.all()).toHaveLength(0);
  });

  it('writes only the public-safe proposal anchor fields', async () => {
    const writePort = new InMemoryPublicGovernanceAnchorWritePort();
    const service = new PublicGovernanceAnchorService(writePort, () => now);
    const privateSource = {
      ...source,
      title: 'Private title',
      body: 'Private body',
      options: ['yes', 'no'],
      authorDid: 'did:plc:author123',
      privateProposalUri:
        'space://did:plc:coop123/network.coopsource.org.spaceType.members/members/did:plc:author123/network.coopsource.governance.proposal/3kprivate',
      voterDids: ['did:plc:voter123'],
      tally: { yes: 1 },
    };

    const result = await service.upsertProposalAnchor({
      policy: { enabled: true },
      proposal: privateSource,
    });

    expect(result).not.toBeNull();
    expect(result?.record).toEqual({
      cooperativeDid: source.cooperativeDid,
      proposalId: source.proposalId,
      status: 'open',
      openedAt: '2026-07-06T12:00:00.000Z',
      updatedAt: now.toISOString(),
      anchorVersion: 1,
    });
    expect(result?.record).not.toHaveProperty('title');
    expect(result?.record).not.toHaveProperty('body');
    expect(result?.record).not.toHaveProperty('options');
    expect(result?.record).not.toHaveProperty('authorDid');
    expect(result?.record).not.toHaveProperty('privateProposalUri');
    expect(result?.record).not.toHaveProperty('voterDids');
    expect(result?.record).not.toHaveProperty('tally');
  });

  it('omits outcome by default and includes known outcomes only when policy opts in', async () => {
    const writePort = new InMemoryPublicGovernanceAnchorWritePort();
    const service = new PublicGovernanceAnchorService(writePort, () => now);
    const resolved = {
      ...source,
      status: 'resolved',
      outcome: 'passed',
      closedAt: '2026-07-07T12:00:00.000Z',
      resolvedAt: '2026-07-07T12:30:00.000Z',
    };

    const withoutOutcome = await service.upsertProposalAnchor({
      policy: { enabled: true },
      proposal: resolved,
    });
    const withOutcome = await service.upsertProposalAnchor({
      policy: { enabled: true, publishOutcome: true },
      proposal: resolved,
    });
    const unknownOutcome = await service.upsertProposalAnchor({
      policy: { enabled: true, publishOutcome: true },
      proposal: { ...resolved, outcome: 'private-runoff-needed' },
    });

    expect(withoutOutcome?.record.outcome).toBeUndefined();
    expect(withOutcome?.record.outcome).toBe('passed');
    expect(unknownOutcome?.record.outcome).toBeUndefined();
  });

  it('updates an existing anchor URI instead of creating a second anchor', async () => {
    const writePort = new InMemoryPublicGovernanceAnchorWritePort();
    const service = new PublicGovernanceAnchorService(writePort, () => now);

    const created = await service.upsertProposalAnchor({
      policy: { enabled: true },
      proposal: source,
    });
    const updated = await service.upsertProposalAnchor({
      policy: { enabled: true, publishOutcome: true },
      proposal: { ...source, status: 'resolved', outcome: 'failed' },
      existingAnchorUri: created?.uri,
    });

    expect(updated?.uri).toBe(created?.uri);
    expect(updated?.cid).not.toBe(created?.cid);
    expect(writePort.all()).toHaveLength(1);
    expect(writePort.get(created!.uri)?.status).toBe('resolved');
    expect(writePort.get(created!.uri)?.outcome).toBe('failed');
  });
});

describe('PdsPublicGovernanceAnchorWritePort', () => {
  it('creates a tid-keyed public proposal anchor when no anchor URI exists', async () => {
    const pdsService = {
      createRecord: vi.fn().mockResolvedValue({
        uri: 'at://did:plc:coop123/network.coopsource.governance.proposalAnchor/3kcreated' as AtUri,
        cid: 'bafyreicreated' as CID,
      }),
      putRecord: vi.fn(),
    } as unknown as IPdsService;
    const writePort = new PdsPublicGovernanceAnchorWritePort(pdsService);

    const result = await writePort.upsertProposalAnchor({
      cooperativeDid: 'did:plc:coop123' as DID,
      record: {
        cooperativeDid: 'did:plc:coop123',
        proposalId: 'proposal-1',
        status: 'open',
        updatedAt: '2026-07-06T12:00:00.000Z',
        anchorVersion: 1,
      },
    });

    expect(result.uri).toContain('/3kcreated');
    expect(pdsService.createRecord).toHaveBeenCalledWith({
      did: 'did:plc:coop123',
      collection: LEXICON_IDS.GovernanceProposalAnchor,
      record: result.record,
    });
    expect(pdsService.putRecord).not.toHaveBeenCalled();
  });

  it('puts to the existing anchor rkey when an anchor URI exists', async () => {
    const pdsService = {
      createRecord: vi.fn(),
      putRecord: vi.fn().mockResolvedValue({
        uri: 'at://did:plc:coop123/network.coopsource.governance.proposalAnchor/3kexisting' as AtUri,
        cid: 'bafyreiexisting' as CID,
      }),
    } as unknown as IPdsService;
    const writePort = new PdsPublicGovernanceAnchorWritePort(pdsService);

    const result = await writePort.upsertProposalAnchor({
      cooperativeDid: 'did:plc:coop123' as DID,
      existingAnchorUri:
        'at://did:plc:coop123/network.coopsource.governance.proposalAnchor/3kexisting' as AtUri,
      record: {
        cooperativeDid: 'did:plc:coop123',
        proposalId: 'proposal-1',
        status: 'resolved',
        outcome: 'passed',
        updatedAt: '2026-07-07T12:00:00.000Z',
        anchorVersion: 1,
      },
    });

    expect(result.cid).toBe('bafyreiexisting');
    expect(pdsService.createRecord).not.toHaveBeenCalled();
    expect(pdsService.putRecord).toHaveBeenCalledWith({
      did: 'did:plc:coop123',
      collection: LEXICON_IDS.GovernanceProposalAnchor,
      rkey: '3kexisting',
      record: result.record,
    });
  });

  it('rejects existing URIs that are not anchors for the same cooperative', async () => {
    const pdsService = {
      createRecord: vi.fn(),
      putRecord: vi.fn(),
    } as unknown as IPdsService;
    const writePort = new PdsPublicGovernanceAnchorWritePort(pdsService);

    await expect(
      writePort.upsertProposalAnchor({
        cooperativeDid: 'did:plc:coop123' as DID,
        existingAnchorUri:
          'at://did:plc:coop123/network.coopsource.governance.proposal/3kproposal' as AtUri,
        record: {
          cooperativeDid: 'did:plc:coop123',
          proposalId: 'proposal-1',
          status: 'open',
          updatedAt: '2026-07-06T12:00:00.000Z',
          anchorVersion: 1,
        },
      }),
    ).rejects.toThrow('Existing public governance anchor URI');

    expect(pdsService.createRecord).not.toHaveBeenCalled();
    expect(pdsService.putRecord).not.toHaveBeenCalled();
  });
});
