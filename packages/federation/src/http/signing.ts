/**
 * HTTP Message Signatures (RFC 9421) implementation.
 *
 * Signs outbound requests and verifies inbound requests using ECDSA P-256
 * with SHA-256 (algorithm identifier: ecdsa-p256-sha256).
 *
 * Uses Node.js built-in crypto.subtle for all cryptographic operations.
 * Uses structured-headers for RFC 8941/9651 serialization.
 */

import type { DidWebResolver } from './did-web-resolver.js';

const COVERED_COMPONENTS_WITH_BODY = [
  '@method',
  '@target-uri',
  'content-type',
  'content-digest',
];

const COVERED_COMPONENTS_NO_BODY = ['@method', '@target-uri'];

const MAX_CLOCK_SKEW_SECONDS = 300; // 5 minutes

// ── Content-Digest ──

export async function createContentDigest(body: string): Promise<string> {
  const bodyBytes = new TextEncoder().encode(body);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bodyBytes);
  const hashBase64 = Buffer.from(hashBuffer).toString('base64');
  return `sha-256=:${hashBase64}:`;
}

export async function verifyContentDigest(
  body: string,
  digestHeader: string,
): Promise<boolean> {
  const expected = await createContentDigest(body);
  return expected === digestHeader;
}

// ── Signature Base ──

function buildSignatureBase(
  method: string,
  targetUri: string,
  headers: Record<string, string>,
  components: string[],
): string {
  const lines: string[] = [];
  for (const component of components) {
    if (component === '@method') {
      lines.push(`"@method": ${method.toUpperCase()}`);
    } else if (component === '@target-uri') {
      lines.push(`"@target-uri": ${targetUri}`);
    } else {
      const value = headers[component.toLowerCase()] ?? '';
      lines.push(`"${component}": ${value}`);
    }
  }
  return lines.join('\n') + '\n';
}

function formatComponentList(components: string[]): string {
  return '(' + components.map((c) => `"${c}"`).join(' ') + ')';
}

// ── Sign Outbound Request ──

export async function signRequest(
  method: string,
  targetUri: string,
  headers: Record<string, string>,
  body: string | null,
  signingKey: CryptoKey,
  keyId: string,
): Promise<{
  'Signature-Input': string;
  Signature: string;
  'Content-Digest'?: string;
}> {
  const result: Record<string, string> = {};

  // 1. Compute Content-Digest for requests with body
  if (body) {
    const contentDigest = await createContentDigest(body);
    result['Content-Digest'] = contentDigest;
    headers['content-digest'] = contentDigest;
  }

  const components = body
    ? COVERED_COMPONENTS_WITH_BODY
    : COVERED_COMPONENTS_NO_BODY;

  const created = Math.floor(Date.now() / 1000);

  // 2. Build signature params
  const signatureParams = `${formatComponentList(components)};keyid="${keyId}";alg="ecdsa-p256-sha256";created=${created}`;

  // 3. Build signature base
  const base =
    buildSignatureBase(method, targetUri, headers, components) +
    `"@signature-params": ${signatureParams}`;

  // 4. Sign with ECDSA P-256 / SHA-256
  const baseBytes = new TextEncoder().encode(base);
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signingKey,
    baseBytes,
  );
  const sigBase64 = Buffer.from(signature).toString('base64');

  result['Signature-Input'] = `sig=${signatureParams}`;
  result['Signature'] = `sig=:${sigBase64}:`;

  return result as {
    'Signature-Input': string;
    Signature: string;
    'Content-Digest'?: string;
  };
}

// ── Verify Inbound Request ──

export async function verifyRequest(
  method: string,
  targetUri: string,
  headers: Record<string, string>,
  body: string | null,
  didResolver: DidWebResolver,
): Promise<{ verified: boolean; signerDid: string }> {
  const fail = { verified: false, signerDid: '' };

  // 1. Parse Signature-Input header
  const sigInputRaw = headers['signature-input'];
  if (!sigInputRaw) return fail;

  const sigRaw = headers['signature'];
  if (!sigRaw) return fail;

  // Parse: sig=("@method" "@target-uri" ...);keyid="...";alg="...";created=N
  const parsed = parseSignatureInput(sigInputRaw);
  if (!parsed) return fail;

  const { components, keyid, alg, created } = parsed;

  // 2. Check algorithm
  if (alg !== 'ecdsa-p256-sha256') return fail;

  // 3. Anti-replay: check created timestamp
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - created) > MAX_CLOCK_SKEW_SECONDS) return fail;

  // 4. Verify Content-Digest if body present
  if (body && components.includes('content-digest')) {
    const digestHeader = headers['content-digest'];
    if (!digestHeader) return fail;
    const digestValid = await verifyContentDigest(body, digestHeader);
    if (!digestValid) return fail;
  }

  // 5. Resolve DID from keyid (e.g. "did:web:example.com#signingKey" → "did:web:example.com")
  const signerDid = keyid.split('#')[0]!;

  let doc;
  try {
    doc = await didResolver.resolve(signerDid);
  } catch {
    return fail;
  }

  // 6. Extract public key from DID document
  const vm = doc.verificationMethod.find((v) => v.id === keyid);
  if (!vm?.publicKeyJwk) return fail;

  // 7. Import public key
  let publicKey: CryptoKey;
  try {
    publicKey = await crypto.subtle.importKey(
      'jwk',
      vm.publicKeyJwk as Record<string, unknown>,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
  } catch {
    return fail;
  }

  // 8. Reconstruct signature base
  const signatureParams = `${formatComponentList(components)};keyid="${keyid}";alg="${alg}";created=${created}`;
  const base =
    buildSignatureBase(method, targetUri, headers, components) +
    `"@signature-params": ${signatureParams}`;

  // 9. Extract and decode signature
  const sigMatch = sigRaw.match(/^sig=:([A-Za-z0-9+/=]+):$/);
  if (!sigMatch) return fail;
  const signatureBytes = Buffer.from(sigMatch[1]!, 'base64');

  // 10. Verify
  const baseBytes = new TextEncoder().encode(base);
  const verified = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publicKey,
    signatureBytes,
    baseBytes,
  );

  return { verified, signerDid };
}

// ── Helpers ──

function parseSignatureInput(
  raw: string,
): {
  components: string[];
  keyid: string;
  alg: string;
  created: number;
} | null {
  // Format: sig=("@method" "@target-uri" "content-type" "content-digest");keyid="...";alg="...";created=N
  const match = raw.match(
    /^sig=\(([^)]*)\);keyid="([^"]+)";alg="([^"]+)";created=(\d+)$/,
  );
  if (!match) return null;

  const componentStr = match[1]!;
  const components = componentStr
    .split(' ')
    .map((c) => c.replace(/"/g, ''))
    .filter((c) => c.length > 0);

  return {
    components,
    keyid: match[2]!,
    alg: match[3]!,
    created: parseInt(match[4]!, 10),
  };
}
