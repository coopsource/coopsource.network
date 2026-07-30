import { describe, it, expect } from 'vitest';
import {
  AcceptInvitationSchema,
  MoneySchema,
  PaginationSchema,
  RegisterSchema,
} from '../src/validation.js';

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

describe('RegisterSchema', () => {
  it('requires and trims the account handle', () => {
    const result = RegisterSchema.safeParse({
      email: 'new-user@example.com',
      password: 'password123',
      displayName: 'New User',
      handle: '  new-user  ',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.handle).toBe('new-user');
    }
  });

  it('rejects a missing, blank, or oversized account handle', () => {
    expect(
      RegisterSchema.safeParse({
        email: 'new-user@example.com',
        password: 'password123',
        displayName: 'New User',
      }).success,
    ).toBe(false);

    expect(
      RegisterSchema.safeParse({
        email: 'new-user@example.com',
        password: 'password123',
        displayName: 'New User',
        handle: '   ',
      }).success,
    ).toBe(false);

    expect(
      RegisterSchema.safeParse({
        email: 'new-user@example.com',
        password: 'password123',
        displayName: 'New User',
        handle: 'x'.repeat(256),
      }).success,
    ).toBe(false);
  });
});

describe('AcceptInvitationSchema', () => {
  it('uses the same account handle constraints when a handle is supplied', () => {
    const result = AcceptInvitationSchema.safeParse({
      email: 'invitee@example.com',
      password: 'password123',
      displayName: 'Invitee',
      handle: '  invitee  ',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.handle).toBe('invitee');
    }

    expect(
      AcceptInvitationSchema.safeParse({
        email: 'invitee@example.com',
        password: 'password123',
        displayName: 'Invitee',
        handle: '   ',
      }).success,
    ).toBe(false);
  });
});
