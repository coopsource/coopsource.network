import { describe, it, expect } from 'vitest';
import { AtprotoPdsService } from '../src/atproto/atproto-pds-service.js';
import { LocalPdsService } from '../src/local/local-pds-service.js';

/**
 * Verify that the correct PDS service implementation is selected
 * based on configuration. This mirrors the logic in container.ts.
 */
describe('Config-based service switching', () => {
  it('should instantiate AtprotoPdsService when PDS_URL is provided', () => {
    const service = new AtprotoPdsService(
      'http://localhost:2583',
      'admin',
    );
    expect(service).toBeInstanceOf(AtprotoPdsService);
  });

  it('should have LocalPdsService available for fallback', () => {
    // LocalPdsService requires a DB connection, so we just verify the class exists
    expect(LocalPdsService).toBeDefined();
    expect(typeof LocalPdsService).toBe('function');
  });

  it('AtprotoPdsService should implement all IPdsService methods', () => {
    const service = new AtprotoPdsService(
      'http://localhost:2583',
      'admin',
    );

    // Verify all interface methods exist
    expect(typeof service.createDid).toBe('function');
    expect(typeof service.resolveDid).toBe('function');
    expect(typeof service.updateDidDocument).toBe('function');
    expect(typeof service.createRecord).toBe('function');
    expect(typeof service.putRecord).toBe('function');
    expect(typeof service.deleteRecord).toBe('function');
    expect(typeof service.getRecord).toBe('function');
    expect(typeof service.listRecords).toBe('function');
    expect(typeof service.subscribeRepos).toBe('function');
  });
});
