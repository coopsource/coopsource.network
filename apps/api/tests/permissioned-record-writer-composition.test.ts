import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { XrpcPermissionedRecordWritePort } from '@coopsource/spaces-consumer';
import type { Container } from '../src/container.js';
import { createContainer } from '../src/container.js';
import { loadConfig } from '../src/config.js';
import { OAuthManagingSpaceCredentialSessionSelector } from '../src/services/oauth-managing-space-credential-session-selector.js';
import { OAuthSpaceCredentialExchangeClient } from '../src/services/oauth-space-credential-exchange-client.js';
import { OAuthSpaceDelegationTokenClient } from '../src/services/oauth-space-delegation-token-client.js';
import { PrivateRecordPermissionedWritePort } from '../src/services/private-record-permissioned-write-port.js';
import { getTestConnectionString } from './helpers/test-db.js';

describe('permissioned record writer composition', () => {
  const originalEnv = process.env;
  const containers: Container[] = [];

  beforeEach(() => {
    process.env = {
      NODE_ENV: 'test',
      DATABASE_URL: getTestConnectionString(),
    };
  });

  afterEach(async () => {
    await Promise.all(
      containers.splice(0).map((container) => container.db.destroy()),
    );
    process.env = originalEnv;
  });

  it('uses the private-record writer by default', () => {
    const container = createContainer(loadConfig());
    containers.push(container);

    expect(container.permissionedRecordWriter).toBeInstanceOf(
      PrivateRecordPermissionedWritePort,
    );
    expect(container.managingSpaceCredentialSessionSelector).toBeInstanceOf(
      OAuthManagingSpaceCredentialSessionSelector,
    );
    expect(container.spaceDelegationTokenClient).toBeInstanceOf(
      OAuthSpaceDelegationTokenClient,
    );
    expect(container.spaceCredentialExchangeClient).toBeInstanceOf(
      OAuthSpaceCredentialExchangeClient,
    );
  });

  it('uses the draft XRPC writer when configured', () => {
    process.env.PERMISSIONED_RECORD_WRITER_MODE = 'draft-xrpc';

    const container = createContainer(loadConfig());
    containers.push(container);

    expect(container.permissionedRecordWriter).toBeInstanceOf(
      XrpcPermissionedRecordWritePort,
    );
    expect(container.permissionedRecordWriteSessionProvider).toBeDefined();
  });
});
