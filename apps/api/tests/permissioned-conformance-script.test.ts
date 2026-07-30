import { describe, expect, it } from 'vitest';
import { parsePermissionedConformanceEnvironment } from '../scripts/probe-permissioned-conformance.js';

const required = {
  PERMISSIONED_CONFORMANCE_TARGET: 'atproto-pr-5187',
  PERMISSIONED_CONFORMANCE_SERVICE_URL: 'https://pds.example',
  PERMISSIONED_CONFORMANCE_SPACE_URI:
    'at://did:plc:coop/space/network.coopsource.org.spaceType.members/members',
  PERMISSIONED_CONFORMANCE_REPO_DID: 'did:plc:alice',
  PERMISSIONED_CONFORMANCE_AUTHORIZATION: 'Bearer secret',
};

describe('permissioned conformance probe script', () => {
  it('parses a read-only target without echoing authorization elsewhere', () => {
    expect(parsePermissionedConformanceEnvironment(required)).toEqual({
      target: 'atproto-pr-5187',
      serviceUrl: 'https://pds.example',
      spaceUri:
        'at://did:plc:coop/space/network.coopsource.org.spaceType.members/members',
      repoDid: 'did:plc:alice',
      authorization: 'Bearer secret',
    });
  });

  it('requires the HappyView service DID only when registration is enabled', () => {
    expect(
      parsePermissionedConformanceEnvironment({
        ...required,
        PERMISSIONED_CONFORMANCE_TARGET: 'happyview-2.12.0-dev.2',
        PERMISSIONED_CONFORMANCE_NOTIFICATION_ENDPOINT:
          'https://consumer.example/xrpc/com.atproto.space.notifyWrite',
        PERMISSIONED_CONFORMANCE_NOTIFICATION_SERVICE_DID:
          'did:web:consumer.example',
      }).notification,
    ).toEqual({
      endpoint: 'https://consumer.example/xrpc/com.atproto.space.notifyWrite',
      serviceDid: 'did:web:consumer.example',
    });
  });

  it('rejects unknown targets and malformed DIDs', () => {
    expect(() =>
      parsePermissionedConformanceEnvironment({
        ...required,
        PERMISSIONED_CONFORMANCE_TARGET: 'latest',
      }),
    ).toThrow('must be one of');
    expect(() =>
      parsePermissionedConformanceEnvironment({
        ...required,
        PERMISSIONED_CONFORMANCE_REPO_DID: 'alice.example',
      }),
    ).toThrow('must be a DID');
  });
});
