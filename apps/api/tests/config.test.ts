import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { NODE_ENV: 'test' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('defaults spaces consumer flags to false', () => {
    const config = loadConfig();

    expect(config.SPACES_CONSUMER_ENABLED).toBe(false);
    expect(config.UNSAFE_ACCEPT_UNVERIFIED_PERMISSIONED_DATA).toBe(false);
    expect(config.PERMISSIONED_RECORD_WRITER_MODE).toBe('private-record');
  });

  it('parses string boolean environment values explicitly', () => {
    process.env.SPACES_CONSUMER_ENABLED = 'false';
    process.env.UNSAFE_ACCEPT_UNVERIFIED_PERMISSIONED_DATA = '0';

    let config = loadConfig();
    expect(config.SPACES_CONSUMER_ENABLED).toBe(false);
    expect(config.UNSAFE_ACCEPT_UNVERIFIED_PERMISSIONED_DATA).toBe(false);

    process.env.SPACES_CONSUMER_ENABLED = 'true';
    process.env.UNSAFE_ACCEPT_UNVERIFIED_PERMISSIONED_DATA = '1';

    config = loadConfig();
    expect(config.SPACES_CONSUMER_ENABLED).toBe(true);
    expect(config.UNSAFE_ACCEPT_UNVERIFIED_PERMISSIONED_DATA).toBe(true);
  });

  it('rejects invalid boolean environment values', () => {
    process.env.SPACES_CONSUMER_ENABLED = 'definitely';

    expect(() => loadConfig()).toThrow();
  });

  it('parses permissioned record writer mode', () => {
    process.env.PERMISSIONED_RECORD_WRITER_MODE = 'draft-xrpc';

    const config = loadConfig();

    expect(config.PERMISSIONED_RECORD_WRITER_MODE).toBe('draft-xrpc');
  });

  it('rejects invalid permissioned record writer mode values', () => {
    process.env.PERMISSIONED_RECORD_WRITER_MODE = 'some-flag';

    expect(() => loadConfig()).toThrow();
  });
});
