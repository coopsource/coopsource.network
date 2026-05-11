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
 * pulled records. The real verifier requires the upstream spec finalization
 * (Holmgren Diary 4/5; bluesky-social/atproto permissioned-data branch).
 *
 * Stage 1 ships fail-closed and test-only sketch impls behind this interface.
 */
export interface EcmhVerifier {
  readonly isSketch: boolean;
  verify(input: EcmhVerifyInput): Promise<EcmhVerifyResult>;
}

/**
 * Default sketch — FAILS CLOSED. Returns ok: false so accidental wiring into
 * a production-like context can never silently bypass digest verification.
 * Wire this as the default in dispatch glue until the real verifier exists.
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
  readonly isSketch = true;
  async verify(_input: EcmhVerifyInput): Promise<EcmhVerifyResult> {
    return { ok: false, reason: 'no-verifier-wired' };
  }
}

/**
 * Test-only — accepts every input. Never wire into production. The name carries
 * the warning; the dispatch's UNSAFE_SKIP_ECMH config flag is the only path
 * that substitutes this in for FailClosedEcmhVerifier outside of tests.
 */
export class AlwaysOkEcmhVerifier implements EcmhVerifier {
  readonly isSketch = true;
  async verify(_input: EcmhVerifyInput): Promise<EcmhVerifyResult> {
    return { ok: true };
  }
}
