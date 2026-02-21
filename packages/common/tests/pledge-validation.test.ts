import { describe, it, expect } from 'vitest';
import { CreatePledgeSchema, PaymentStatus } from '../src/validation.js';

describe('CreatePledgeSchema', () => {
  it('accepts valid input', () => {
    const result = CreatePledgeSchema.parse({
      campaignUri: 'at://did:plc:test/network.coopsource.funding.campaign/abc123',
      amount: 5000,
    });
    expect(result.campaignUri).toBe('at://did:plc:test/network.coopsource.funding.campaign/abc123');
    expect(result.amount).toBe(5000);
    expect(result.currency).toBe('USD');
  });

  it('uses default currency when not specified', () => {
    const result = CreatePledgeSchema.parse({
      campaignUri: 'at://test',
      amount: 1000,
    });
    expect(result.currency).toBe('USD');
  });

  it('accepts custom currency', () => {
    const result = CreatePledgeSchema.parse({
      campaignUri: 'at://test',
      amount: 1000,
      currency: 'EUR',
    });
    expect(result.currency).toBe('EUR');
  });

  it('accepts optional metadata', () => {
    const result = CreatePledgeSchema.parse({
      campaignUri: 'at://test',
      amount: 1000,
      metadata: { tierIndex: 0 },
    });
    expect(result.metadata).toEqual({ tierIndex: 0 });
  });

  it('rejects amount of 0', () => {
    expect(() =>
      CreatePledgeSchema.parse({
        campaignUri: 'at://test',
        amount: 0,
      }),
    ).toThrow();
  });

  it('rejects negative amount', () => {
    expect(() =>
      CreatePledgeSchema.parse({
        campaignUri: 'at://test',
        amount: -100,
      }),
    ).toThrow();
  });

  it('rejects non-integer amount', () => {
    expect(() =>
      CreatePledgeSchema.parse({
        campaignUri: 'at://test',
        amount: 10.5,
      }),
    ).toThrow();
  });

  it('rejects missing campaignUri', () => {
    expect(() =>
      CreatePledgeSchema.parse({
        amount: 1000,
      }),
    ).toThrow();
  });

  it('rejects empty campaignUri', () => {
    expect(() =>
      CreatePledgeSchema.parse({
        campaignUri: '',
        amount: 1000,
      }),
    ).toThrow();
  });
});

describe('PaymentStatus', () => {
  it('accepts valid statuses', () => {
    expect(PaymentStatus.parse('pending')).toBe('pending');
    expect(PaymentStatus.parse('completed')).toBe('completed');
    expect(PaymentStatus.parse('failed')).toBe('failed');
    expect(PaymentStatus.parse('refunded')).toBe('refunded');
  });

  it('rejects invalid status', () => {
    expect(() => PaymentStatus.parse('processing')).toThrow();
    expect(() => PaymentStatus.parse('')).toThrow();
    expect(() => PaymentStatus.parse('cancelled')).toThrow();
  });
});
