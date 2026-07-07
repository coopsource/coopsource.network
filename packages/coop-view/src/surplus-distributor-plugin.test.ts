import { describe, expect, it } from 'vitest';
import {
  CoopSurplusDistributionError,
  createCoopSurplusDistributorPlugin,
  parseCoopSurplusDistributions,
  planCoopSurplusDistributions,
} from './index.js';

describe('CoopSurplusDistributorPlugin', () => {
  it('plans retained patronage allocations as capital-account distributions', async () => {
    const plugin = createCoopSurplusDistributorPlugin();

    const result = await plugin.distribute({
      cooperative: {
        authorityDid: 'did:plc:coop',
        spaceKey: 'members',
      },
      period: { id: 'fy-2026' },
      allocations: [
        {
          patronageRecordId: 'record-1',
          memberDid: 'did:plc:alice',
          retainedAmount: 80,
        },
        {
          patronageRecordId: 'record-2',
          memberDid: 'did:plc:bob',
          retainedAmount: 0,
        },
      ],
    });

    expect(result.distributions).toEqual([
      {
        patronageRecordId: 'record-1',
        memberDid: 'did:plc:alice',
        transactionType: 'patronage_allocation',
        amount: 80,
        description: 'Patronage allocation for fiscal period fy-2026',
      },
    ]);
  });

  it('preserves the current positive-retained-amount filter', () => {
    expect(
      planCoopSurplusDistributions({
        fiscalPeriodId: 'fy-2026',
        allocations: [
          {
            patronageRecordId: 'positive',
            memberDid: 'did:plc:alice',
            retainedAmount: 1,
          },
          {
            patronageRecordId: 'zero',
            memberDid: 'did:plc:bob',
            retainedAmount: 0,
          },
        ],
      }),
    ).toEqual([
      {
        patronageRecordId: 'positive',
        memberDid: 'did:plc:alice',
        transactionType: 'patronage_allocation',
        amount: 1,
        description: 'Patronage allocation for fiscal period fy-2026',
      },
    ]);
  });

  it('rejects non-positive distributor output amounts', () => {
    expect(() =>
      parseCoopSurplusDistributions([
        {
          patronageRecordId: 'negative',
          memberDid: 'did:plc:carol',
          transactionType: 'patronage_allocation',
          amount: -1,
          description: 'bad distribution',
        },
      ]),
    ).toThrow(CoopSurplusDistributionError);
  });

  it('parses distributor output back to typed distributions', async () => {
    const plugin = createCoopSurplusDistributorPlugin();
    const result = await plugin.distribute({
      cooperative: {
        authorityDid: 'did:plc:coop',
        spaceKey: 'members',
      },
      period: { id: 'fy-2026' },
      allocations: [
        {
          patronageRecordId: 'record-1',
          memberDid: 'did:plc:alice',
          retainedAmount: 2,
        },
      ],
    });

    expect(parseCoopSurplusDistributions(result.distributions)).toEqual([
      {
        patronageRecordId: 'record-1',
        memberDid: 'did:plc:alice',
        transactionType: 'patronage_allocation',
        amount: 2,
        description: 'Patronage allocation for fiscal period fy-2026',
      },
    ]);
  });

  it('rejects invalid allocation values', async () => {
    const plugin = createCoopSurplusDistributorPlugin();

    await expect(
      plugin.distribute({
        cooperative: {
          authorityDid: 'did:plc:coop',
          spaceKey: 'members',
        },
        period: { id: 'fy-2026' },
        allocations: [{ memberDid: 'did:plc:alice', retainedAmount: 2 }],
      }),
    ).rejects.toThrow(CoopSurplusDistributionError);

    await expect(
      plugin.distribute({
        cooperative: {
          authorityDid: 'did:plc:coop',
          spaceKey: 'members',
        },
        period: { id: 'fy-2026' },
        allocations: [
          {
            patronageRecordId: 'record-1',
            memberDid: 'did:plc:alice',
            retainedAmount: -2,
          },
        ],
      }),
    ).rejects.toThrow(CoopSurplusDistributionError);
  });
});
