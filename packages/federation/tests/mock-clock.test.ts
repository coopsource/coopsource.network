import { describe, it, expect } from 'vitest';
import { MockClock } from '../src/clocks/mock-clock.js';

describe('MockClock', () => {
  it('returns fixed initial time', () => {
    const clock = new MockClock('2026-01-01T00:00:00.000Z');
    expect(clock.nowIso()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('advances time correctly', () => {
    const clock = new MockClock('2026-01-01T00:00:00.000Z');
    clock.advance(1000);
    expect(clock.nowMs()).toBe(
      new Date('2026-01-01T00:00:01.000Z').getTime(),
    );
  });

  it('set() jumps to specific time', () => {
    const clock = new MockClock();
    clock.set('2030-06-15T12:00:00.000Z');
    expect(clock.nowIso()).toBe('2030-06-15T12:00:00.000Z');
  });

  it('now() returns a copy, not a reference', () => {
    const clock = new MockClock('2026-01-01T00:00:00.000Z');
    const a = clock.now();
    const b = clock.now();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });

  it('uses default time when no initial provided', () => {
    const clock = new MockClock();
    expect(clock.nowIso()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('accepts Date object as initial time', () => {
    const date = new Date('2025-06-01T08:30:00.000Z');
    const clock = new MockClock(date);
    expect(clock.nowIso()).toBe('2025-06-01T08:30:00.000Z');
  });
});
