import * as dagCbor from '@ipld/dag-cbor';
import * as crypto from 'node:crypto';
import {
  signPlcOperation,
  signPlcOperationK256,
  type UnsignedPlcOperation,
  type SignedPlcOperation,
} from './plc-signing.js';

// ─── Base32 encoding (RFC 4648, lowercase) ─────────────────────────────────

const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

function base32Encode(buf: Uint8Array): string {
  let out = '';
  let bits = 0;
  let val = 0;
  for (const byte of buf) {
    val = (val << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += BASE32_ALPHABET[(val >> bits) & 0x1f];
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(val << (5 - bits)) & 0x1f];
  }
  return out;
}

export interface PlcCreateParams {
  signingKey: string; // multibase-encoded public key
  handle: string; // e.g. alice.acme.example.com
  pdsUrl: string; // e.g. https://acme.example.com
  rotationKeys?: string[];
  labelerUrl?: string; // AppView URL for ATProto labeler service
}

export interface PlcSigningKey {
  /** 'p256' uses WebCrypto CryptoKey, 'k256' uses hex private key */
  type: 'p256' | 'k256';
  /** CryptoKey for P-256 (from WebCrypto generateKey) */
  privateKey?: CryptoKey;
  /** Hex-encoded private key for secp256k1 */
  privateKeyHex?: string;
}

/**
 * Client for interacting with a PLC directory (did-method-plc).
 * In development, this talks to a local PLC directory at localhost:2582.
 * In production, it talks to plc.directory.
 */
export class PlcClient {
  constructor(private plcUrl: string) {}

  /**
   * Create a new DID via a signed genesis operation.
   * Computes the DID from the DAG-CBOR encoding of the signed operation,
   * then POSTs to /{did} on the PLC directory.
   * @returns The created DID string (e.g. "did:plc:abc123...")
   */
  async create(
    params: PlcCreateParams,
    signingKey?: PlcSigningKey,
  ): Promise<string> {
    const rotationKeys = params.rotationKeys ?? [params.signingKey];

    const services: Record<string, { type: string; endpoint: string }> = {
      atproto_pds: {
        type: 'AtprotoPersonalDataServer',
        endpoint: params.pdsUrl,
      },
    };

    if (params.labelerUrl) {
      services.atproto_labeler = {
        type: 'AtprotoLabeler',
        endpoint: params.labelerUrl,
      };
    }

    const unsignedOp: UnsignedPlcOperation = {
      type: 'plc_operation',
      rotationKeys,
      verificationMethods: {
        atproto: params.signingKey,
      },
      alsoKnownAs: [`at://${params.handle}`],
      services,
      prev: null,
    };

    let body: UnsignedPlcOperation | SignedPlcOperation = unsignedOp;

    if (signingKey) {
      body = await this.signOperation(unsignedOp, signingKey);
    }

    // Compute the DID from the DAG-CBOR encoding of the genesis operation.
    // Algorithm: did:plc: + base32_lower(sha256(dag-cbor(signed_op)))[:24]
    const did = PlcClient.computeDid(body);

    const res = await fetch(
      `${this.plcUrl}/${encodeURIComponent(did)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => 'unknown error');
      throw new Error(`PLC create failed (${res.status}): ${text}`);
    }

    return did;
  }

  /**
   * Compute a did:plc identifier from a genesis operation using DAG-CBOR.
   * Algorithm: "did:plc:" + base32_lower(sha256(dag-cbor(op)))[0..24]
   */
  static computeDid(op: UnsignedPlcOperation | SignedPlcOperation): string {
    const bytes = dagCbor.encode(op);
    const hash = crypto.createHash('sha256').update(bytes).digest();
    return 'did:plc:' + base32Encode(hash).slice(0, 24);
  }

  /**
   * Resolve a DID to its document.
   * GET /{did} from the PLC directory.
   */
  async resolve(did: string): Promise<object> {
    const res = await fetch(`${this.plcUrl}/${encodeURIComponent(did)}`);

    if (!res.ok) {
      throw new Error(`PLC resolve failed for ${did} (${res.status})`);
    }

    return (await res.json()) as object;
  }

  /**
   * Update a DID document (rotation, handle change, etc.).
   * POST /{did} with a signed operation.
   *
   * Requires a signing key — one of the DID's current rotation keys.
   * The `prev` field must be the CID of the most recent operation.
   */
  async update(
    did: string,
    params: Partial<PlcCreateParams>,
    signingKey: PlcSigningKey | object,
    prev: string | null = null,
  ): Promise<void> {
    // Fetch the current DID document to merge updates
    const current = (await this.resolve(did)) as Record<string, unknown>;

    const unsignedOp: UnsignedPlcOperation = {
      type: 'plc_operation',
      rotationKeys: params.rotationKeys ??
        (current.rotationKeys as string[] | undefined) ?? [],
      verificationMethods: params.signingKey
        ? { atproto: params.signingKey }
        : (current.verificationMethods as Record<string, string> | undefined) ?? {},
      alsoKnownAs: params.handle
        ? [`at://${params.handle}`]
        : (current.alsoKnownAs as string[] | undefined) ?? [],
      services: params.pdsUrl
        ? {
            atproto_pds: {
              type: 'AtprotoPersonalDataServer',
              endpoint: params.pdsUrl,
            },
          }
        : (current.services as Record<string, { type: string; endpoint: string }> | undefined) ?? {},
      prev,
    };

    const isPlcSigningKey = (k: unknown): k is PlcSigningKey =>
      typeof k === 'object' && k !== null && 'type' in k &&
      ((k as PlcSigningKey).type === 'p256' || (k as PlcSigningKey).type === 'k256');

    const body = isPlcSigningKey(signingKey)
      ? await this.signOperation(unsignedOp, signingKey)
      : unsignedOp;

    const res = await fetch(
      `${this.plcUrl}/${encodeURIComponent(did)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => 'unknown error');
      throw new Error(`PLC update failed for ${did} (${res.status}): ${text}`);
    }
  }

  private async signOperation(
    op: UnsignedPlcOperation,
    key: PlcSigningKey,
  ): Promise<SignedPlcOperation> {
    if (key.type === 'p256' && key.privateKey) {
      return signPlcOperation(op, key.privateKey);
    }
    if (key.type === 'k256' && key.privateKeyHex) {
      return signPlcOperationK256(op, key.privateKeyHex);
    }
    throw new Error('PlcSigningKey must provide either privateKey (p256) or privateKeyHex (k256)');
  }
}
