import * as crypto from 'node:crypto';

/**
 * Calculate a CID-like hash for an ATProto record.
 *
 * Ideally this would use CBOR encoding + CIDv1 with dag-cbor codec,
 * matching the ATProto specification. For the local PDS stage we use
 * a SHA-256 hash of the deterministic JSON representation, prefixed
 * with 'bafyrei' to indicate a CIDv1-like identifier.
 *
 * TODO: Use @atproto/repo CID utilities when available for full compatibility.
 */
export async function calculateCid(
  record: Record<string, unknown>,
): Promise<string> {
  // Deterministic JSON: sort keys for consistency
  const json = JSON.stringify(record, Object.keys(record).sort());
  const hash = crypto.createHash('sha256').update(json).digest('hex');
  return `bafyrei${hash}`;
}

/**
 * Calculate a commit CID from a record CID and optional previous CID.
 * This represents the "commit" wrapping the record operation.
 */
export async function calculateCommitCid(
  recordCid: string,
  prevCid: string | null,
): Promise<string> {
  const input = prevCid ? `${recordCid}:${prevCid}` : recordCid;
  const hash = crypto.createHash('sha256').update(input).digest('hex');
  return `bafycom${hash}`;
}
