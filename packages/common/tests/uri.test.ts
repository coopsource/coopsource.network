import { describe, it, expect } from 'vitest';
import { encodeAtUri, decodeAtUri, extractRkey, buildAtUri } from '../src/uri.js';

describe('uri utilities', () => {
  const sampleUri = 'at://did:plc:abc123/network.coopsource.org.cooperative/3jk5xyz';

  describe('encodeAtUri / decodeAtUri', () => {
    it('round-trips an AT URI', () => {
      const encoded = encodeAtUri(sampleUri);
      expect(encoded).not.toBe(sampleUri);
      expect(decodeAtUri(encoded)).toBe(sampleUri);
    });

    it('produces URL-safe characters', () => {
      const encoded = encodeAtUri(sampleUri);
      // Should not contain characters that are problematic in URL path segments
      expect(encoded).not.toContain('/');
      expect(encoded).not.toContain(':');
    });
  });

  describe('extractRkey', () => {
    it('extracts the rkey from an AT URI', () => {
      expect(extractRkey(sampleUri)).toBe('3jk5xyz');
    });

    it('throws on an empty string', () => {
      expect(() => extractRkey('')).toThrow('Invalid AT URI');
    });
  });

  describe('buildAtUri', () => {
    it('constructs a valid AT URI', () => {
      const uri = buildAtUri('did:plc:abc123', 'network.coopsource.org.cooperative', '3jk5xyz');
      expect(uri).toBe(sampleUri);
    });
  });
});
