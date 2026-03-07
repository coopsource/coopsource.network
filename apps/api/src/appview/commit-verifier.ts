/**
 * Commit signature verifier for ATProto.
 *
 * Verifies ECDSA P-256 signatures on commit nodes by resolving the DID
 * document and extracting the signing key. Best-effort in Phase 2 —
 * logs failures but doesn't block indexing.
 */
import * as crypto from 'node:crypto';
import type { DidDocument } from '@coopsource/federation';
import type { DID } from '@coopsource/common';
import { logger } from '../middleware/logger.js';

export interface CommitSignatureData {
  did: DID;
  sig: Uint8Array;
  signedBytes: Uint8Array;
}

// Default DID resolver using plc.directory
async function defaultResolveDid(did: DID): Promise<DidDocument> {
  let url: string;
  if (did.startsWith('did:plc:')) {
    url = `https://plc.directory/${did}`;
  } else if (did.startsWith('did:web:')) {
    const host = did.replace('did:web:', '').replace(/%3A/g, ':');
    url = `https://${host}/.well-known/did.json`;
  } else {
    throw new Error(`Unsupported DID method: ${did}`);
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`DID resolution failed for ${did}: ${res.status}`);
  }
  return (await res.json()) as DidDocument;
}

/**
 * Verify an ATProto commit signature against the DID document's signing key.
 *
 * Returns true if valid, false if invalid or verification fails.
 */
export async function verifyCommitSignature(
  data: CommitSignatureData,
  resolveDid: (did: DID) => Promise<DidDocument> = defaultResolveDid,
): Promise<boolean> {
  try {
    const didDoc = await resolveDid(data.did);

    // ATProto uses the first verification method (atproto signing key)
    const vm = didDoc.verificationMethod?.[0];
    if (!vm) {
      logger.warn({ did: data.did }, 'No verification method in DID document');
      return false;
    }

    let publicKey: CryptoKey;

    if (vm.publicKeyMultibase) {
      publicKey = await importMultibaseKey(vm.publicKeyMultibase);
    } else if (vm.publicKeyJwk) {
      publicKey = await crypto.subtle.importKey(
        'jwk',
        vm.publicKeyJwk as crypto.webcrypto.JsonWebKey,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify'],
      );
    } else {
      logger.warn({ did: data.did }, 'No usable public key in DID verification method');
      return false;
    }

    // ATProto uses low-S ECDSA signatures which are raw r||s (64 bytes for P-256)
    // WebCrypto expects IEEE P1363 format which is the same as raw r||s
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      new Uint8Array(data.sig) as unknown as ArrayBuffer,
      new Uint8Array(data.signedBytes) as unknown as ArrayBuffer,
    );

    return valid;
  } catch (err) {
    logger.warn({ err, did: data.did }, 'Commit signature verification error');
    return false;
  }
}

/**
 * Import a P-256 public key from multibase (base58btc) encoding.
 * Format: 'z' + base58btc(multicodec_varint + compressed_point)
 */
async function importMultibaseKey(multibase: string): Promise<CryptoKey> {
  if (!multibase.startsWith('z')) {
    throw new Error('Only base58btc multibase (z prefix) is supported');
  }

  const decoded = base58btcDecode(multibase.slice(1));

  // Detect secp256k1 (k256) keys — not yet supported
  if (decoded.length >= 2 && decoded[0] === 0xe7 && decoded[1] === 0x01) {
    throw new Error('secp256k1 (k256) signing keys not yet supported');
  }

  // Check for P-256 multicodec prefix: 0x80, 0x24
  if (decoded.length < 2 || decoded[0] !== 0x80 || decoded[1] !== 0x24) {
    throw new Error('Expected P-256 multicodec prefix (0x80, 0x24)');
  }

  // Remaining bytes are the compressed public key (33 bytes: prefix + x)
  const compressedKey = decoded.slice(2);
  if (compressedKey.length !== 33) {
    throw new Error(`Expected 33 bytes for compressed P-256 key, got ${compressedKey.length}`);
  }

  // Decompress to uncompressed point for WebCrypto import
  const uncompressedPoint = decompressP256Point(compressedKey);

  return crypto.subtle.importKey(
    'raw',
    new Uint8Array(uncompressedPoint) as unknown as ArrayBuffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
}

/**
 * Decompress a P-256 compressed point (33 bytes) to uncompressed form (65 bytes).
 * Compressed: 0x02/0x03 + x (32 bytes)
 * Uncompressed: 0x04 + x (32 bytes) + y (32 bytes)
 */
function decompressP256Point(compressed: Uint8Array): Uint8Array {
  const prefix = compressed[0]!;
  if (prefix !== 0x02 && prefix !== 0x03) {
    throw new Error(`Invalid compressed point prefix: 0x${prefix.toString(16)}`);
  }

  const x = compressed.slice(1);

  // P-256 curve: y² = x³ - 3x + b (mod p)
  const p = BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff');
  const b = BigInt('0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b');

  const xBig = bytesToBigInt(x);
  const x3 = modPow(xBig, 3n, p);
  const ax = (p - 3n) * xBig % p;
  const rhs = (x3 + ax + b) % p;

  // Modular square root using Tonelli-Shanks (p ≡ 3 mod 4 for P-256)
  let y = modPow(rhs, (p + 1n) / 4n, p);

  // Pick the correct y based on parity
  const isEven = y % 2n === 0n;
  if ((prefix === 0x02 && !isEven) || (prefix === 0x03 && isEven)) {
    y = p - y;
  }

  const result = new Uint8Array(65);
  result[0] = 0x04;
  const xBytes = bigIntToBytes(xBig, 32);
  const yBytes = bigIntToBytes(y, 32);
  result.set(xBytes, 1);
  result.set(yBytes, 33);
  return result;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const byte of bytes) {
    result = (result << 8n) | BigInt(byte);
  }
  return result;
}

function bigIntToBytes(num: bigint, length: number): Uint8Array {
  const result = new Uint8Array(length);
  let n = num;
  for (let i = length - 1; i >= 0; i--) {
    result[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return result;
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp % 2n === 1n) {
      result = (result * base) % mod;
    }
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

// Base58btc decoder (Bitcoin alphabet)
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_MAP = new Map<string, number>();
for (let i = 0; i < BASE58_ALPHABET.length; i++) {
  BASE58_MAP.set(BASE58_ALPHABET[i]!, i);
}

function base58btcDecode(str: string): Uint8Array {
  // Count leading '1's (zeros)
  let leadingZeros = 0;
  for (const ch of str) {
    if (ch === '1') leadingZeros++;
    else break;
  }

  let num = 0n;
  for (const ch of str) {
    const val = BASE58_MAP.get(ch);
    if (val === undefined) throw new Error(`Invalid base58 character: ${ch}`);
    num = num * 58n + BigInt(val);
  }

  // Convert to bytes
  const hex = num.toString(16).padStart(2, '0');
  const bytes = new Uint8Array(Math.ceil(hex.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  // Prepend leading zeros
  const result = new Uint8Array(leadingZeros + bytes.length);
  result.set(bytes, leadingZeros);
  return result;
}
