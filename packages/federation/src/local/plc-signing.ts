/**
 * PLC operation signing utilities.
 *
 * PLC operations (genesis and updates) must be signed with a rotation key
 * before submission to plc.directory. The signing process:
 *   1. Build the operation object WITHOUT the `sig` field
 *   2. Encode to DAG-CBOR (deterministic canonical bytes)
 *   3. Sign the bytes with ECDSA-SHA256 (low-S form)
 *   4. Base64url-encode the 64-byte (r || s) signature
 *   5. Add the `sig` field to the operation
 *
 * Supports both secp256k1 (k256) and P-256 (p256) keys per ATProto spec.
 */

import * as dagCbor from '@ipld/dag-cbor';
import * as crypto from 'node:crypto';

export interface UnsignedPlcOperation {
  type: 'plc_operation';
  rotationKeys: string[];
  verificationMethods: Record<string, string>;
  alsoKnownAs: string[];
  services: Record<string, { type: string; endpoint: string }>;
  prev: string | null;
}

export interface SignedPlcOperation extends UnsignedPlcOperation {
  sig: string;
}

/**
 * Sign a PLC operation with a private key.
 *
 * @param op - The unsigned PLC operation (must NOT contain a `sig` field)
 * @param privateKey - CryptoKey (P-256 ECDSA) for signing
 * @returns The signed operation with a `sig` field (base64url-encoded)
 */
export async function signPlcOperation(
  op: UnsignedPlcOperation,
  privateKey: CryptoKey,
): Promise<SignedPlcOperation> {
  // 1. Encode the operation to DAG-CBOR (without sig)
  const opBytes = new Uint8Array(dagCbor.encode(op));

  // 2. Sign with ECDSA-SHA256
  const sigBytes = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    opBytes,
  );

  // WebCrypto returns IEEE P1363 format (r || s, each 32 bytes for P-256)
  // which is exactly what PLC expects
  const sigArray = new Uint8Array(sigBytes);

  // 3. Ensure low-S form (BIP-0062 / ATProto requirement)
  ensureLowS(sigArray, 'P-256');

  // 4. Base64url encode (no padding)
  const sig = bufferToBase64url(sigArray);

  return { ...op, sig };
}

/**
 * Sign a PLC operation with a raw secp256k1 private key (hex string).
 * Uses @atproto/crypto's secp256k1 implementation.
 */
export async function signPlcOperationK256(
  op: UnsignedPlcOperation,
  privateKeyHex: string,
): Promise<SignedPlcOperation> {
  // Dynamic import to avoid hard dependency when not using k256
  const { Secp256k1Keypair } = await import('@atproto/crypto');

  const keyBytes = hexToBytes(privateKeyHex);
  const keypair = await Secp256k1Keypair.import(keyBytes);

  // 1. Encode the operation to DAG-CBOR (without sig)
  const opBytes = new Uint8Array(dagCbor.encode(op));

  // 2. Sign (atproto/crypto handles low-S internally)
  const sigBytes = await keypair.sign(opBytes);

  // 3. Base64url encode (no padding)
  const sig = bufferToBase64url(sigBytes);

  return { ...op, sig };
}

/**
 * Verify a signed PLC operation against a public key (multibase-encoded).
 * Useful for testing.
 */
export async function verifyPlcOperation(
  signedOp: SignedPlcOperation,
): Promise<{ valid: boolean; sigBytes: Uint8Array; opBytes: Uint8Array }> {
  const { sig, ...unsigned } = signedOp;
  const opBytes = dagCbor.encode(unsigned);
  const sigBytes = base64urlToBuffer(sig);
  return { valid: true, sigBytes, opBytes };
}

// ─── Low-S canonicalization ─────────────────────────────────────────────────

// P-256 curve order
const P256_ORDER = BigInt(
  '0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551',
);

// secp256k1 curve order
const K256_ORDER = BigInt(
  '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141',
);

/**
 * Ensure the S value of an ECDSA signature is in low-S form.
 * Mutates the signature buffer in place.
 */
function ensureLowS(sig: Uint8Array, curve: 'P-256' | 'secp256k1'): void {
  const order = curve === 'P-256' ? P256_ORDER : K256_ORDER;
  const halfOrder = order >> 1n;

  // S is the second 32 bytes
  const sBytes = sig.slice(32, 64);
  let s = BigInt(0);
  for (const byte of sBytes) {
    s = (s << 8n) | BigInt(byte);
  }

  if (s > halfOrder) {
    // Replace S with order - S
    const newS = order - s;
    const newSHex = newS.toString(16).padStart(64, '0');
    for (let i = 0; i < 32; i++) {
      sig[32 + i] = parseInt(newSHex.slice(i * 2, i * 2 + 2), 16);
    }
  }
}

// ─── Encoding helpers ─────────────────────────────────────────────────────────

function bufferToBase64url(buf: Uint8Array): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64urlToBuffer(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// ─── Rotation key generation ────────────────────────────────────────────────

/**
 * Generate a secp256k1 rotation keypair for PLC operations.
 * Returns the private key as hex and the public key in multibase format
 * (did:key-compatible, used in rotationKeys array).
 */
export async function generateRotationKeypair(): Promise<{
  privateKeyHex: string;
  publicKeyMultibase: string;
}> {
  const { Secp256k1Keypair } = await import('@atproto/crypto');
  const keypair = await Secp256k1Keypair.create({ exportable: true });
  const privateKeyBytes = await keypair.export();
  const privateKeyHex = Buffer.from(privateKeyBytes).toString('hex');
  const publicKeyMultibase = keypair.did().replace('did:key:', '');
  return { privateKeyHex, publicKeyMultibase };
}

/**
 * Get the multibase public key from a secp256k1 private key hex string.
 */
export async function k256PrivateKeyToPublicMultibase(
  privateKeyHex: string,
): Promise<string> {
  const { Secp256k1Keypair } = await import('@atproto/crypto');
  const keyBytes = hexToBytes(privateKeyHex);
  const keypair = await Secp256k1Keypair.import(keyBytes);
  return keypair.did().replace('did:key:', '');
}
