/**
 * Commit signature verifier for ATProto.
 *
 * Verifies ECDSA signatures (P-256 and secp256k1) on commit nodes by
 * resolving the DID document and extracting the signing key.
 *
 * Includes an in-memory LRU cache for DID documents to avoid repeated
 * HTTP resolution during high-volume firehose consumption.
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

// ─── DID Document Cache ─────────────────────────────────────────────────────

interface CacheEntry {
  doc: DidDocument;
  cachedAt: number;
}

const DID_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX_SIZE = 1000;

function getCachedDidDoc(did: string): DidDocument | undefined {
  const entry = DID_CACHE.get(did);
  if (!entry) return undefined;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    DID_CACHE.delete(did);
    return undefined;
  }
  return entry.doc;
}

function setCachedDidDoc(did: string, doc: DidDocument): void {
  // Evict oldest entries if cache is full
  if (DID_CACHE.size >= CACHE_MAX_SIZE) {
    const oldest = DID_CACHE.keys().next().value;
    if (oldest) DID_CACHE.delete(oldest);
  }
  DID_CACHE.set(did, { doc, cachedAt: Date.now() });
}

/** Exported for testing — clears the DID document cache. */
export function clearDidCache(): void {
  DID_CACHE.clear();
}

// ─── DID Resolution ─────────────────────────────────────────────────────────

async function defaultResolveDid(did: DID): Promise<DidDocument> {
  // Check cache first
  const cached = getCachedDidDoc(did);
  if (cached) return cached;

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
  const doc = (await res.json()) as DidDocument;
  setCachedDidDoc(did, doc);
  return doc;
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

    if (vm.publicKeyMultibase) {
      const keyOrVerifier = await importMultibaseKey(vm.publicKeyMultibase);

      if ('verify' in keyOrVerifier && typeof keyOrVerifier.verify === 'function') {
        // secp256k1 key — use @atproto/crypto verifier
        const valid = await keyOrVerifier.verify(
          new Uint8Array(data.signedBytes),
          new Uint8Array(data.sig),
        );
        return valid;
      }

      // P-256 CryptoKey — use WebCrypto
      const valid = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        keyOrVerifier as CryptoKey,
        new Uint8Array(data.sig) as unknown as ArrayBuffer,
        new Uint8Array(data.signedBytes) as unknown as ArrayBuffer,
      );
      return valid;
    }

    if (vm.publicKeyJwk) {
      const publicKey = await crypto.subtle.importKey(
        'jwk',
        vm.publicKeyJwk as crypto.webcrypto.JsonWebKey,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify'],
      );
      const valid = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        publicKey,
        new Uint8Array(data.sig) as unknown as ArrayBuffer,
        new Uint8Array(data.signedBytes) as unknown as ArrayBuffer,
      );
      return valid;
    }

    logger.warn({ did: data.did }, 'No usable public key in DID verification method');
    return false;
  } catch (err) {
    logger.warn({ err, did: data.did }, 'Commit signature verification error');
    return false;
  }
}

interface K256Verifier {
  verify(data: Uint8Array, sig: Uint8Array): Promise<boolean>;
}

/**
 * Import a public key from multibase (base58btc) encoding.
 * Returns a CryptoKey for P-256 or a K256Verifier for secp256k1.
 * Format: 'z' + base58btc(multicodec_varint + compressed_point)
 */
async function importMultibaseKey(multibase: string): Promise<CryptoKey | K256Verifier> {
  if (!multibase.startsWith('z')) {
    throw new Error('Only base58btc multibase (z prefix) is supported');
  }

  const decoded = base58btcDecode(multibase.slice(1));

  // Detect secp256k1 (k256) keys — multicodec prefix 0xe7, 0x01
  if (decoded.length >= 2 && decoded[0] === 0xe7 && decoded[1] === 0x01) {
    return importK256MultibaseKey(decoded.slice(2));
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
 * Import a secp256k1 public key using @atproto/crypto.
 * Returns a verifier object with a verify() method.
 */
async function importK256MultibaseKey(compressedKey: Uint8Array): Promise<K256Verifier> {
  const { verifySignature, SECP256K1_DID_PREFIX } = await import('@atproto/crypto');

  // Reconstruct the did:key format that @atproto/crypto expects
  // did:key: + multibase('z' + base58btc(multicodec_k256 + compressed_key))
  // The compressedKey already has the multicodec prefix stripped, so re-add it
  const prefixed = new Uint8Array(2 + compressedKey.length);
  prefixed[0] = 0xe7; // secp256k1 multicodec
  prefixed[1] = 0x01;
  prefixed.set(compressedKey, 2);

  return {
    async verify(data: Uint8Array, sig: Uint8Array): Promise<boolean> {
      try {
        // @atproto/crypto verifySignature takes did:key and handles the rest
        const didKey = `did:key:z${base58btcEncode(prefixed)}`;
        return await verifySignature(didKey, data, sig);
      } catch {
        return false;
      }
    },
  };
}

function base58btcEncode(buf: Uint8Array): string {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let leadingZeros = 0;
  for (const byte of buf) {
    if (byte === 0) leadingZeros++;
    else break;
  }
  let num = 0n;
  for (const byte of buf) {
    num = num * 256n + BigInt(byte);
  }
  let encoded = '';
  while (num > 0n) {
    const remainder = Number(num % 58n);
    num = num / 58n;
    encoded = ALPHABET[remainder] + encoded;
  }
  return '1'.repeat(leadingZeros) + encoded;
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
