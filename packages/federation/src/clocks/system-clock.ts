import type { IClock } from '../interfaces/clock.js';

export class SystemClock implements IClock {
  now(): Date {
    return new Date();
  }
  nowIso(): string {
    return this.now().toISOString();
  }
  nowMs(): number {
    return this.now().getTime();
  }
}
