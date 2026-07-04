import type { PulledRecord } from './types.js';

export interface EcmhVerifyInput {
  readonly records: ReadonlyArray<PulledRecord>;
  readonly expectedDigest: string;
}

export type EcmhVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'digest-mismatch' | 'malformed-input' | 'no-verifier-wired' };

/**
 * Verifies the ECMH (Elliptic Curve Multiset Hash) digest over a batch of
 * pulled records. A correct implementation returns ok=true if and only if
 * the digest derived from the records (under the canonical encoding) equals
 * expectedDigest; returns ok=false with reason='digest-mismatch' otherwise.
 * reason='malformed-input' is reserved for records that cannot be canonically
 * encoded.
 */
export interface EcmhVerifier {
  readonly kind: 'fail-closed' | 'unsafe-always-ok' | 'real';
  verify(input: EcmhVerifyInput): Promise<EcmhVerifyResult>;
}

/**
 * Default sketch — FAILS CLOSED. Stage 1 ships this as the dispatch wiring
 * default; the real verifier requires the upstream spec finalization
 * (Holmgren Diary 4/5; bluesky-social/atproto permissioned-data branch).
 * Returns ok: false so accidental wiring into a production-like context can
 * never silently bypass digest verification.
 *
 * Research gates before a real impl:
 *   - Does @noble/curves or a sibling library expose the curve op surface
 *     ECMH needs? Or must we vendor an implementation?
 *   - What is the canonical encoding of a record for digest input?
 *   - How does the digest chain across commits? (Likely tracked per arbiter rev.)
 *
 * Surface findings to the user before committing the real implementation.
 */
export class FailClosedEcmhVerifier implements EcmhVerifier {
  readonly kind = 'fail-closed' as const;
  async verify(_input: EcmhVerifyInput): Promise<EcmhVerifyResult> {
    return { ok: false, reason: 'no-verifier-wired' };
  }
}

/**
 * Test-only — accepts every input. Never wire into production. The Unsafe
 * prefix parallels the API dispatch's
 * UNSAFE_ACCEPT_UNVERIFIED_PERMISSIONED_DATA config flag.
 *
 * @internal
 */
export class UnsafeAlwaysOkEcmhVerifier implements EcmhVerifier {
  readonly kind = 'unsafe-always-ok' as const;
  async verify(_input: EcmhVerifyInput): Promise<EcmhVerifyResult> {
    return { ok: true };
  }
}
