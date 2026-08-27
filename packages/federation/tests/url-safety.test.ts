import { describe, it, expect } from 'vitest';
import {
  isPrivateAddress,
  assertSafeUrl,
  safeFetchJson,
  BlockedAddressError,
} from '../src/http/url-safety.js';

/**
 * Audit S-08 — outbound fetches must not be steerable at internal addresses.
 *
 * The address table is the point of this file: the prior implementation
 * compared hostnames against a handful of exact strings, which missed every
 * IPv6 form (URL.hostname keeps the brackets, so `hostname === '::1'` can never
 * match) and all but one address of each private range.
 */

const PRIVATE_V4 = [
  '0.0.0.0',
  '0.1.2.3',
  '10.0.0.1',
  '10.255.255.255',
  '100.64.0.1',
  '100.127.255.255',
  '127.0.0.1',
  '127.0.0.2',
  '127.5.5.5',
  '169.254.1.1',
  '169.254.169.254',
  '172.16.0.1',
  '172.31.255.255',
  '192.0.0.1',
  '192.168.1.1',
  '198.18.0.1',
  '198.19.255.255',
  '224.0.0.1',
  '255.255.255.255',
];

const PUBLIC_V4 = [
  '8.8.8.8',
  '1.1.1.1',
  '172.15.0.1',
  '172.32.0.1',
  '100.63.255.255',
  '100.128.0.1',
  '198.17.255.255',
  '198.20.0.1',
  '192.0.1.1',
  '223.255.255.255',
];

const PRIVATE_V6 = [
  '::',
  '::1',
  '[::1]',
  'fc00::1',
  'fd00::1',
  'FD00::1',
  'fe80::1',
  'febf::1',
  'ff02::1',
  '::ffff:127.0.0.1',
  '::ffff:10.0.0.1',
  '[::ffff:169.254.169.254]',
];

const PUBLIC_V6 = ['2001:4860:4860::8888', '2606:4700::1111', '::ffff:8.8.8.8'];

describe('isPrivateAddress (S-08)', () => {
  it.each(PRIVATE_V4)('treats IPv4 %s as private', (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(PUBLIC_V4)('treats IPv4 %s as public', (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });

  it.each(PRIVATE_V6)('treats IPv6 %s as private', (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(PUBLIC_V6)('treats IPv6 %s as public', (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });
});

describe('assertSafeUrl (S-08)', () => {
  it('accepts an ordinary https URL', () => {
    expect(assertSafeUrl('https://example.com/x').hostname).toBe('example.com');
  });

  it('rejects a non-https scheme by default', () => {
    expect(() => assertSafeUrl('http://example.com/x')).toThrow(
      BlockedAddressError,
    );
  });

  it('rejects schemes that are not http(s) even when http is allowed', () => {
    for (const raw of ['file:///etc/passwd', 'ftp://example.com/x']) {
      expect(() => assertSafeUrl(raw, { allowHttp: true })).toThrow(
        BlockedAddressError,
      );
    }
  });

  it.each([
    'https://[::1]/x',
    'https://[fd00::1]/x',
    'https://[fe80::1]/x',
    'https://[::ffff:127.0.0.1]/x',
    'https://127.0.0.2/x',
    'https://0.0.0.0/x',
    'https://169.254.1.1/x',
    'https://100.64.0.1/x',
    'https://10.0.0.1/x',
  ])('rejects %s', (raw) => {
    expect(() => assertSafeUrl(raw)).toThrow(BlockedAddressError);
  });

  it('rejects hostnames that name internal networks', () => {
    for (const raw of [
      'https://localhost/x',
      'https://foo.local/x',
      'https://metadata.google.internal/x',
    ]) {
      expect(() => assertSafeUrl(raw)).toThrow(BlockedAddressError);
    }
  });

  it('allows loopback only when explicitly permitted', () => {
    expect(() => assertSafeUrl('http://localhost:3001/x')).toThrow(
      BlockedAddressError,
    );
    expect(
      assertSafeUrl('http://localhost:3001/x', {
        allowHttp: true,
        allowLoopback: true,
      }).port,
    ).toBe('3001');
  });

  it('allowPrivate permits private targets and http, for the Docker stack', () => {
    expect(assertSafeUrl('http://coop-a:3002/x', { allowPrivate: true }).port).toBe(
      '3002',
    );
    expect(
      assertSafeUrl('http://10.0.0.1/x', { allowPrivate: true }).hostname,
    ).toBe('10.0.0.1');
  });

  it('allowPrivate still refuses a non-http scheme', () => {
    expect(() => assertSafeUrl('file:///etc/passwd', { allowPrivate: true })).toThrow(
      BlockedAddressError,
    );
  });

  it('does not let allowLoopback re-open other private ranges', () => {
    expect(() =>
      assertSafeUrl('http://169.254.169.254/x', {
        allowHttp: true,
        allowLoopback: true,
      }),
    ).toThrow(BlockedAddressError);
  });
});

describe('safeFetchJson (S-08)', () => {
  const okResponse = () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  it('rejects a host whose DNS answer is a private address', async () => {
    await expect(
      safeFetchJson('https://rebind.example/x', {
        lookup: async () => ['10.0.0.1'],
        fetchImpl: async () => okResponse(),
      }),
    ).rejects.toThrow(BlockedAddressError);
  });

  it('rejects when any DNS answer is private, not just the first', async () => {
    await expect(
      safeFetchJson('https://rebind.example/x', {
        lookup: async () => ['93.184.216.34', '127.0.0.1'],
        fetchImpl: async () => okResponse(),
      }),
    ).rejects.toThrow(BlockedAddressError);
  });

  it('fetches when every DNS answer is public', async () => {
    const body = await safeFetchJson('https://example.com/x', {
      lookup: async () => ['93.184.216.34'],
      fetchImpl: async () => okResponse(),
    });
    expect(body).toEqual({ ok: true });
  });

  it('does not follow redirects', async () => {
    await expect(
      safeFetchJson('https://example.com/x', {
        lookup: async () => ['93.184.216.34'],
        fetchImpl: async () =>
          new Response(null, {
            status: 302,
            headers: { location: 'http://169.254.169.254/latest/meta-data/' },
          }),
      }),
    ).rejects.toThrow(/redirect/i);
  });

  it('asks fetch not to follow redirects itself', async () => {
    let seen: RequestInit | undefined;
    await safeFetchJson('https://example.com/x', {
      lookup: async () => ['93.184.216.34'],
      fetchImpl: async (_url, init) => {
        seen = init;
        return okResponse();
      },
    });
    expect(seen?.redirect).toBe('manual');
    expect(seen?.signal).toBeDefined();
  });

  it('refuses a response larger than the cap', async () => {
    await expect(
      safeFetchJson('https://example.com/x', {
        lookup: async () => ['93.184.216.34'],
        maxBytes: 16,
        fetchImpl: async () =>
          new Response(JSON.stringify({ padding: 'x'.repeat(500) }), {
            status: 200,
          }),
      }),
    ).rejects.toThrow(/too large/i);
  });

  it('skips the DNS check under allowPrivate', async () => {
    let looked = false;
    const body = await safeFetchJson('http://coop-a:3002/x', {
      allowPrivate: true,
      lookup: async () => {
        looked = true;
        return ['172.18.0.3'];
      },
      fetchImpl: async () =>
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
    });
    expect(looked).toBe(false);
    expect(body).toEqual({ ok: true });
  });

  it('skips the DNS check when the host is already an IP literal', async () => {
    let looked = false;
    const body = await safeFetchJson('https://93.184.216.34/x', {
      lookup: async () => {
        looked = true;
        return [];
      },
      fetchImpl: async () => okResponse(),
    });
    expect(looked).toBe(false);
    expect(body).toEqual({ ok: true });
  });
});
