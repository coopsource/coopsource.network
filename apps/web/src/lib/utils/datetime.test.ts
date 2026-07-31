import { describe, expect, it } from 'vitest';
import { isoDateTimeToLocalInput, localDateTimeToIso } from './datetime.js';

describe('proposal datetime conversion', () => {
  it('converts a browser-local value to an ISO instant with its UTC offset', () => {
    expect(localDateTimeToIso('2030-06-15T12:30', 420)).toBe(
      '2030-06-15T19:30:00.000Z',
    );
    expect(localDateTimeToIso('2030-12-15T12:30', -60)).toBe(
      '2030-12-15T11:30:00.000Z',
    );
  });

  it('round-trips an ISO instant into a datetime-local value', () => {
    expect(isoDateTimeToLocalInput('2030-06-15T19:30:00.000Z', 420)).toBe(
      '2030-06-15T12:30',
    );
    expect(isoDateTimeToLocalInput('2030-12-15T11:30:00.000Z', -60)).toBe(
      '2030-12-15T12:30',
    );
  });

  it('rejects malformed and impossible values', () => {
    expect(localDateTimeToIso('2030-02-30T12:30', 0)).toBe('');
    expect(localDateTimeToIso('not-a-date', 0)).toBe('');
    expect(isoDateTimeToLocalInput('not-a-date', 0)).toBe('');
  });
});
