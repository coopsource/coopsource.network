import { describe, it, expect } from 'vitest';
import {
  didWebToUrl,
  urlToDidWeb,
  buildMemberDidWeb,
  isDidWeb,
} from '../src/did-web.js';

describe('did:web utilities', () => {
  describe('didWebToUrl', () => {
    it('resolves a standard domain to .well-known/did.json', () => {
      expect(didWebToUrl('did:web:example.com')).toBe(
        'https://example.com/.well-known/did.json',
      );
    });

    it('resolves a subdomain to .well-known/did.json', () => {
      expect(didWebToUrl('did:web:acme.coopsource.network')).toBe(
        'https://acme.coopsource.network/.well-known/did.json',
      );
    });

    it('resolves path-based DID to /path/seg/did.json', () => {
      expect(didWebToUrl('did:web:example.com:path:seg')).toBe(
        'https://example.com/path/seg/did.json',
      );
    });

    it('resolves a member path-based DID', () => {
      expect(
        didWebToUrl('did:web:acme.coopsource.network:members:alice'),
      ).toBe('https://acme.coopsource.network/members/alice/did.json');
    });

    it('resolves localhost with percent-encoded port to http', () => {
      expect(didWebToUrl('did:web:localhost%3A3001')).toBe(
        'http://localhost:3001/.well-known/did.json',
      );
    });

    it('resolves localhost with port and path segments', () => {
      expect(
        didWebToUrl('did:web:localhost%3A3001:members:bob'),
      ).toBe('http://localhost:3001/members/bob/did.json');
    });

    it('resolves an IP address to http', () => {
      expect(didWebToUrl('did:web:127.0.0.1%3A8080')).toBe(
        'http://127.0.0.1:8080/.well-known/did.json',
      );
    });

    it('throws on invalid DID (not did:web)', () => {
      expect(() => didWebToUrl('did:plc:abc123')).toThrow(
        'Invalid did:web identifier',
      );
    });

    it('throws on empty did:web', () => {
      expect(() => didWebToUrl('did:web:')).toThrow(
        'Invalid did:web identifier',
      );
    });

    it('throws on completely invalid string', () => {
      expect(() => didWebToUrl('not-a-did')).toThrow(
        'Invalid did:web identifier',
      );
    });
  });

  describe('urlToDidWeb', () => {
    it('converts a standard https URL', () => {
      expect(urlToDidWeb('https://example.com')).toBe('did:web:example.com');
    });

    it('converts a subdomain URL', () => {
      expect(urlToDidWeb('https://acme.coopsource.network')).toBe(
        'did:web:acme.coopsource.network',
      );
    });

    it('percent-encodes the port for localhost', () => {
      expect(urlToDidWeb('http://localhost:3001')).toBe(
        'did:web:localhost%3A3001',
      );
    });

    it('percent-encodes the port for an IP address', () => {
      expect(urlToDidWeb('http://127.0.0.1:8080')).toBe(
        'did:web:127.0.0.1%3A8080',
      );
    });

    it('converts a URL with path segments', () => {
      expect(urlToDidWeb('https://example.com/path/to')).toBe(
        'did:web:example.com:path:to',
      );
    });

    it('strips trailing slashes from the URL', () => {
      expect(urlToDidWeb('https://example.com/')).toBe('did:web:example.com');
    });

    it('strips trailing slashes from URLs with paths', () => {
      expect(urlToDidWeb('https://example.com/path/to/')).toBe(
        'did:web:example.com:path:to',
      );
    });
  });

  describe('round-trip: urlToDidWeb -> didWebToUrl', () => {
    it('round-trips a standard domain', () => {
      const url = 'https://example.com';
      const did = urlToDidWeb(url);
      const resolved = didWebToUrl(did);
      expect(resolved).toBe('https://example.com/.well-known/did.json');
    });

    it('round-trips localhost with port', () => {
      const url = 'http://localhost:3001';
      const did = urlToDidWeb(url);
      expect(did).toBe('did:web:localhost%3A3001');
      const resolved = didWebToUrl(did);
      expect(resolved).toBe('http://localhost:3001/.well-known/did.json');
    });

    it('round-trips a URL with path segments', () => {
      const url = 'https://example.com/users/alice';
      const did = urlToDidWeb(url);
      expect(did).toBe('did:web:example.com:users:alice');
      const resolved = didWebToUrl(did);
      expect(resolved).toBe('https://example.com/users/alice/did.json');
    });
  });

  describe('buildMemberDidWeb', () => {
    it('builds a member DID for a standard domain', () => {
      expect(
        buildMemberDidWeb('https://acme.coopsource.network', 'alice'),
      ).toBe('did:web:acme.coopsource.network:members:alice');
    });

    it('builds a member DID for localhost with port', () => {
      expect(buildMemberDidWeb('http://localhost:3001', 'bob')).toBe(
        'did:web:localhost%3A3001:members:bob',
      );
    });

    it('resolves the member DID to the correct URL', () => {
      const did = buildMemberDidWeb(
        'https://acme.coopsource.network',
        'alice',
      );
      expect(didWebToUrl(did)).toBe(
        'https://acme.coopsource.network/members/alice/did.json',
      );
    });

    it('handles handles with special characters', () => {
      const did = buildMemberDidWeb('https://example.com', 'user-name.test');
      expect(did).toBe('did:web:example.com:members:user-name.test');
    });

    it('strips trailing slashes from instance URL', () => {
      expect(
        buildMemberDidWeb('https://acme.coopsource.network/', 'alice'),
      ).toBe('did:web:acme.coopsource.network:members:alice');
    });
  });

  describe('isDidWeb', () => {
    it('returns true for a valid did:web', () => {
      expect(isDidWeb('did:web:example.com')).toBe(true);
    });

    it('returns true for a path-based did:web', () => {
      expect(isDidWeb('did:web:example.com:members:alice')).toBe(true);
    });

    it('returns true for did:web with percent-encoded port', () => {
      expect(isDidWeb('did:web:localhost%3A3001')).toBe(true);
    });

    it('returns false for did:plc', () => {
      expect(isDidWeb('did:plc:abc123')).toBe(false);
    });

    it('returns false for did:key', () => {
      expect(isDidWeb('did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK')).toBe(
        false,
      );
    });

    it('returns false for empty did:web prefix', () => {
      expect(isDidWeb('did:web:')).toBe(false);
    });

    it('returns false for arbitrary strings', () => {
      expect(isDidWeb('not-a-did')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isDidWeb('')).toBe(false);
    });
  });
});
