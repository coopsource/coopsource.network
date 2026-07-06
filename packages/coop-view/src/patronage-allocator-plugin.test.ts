import { describe, expect, it } from 'vitest';
import {
  CoopPatronageAllocationError,
  calculateCoopPatronageAllocations,
  createCoopPatronageAllocatorPlugin,
  parseCoopPatronageAllocations,
} from './index.js';

describe('CoopPatronageAllocatorPlugin', () => {
  it('allocates surplus proportionally and splits cash versus retained amounts', async () => {
    const plugin = createCoopPatronageAllocatorPlugin();

    const result = await plugin.allocate({
      cooperative: {
        authorityDid: 'did:plc:coop',
        spaceKey: 'members',
      },
      period: { id: 'fy-2026' },
      surplus: 1000,
      policy: { cashPayoutPct: 25 },
      metrics: [
        { memberDid: 'did:plc:alice', metricValue: 60 },
        {
          memberDid: 'did:plc:bob',
          metricValue: 40,
          stakeholderClass: 'worker',
        },
      ],
    });

    expect(result.allocations).toEqual([
      {
        memberDid: 'did:plc:alice',
        stakeholderClass: null,
        metricValue: 60,
        patronageRatio: 0.6,
        totalAllocation: 600,
        cashAmount: 150,
        retainedAmount: 450,
      },
      {
        memberDid: 'did:plc:bob',
        stakeholderClass: 'worker',
        metricValue: 40,
        patronageRatio: 0.4,
        totalAllocation: 400,
        cashAmount: 100,
        retainedAmount: 300,
      },
    ]);
  });

  it('uses the current default cash payout percentage', () => {
    expect(
      calculateCoopPatronageAllocations({
        surplus: 333.33,
        metrics: [
          { memberDid: 'did:plc:alice', metricValue: 1 },
          { memberDid: 'did:plc:bob', metricValue: 2 },
        ],
      }),
    ).toEqual([
      {
        memberDid: 'did:plc:alice',
        stakeholderClass: null,
        metricValue: 1,
        patronageRatio: 1 / 3,
        totalAllocation: 111.11,
        cashAmount: 22.22,
        retainedAmount: 88.89,
      },
      {
        memberDid: 'did:plc:bob',
        stakeholderClass: null,
        metricValue: 2,
        patronageRatio: 2 / 3,
        totalAllocation: 222.22,
        cashAmount: 44.44,
        retainedAmount: 177.78,
      },
    ]);
  });

  it('rejects zero total metric values', () => {
    expect(() =>
      calculateCoopPatronageAllocations({
        surplus: 100,
        metrics: [{ memberDid: 'did:plc:alice', metricValue: 0 }],
      }),
    ).toThrow(CoopPatronageAllocationError);
  });

  it('parses allocator output back to typed allocations', async () => {
    const plugin = createCoopPatronageAllocatorPlugin();
    const result = await plugin.allocate({
      cooperative: {
        authorityDid: 'did:plc:coop',
        spaceKey: 'members',
      },
      period: { id: 'fy-2026' },
      surplus: 10,
      metrics: [{ memberDid: 'did:plc:alice', metricValue: 1 }],
    });

    expect(parseCoopPatronageAllocations(result.allocations)).toEqual([
      {
        memberDid: 'did:plc:alice',
        stakeholderClass: null,
        metricValue: 1,
        patronageRatio: 1,
        totalAllocation: 10,
        cashAmount: 2,
        retainedAmount: 8,
      },
    ]);
  });
});
