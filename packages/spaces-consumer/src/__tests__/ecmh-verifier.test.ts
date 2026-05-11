import { describe, it, expect } from 'vitest';
import { FailClosedEcmhVerifier, UnsafeAlwaysOkEcmhVerifier } from '../ecmh-verifier.js';

describe('FailClosedEcmhVerifier', () => {
  it('rejects every verification by default', async () => {
    const v = new FailClosedEcmhVerifier();
    const r = await v.verify({ records: [], expectedDigest: 'abc' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('no-verifier-wired');
  });

  it('kind is fail-closed', () => {
    expect(new FailClosedEcmhVerifier().kind).toBe('fail-closed');
  });
});

describe('UnsafeAlwaysOkEcmhVerifier (test-only)', () => {
  it('returns ok for any input', async () => {
    const v = new UnsafeAlwaysOkEcmhVerifier();
    const r = await v.verify({ records: [], expectedDigest: 'abc' });
    expect(r.ok).toBe(true);
  });

  it('kind is unsafe-always-ok', () => {
    expect(new UnsafeAlwaysOkEcmhVerifier().kind).toBe('unsafe-always-ok');
  });
});
