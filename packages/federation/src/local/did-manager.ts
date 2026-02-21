import * as crypto from 'node:crypto';

/** Minimal JWK type for ES256 (P-256) keys used in DID operations. */
export interface JwkKey {
  kty?: string;
  crv?: string;
  x?: string;
  y?: string;
  d?: string;
  kid?: string;
  use?: string;
  key_ops?: string[];
  alg?: string;
  ext?: boolean;
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * @param plaintext - The string to encrypt
 * @param keyBase64 - 32-byte key encoded as base64
 * @returns base64-encoded string: iv (12 bytes) + authTag (16 bytes) + ciphertext
 */
export async function encryptKey(
  plaintext: string,
  keyBase64: string,
): Promise<string> {
  const key = Buffer.from(keyBase64, 'base64');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Concatenate: iv + authTag + ciphertext
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

/**
 * Decrypt a string encrypted with encryptKey.
 * @param encrypted - base64-encoded string from encryptKey
 * @param keyBase64 - same 32-byte key used for encryption
 */
export async function decryptKey(
  encrypted: string,
  keyBase64: string,
): Promise<string> {
  const key = Buffer.from(keyBase64, 'base64');
  const buf = Buffer.from(encrypted, 'base64');

  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

/**
 * Generate an ES256 (P-256 / secp256r1) keypair using WebCrypto.
 * @returns Both public and private keys as JWK objects
 */
export async function generateKeyPair(): Promise<{
  publicJwk: JwkKey;
  privateJwk: JwkKey;
}> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );

  const [publicJwk, privateJwk] = (await Promise.all([
    crypto.subtle.exportKey('jwk', keyPair.publicKey),
    crypto.subtle.exportKey('jwk', keyPair.privateKey),
  ])) as [JwkKey, JwkKey];

  return { publicJwk, privateJwk };
}

/**
 * Convert a P-256 public key JWK to a multibase-encoded string for DID documents.
 * Format: 'z' prefix + base58btc encoding of the compressed public key bytes.
 *
 * For P-256, the compressed form is: 0x02 or 0x03 prefix byte + 32-byte x coordinate.
 * The prefix byte is 0x02 if y is even, 0x03 if y is odd.
 *
 * We also prepend the multicodec varint for P-256 public key (0x1200).
 */
export function publicJwkToMultibase(jwk: JwkKey): string {
  if (!jwk.x || !jwk.y) {
    throw new Error('JWK must have x and y coordinates');
  }

  const x = Buffer.from(jwk.x, 'base64url');
  const y = Buffer.from(jwk.y, 'base64url');

  // Compressed point: prefix 0x02 if y is even, 0x03 if y is odd
  const prefix = y[y.length - 1]! % 2 === 0 ? 0x02 : 0x03;

  // Multicodec varint for p256-pub (0x1200) = [0x80, 0x24]
  const multicodec = Buffer.from([0x80, 0x24]);
  const compressedKey = Buffer.concat([
    multicodec,
    Buffer.from([prefix]),
    x,
  ]);

  // Base58btc encoding with 'z' prefix (multibase)
  return 'z' + base58btcEncode(compressedKey);
}

// Simple base58btc encoder (Bitcoin alphabet)
const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58btcEncode(buf: Buffer): string {
  // Count leading zeros
  let leadingZeros = 0;
  for (const byte of buf) {
    if (byte === 0) leadingZeros++;
    else break;
  }

  // Convert to BigInt
  let num = 0n;
  for (const byte of buf) {
    num = num * 256n + BigInt(byte);
  }

  // Encode
  let encoded = '';
  while (num > 0n) {
    const remainder = Number(num % 58n);
    num = num / 58n;
    encoded = BASE58_ALPHABET[remainder] + encoded;
  }

  // Add leading '1's for leading zero bytes
  return '1'.repeat(leadingZeros) + encoded;
}
