import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DID } from '@coopsource/common';
import {
  getSpacesConsumerHealth,
  startSpacesConsumer,
  stopSpacesConsumer,
} from '../src/appview/spaces-consumer-dispatch.js';
import { getTestDb } from './helpers/test-db.js';

const space = {
  arbiterDid: 'did:plc:coop' as DID,
  spaceKey: 'members',
  expectedSpaceType: 'network.coopsource.org.spaceType.members',
};

describe('spaces consumer dispatch', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    await stopSpacesConsumer();
    process.env.NODE_ENV = 'test';
  });

  afterEach(async () => {
    await stopSpacesConsumer();
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('returns null and leaves health empty when disabled', async () => {
    const consumer = await startSpacesConsumer({
      enabled: false,
      unsafeAcceptUnverifiedPermissionedData: false,
      db: getTestDb(),
      spaces: [space],
    });

    expect(consumer).toBeNull();
    expect(getSpacesConsumerHealth()).toBeNull();
  });

  it('rejects unsafe unverified permissioned data mode in production', async () => {
    process.env.NODE_ENV = 'production';

    await expect(
      startSpacesConsumer({
        enabled: true,
        unsafeAcceptUnverifiedPermissionedData: true,
        db: getTestDb(),
        spaces: [],
      }),
    ).rejects.toThrow('UNSAFE_ACCEPT_UNVERIFIED_PERMISSIONED_DATA cannot be set in production');

    expect(getSpacesConsumerHealth()).toBeNull();
  });

  it('starts enabled with stable-port CSN group-directory wiring', async () => {
    const consumer = await startSpacesConsumer({
      enabled: true,
      unsafeAcceptUnverifiedPermissionedData: false,
      db: getTestDb(),
      spaces: [space],
    });

    expect(consumer).not.toBeNull();
    expect(getSpacesConsumerHealth()).toMatchObject({
      subscribedSpaces: 1,
      recordsAccepted: 0,
      recordsRejected: 0,
      verificationFailures: 0,
      memberCrossCheckFailures: 0,
      errorCount: 0,
    });
  });

  it('clears active health when stopped', async () => {
    await startSpacesConsumer({
      enabled: true,
      unsafeAcceptUnverifiedPermissionedData: false,
      db: getTestDb(),
      spaces: [space],
    });

    await stopSpacesConsumer();

    expect(getSpacesConsumerHealth()).toBeNull();
  });
});
