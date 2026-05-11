import { describe, it, expect } from 'vitest';
import { FailClosedEcmhVerifier, AlwaysOkEcmhVerifier } from '../ecmh-verifier.js';

describe('FailClosedEcmhVerifier', () => {
  it('rejects every verification by default', async () => {
    const v = new FailClosedEcmhVerifier();
    const r = await v.verify({ records: [], expectedDigest: 'abc' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('no-verifier-wired');
  });

  it('isSketch is true', () => {
    expect(new FailClosedEcmhVerifier().isSketch).toBe(true);
  });
});

describe('AlwaysOkEcmhVerifier (test-only)', () => {
  it('returns ok for any input', async () => {
    const v = new AlwaysOkEcmhVerifier();
    const r = await v.verify({ records: [], expectedDigest: 'abc' });
    expect(r.ok).toBe(true);
  });
});
