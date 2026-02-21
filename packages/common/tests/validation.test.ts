import { describe, it, expect } from 'vitest';
import { MoneySchema, PaginationSchema } from '../src/validation.js';

describe('MoneySchema', () => {
  it('validates a correct money object', () => {
    const result = MoneySchema.safeParse({ amount: 100.5, currency: 'USD' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.amount).toBe(100.5);
      expect(result.data.currency).toBe('USD');
    }
  });

  it('rejects negative amounts', () => {
    const result = MoneySchema.safeParse({ amount: -10, currency: 'USD' });
    expect(result.success).toBe(false);
  });

  it('rejects empty currency', () => {
    const result = MoneySchema.safeParse({ amount: 10, currency: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing fields', () => {
    expect(MoneySchema.safeParse({}).success).toBe(false);
    expect(MoneySchema.safeParse({ amount: 10 }).success).toBe(false);
  });
});

describe('PaginationSchema', () => {
  it('applies default limit', () => {
    const result = PaginationSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(25);
      expect(result.data.cursor).toBeUndefined();
    }
  });

  it('accepts valid limit and cursor', () => {
    const result = PaginationSchema.safeParse({ limit: 50, cursor: 'abc123' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
      expect(result.data.cursor).toBe('abc123');
    }
  });

  it('rejects limit above 100', () => {
    const result = PaginationSchema.safeParse({ limit: 200 });
    expect(result.success).toBe(false);
  });

  it('rejects limit below 1', () => {
    const result = PaginationSchema.safeParse({ limit: 0 });
    expect(result.success).toBe(false);
  });
});
