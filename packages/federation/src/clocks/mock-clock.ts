import type { IClock } from '../interfaces/clock.js';

export class MockClock implements IClock {
  private _time: Date;

  constructor(initial?: Date | string) {
    this._time = initial
      ? new Date(initial)
      : new Date('2026-01-01T00:00:00.000Z');
  }

  now(): Date {
    return new Date(this._time);
  }
  nowIso(): string {
    return this._time.toISOString();
  }
  nowMs(): number {
    return this._time.getTime();
  }

  advance(ms: number): void {
    this._time = new Date(this._time.getTime() + ms);
  }

  set(time: Date | string): void {
    this._time = new Date(time);
  }
}
