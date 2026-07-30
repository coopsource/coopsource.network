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
    expect(config.PERMISSIONED_REPO_READER_MODE).toBe('fail-closed');
    expect(config.SPACES_CONSUMER_SPACES).toBe('[]');
    expect(config.PERMISSIONED_RECORD_WRITER_MODE).toBe('private-record');
    expect(config.SPACE_MANAGING_SESSION_DIDS).toBeUndefined();
    expect(config.SPACE_MANAGING_APP_ACCESS_MODE).toBe('disabled');
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

  it('parses the draft XRPC permissioned repo reader mode', () => {
    process.env.PERMISSIONED_REPO_READER_MODE = 'draft-xrpc';
    process.env.SPACES_CONSUMER_SPACES = '[{"arbiterDid":"did:plc:coop","spaceKey":"members","expectedSpaceType":"app.example.space"}]';

    const config = loadConfig();

    expect(config.PERMISSIONED_REPO_READER_MODE).toBe('draft-xrpc');
    expect(config.SPACES_CONSUMER_SPACES).toContain('did:plc:coop');
  });

  it('parses managing session candidate DIDs', () => {
    process.env.SPACE_MANAGING_SESSION_DIDS =
      'did:plc:first, did:plc:second';

    const config = loadConfig();

    expect(config.SPACE_MANAGING_SESSION_DIDS).toBe(
      'did:plc:first, did:plc:second',
    );
  });

  it('rejects invalid permissioned record writer mode values', () => {
    process.env.PERMISSIONED_RECORD_WRITER_MODE = 'some-flag';

    expect(() => loadConfig()).toThrow();
  });

  it('requires explicit service-auth configuration for managing-app access', () => {
    process.env.SPACE_MANAGING_APP_ACCESS_MODE = 'group-directory';

    expect(() => loadConfig()).toThrow('SERVICE_AUTH_AUDIENCE_DID is required');

    process.env.SERVICE_AUTH_AUDIENCE_DID = 'did:web:csn.example#managing-app';
    expect(() => loadConfig()).toThrow(
      'SERVICE_AUTH_TRUSTED_ISSUERS is required',
    );

    process.env.SERVICE_AUTH_TRUSTED_ISSUERS = 'did:plc:coop';

    expect(loadConfig().SPACE_MANAGING_APP_ACCESS_MODE).toBe('group-directory');
  });
});
