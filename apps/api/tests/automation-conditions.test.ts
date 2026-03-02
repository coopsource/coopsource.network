import { describe, it, expect } from 'vitest';
import { evaluateConditions } from '../src/ai/triggers/condition-evaluator.js';

describe('Condition Evaluator', () => {
  it('returns true for empty conditions', () => {
    expect(evaluateConditions([], { foo: 'bar' })).toBe(true);
  });

  it('returns true for undefined conditions', () => {
    expect(evaluateConditions(undefined, { foo: 'bar' })).toBe(true);
  });

  it('evaluates eq operator', () => {
    const conditions = [{ field: 'status', operator: 'eq' as const, value: 'active' }];
    expect(evaluateConditions(conditions, { status: 'active' })).toBe(true);
    expect(evaluateConditions(conditions, { status: 'inactive' })).toBe(false);
  });

  it('evaluates neq operator', () => {
    const conditions = [{ field: 'status', operator: 'neq' as const, value: 'draft' }];
    expect(evaluateConditions(conditions, { status: 'active' })).toBe(true);
    expect(evaluateConditions(conditions, { status: 'draft' })).toBe(false);
  });

  it('evaluates contains operator (string)', () => {
    const conditions = [{ field: 'title', operator: 'contains' as const, value: 'budget' }];
    expect(evaluateConditions(conditions, { title: 'Annual budget review' })).toBe(true);
    expect(evaluateConditions(conditions, { title: 'Team meeting' })).toBe(false);
  });

  it('evaluates contains operator (array)', () => {
    const conditions = [{ field: 'tags', operator: 'contains' as const, value: 'urgent' }];
    expect(evaluateConditions(conditions, { tags: ['urgent', 'finance'] })).toBe(true);
    expect(evaluateConditions(conditions, { tags: ['routine'] })).toBe(false);
  });

  it('evaluates gt operator', () => {
    const conditions = [{ field: 'amount', operator: 'gt' as const, value: 1000 }];
    expect(evaluateConditions(conditions, { amount: 1500 })).toBe(true);
    expect(evaluateConditions(conditions, { amount: 500 })).toBe(false);
    expect(evaluateConditions(conditions, { amount: 1000 })).toBe(false);
  });

  it('evaluates lt operator', () => {
    const conditions = [{ field: 'priority', operator: 'lt' as const, value: 3 }];
    expect(evaluateConditions(conditions, { priority: 1 })).toBe(true);
    expect(evaluateConditions(conditions, { priority: 5 })).toBe(false);
  });

  it('supports dotted field paths', () => {
    const conditions = [{ field: 'proposal.status', operator: 'eq' as const, value: 'voting' }];
    expect(evaluateConditions(conditions, { proposal: { status: 'voting' } })).toBe(true);
    expect(evaluateConditions(conditions, { proposal: { status: 'draft' } })).toBe(false);
  });

  it('supports deeply nested dotted paths', () => {
    const conditions = [{ field: 'a.b.c', operator: 'eq' as const, value: 42 }];
    expect(evaluateConditions(conditions, { a: { b: { c: 42 } } })).toBe(true);
    expect(evaluateConditions(conditions, { a: { b: { c: 0 } } })).toBe(false);
  });

  it('returns false for missing dotted path', () => {
    const conditions = [{ field: 'x.y.z', operator: 'eq' as const, value: 'test' }];
    expect(evaluateConditions(conditions, { x: {} })).toBe(false);
  });

  it('applies AND logic across multiple conditions', () => {
    const conditions = [
      { field: 'status', operator: 'eq' as const, value: 'active' },
      { field: 'amount', operator: 'gt' as const, value: 100 },
    ];
    expect(evaluateConditions(conditions, { status: 'active', amount: 200 })).toBe(true);
    expect(evaluateConditions(conditions, { status: 'active', amount: 50 })).toBe(false);
    expect(evaluateConditions(conditions, { status: 'draft', amount: 200 })).toBe(false);
  });

  it('returns false for gt/lt with non-numeric values', () => {
    const conditions = [{ field: 'name', operator: 'gt' as const, value: 10 }];
    expect(evaluateConditions(conditions, { name: 'alice' })).toBe(false);
  });

  it('returns false for contains with non-string/non-array value', () => {
    const conditions = [{ field: 'count', operator: 'contains' as const, value: 'x' }];
    expect(evaluateConditions(conditions, { count: 42 })).toBe(false);
  });
});
