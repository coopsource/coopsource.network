import * as crypto from 'node:crypto';

// ATProto TID: base32-sortable encoding of a 64-bit integer
// High 53 bits: microseconds since Unix epoch
// Low 10 bits: random clock ID
// Result: 13-char string using charset "234567abcdefghijklmnopqrstuvwxyz"

const S32_CHAR = '234567abcdefghijklmnopqrstuvwxyz';

function s32encode(i: bigint): string {
  let s = '';
  while (i > 0n) {
    const c = Number(i % 32n);
    i = i / 32n;
    s = S32_CHAR.charAt(c) + s;
  }
  // Pad to 13 chars
  while (s.length < 13) {
    s = '2' + s;
  }
  return s;
}

let lastTimestamp = 0n;

/**
 * Generate an ATProto TID (time-based identifier).
 * TIDs are 13-char base32-sortable strings encoding microsecond timestamps.
 */
export function generateTid(): string {
  // Microseconds since epoch
  let timestamp = BigInt(Date.now()) * 1000n;

  // Ensure monotonicity — if called within the same microsecond, increment
  if (timestamp <= lastTimestamp) {
    timestamp = lastTimestamp + 1n;
  }
  lastTimestamp = timestamp;

  // 10-bit random clock ID
  const clockId = BigInt(crypto.randomInt(1024));

  // Combine: timestamp in high bits, clockId in low 10 bits
  const tid = (timestamp << 10n) | clockId;

  return s32encode(tid);
}
