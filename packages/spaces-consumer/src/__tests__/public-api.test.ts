import { describe, expect, it } from 'vitest';
import * as publicApi from '../index.js';

describe('public API', () => {
  it('exports stable ports instead of mechanism sketches', () => {
    expect(publicApi).toHaveProperty('SpacesConsumer');
    expect(publicApi).toHaveProperty('DenyAllGroupDirectoryPort');
    expect(publicApi).toHaveProperty('SpaceCredentialManager');
    expect(publicApi).toHaveProperty('TwoStepSpaceCredentialIssuer');
    expect(publicApi).toHaveProperty('CredentialedPermissionedRepoPort');
    expect(publicApi).toHaveProperty('InMemoryPermissionedRecordWritePort');
    expect(publicApi).toHaveProperty('PermissionedRecordWriteError');
    expect(publicApi).toHaveProperty('KyselyDidEquivalencePort');
    expect(publicApi).toHaveProperty('RawDidEquivalencePort');
    expect(publicApi).toHaveProperty('InMemoryPermissionedRepoPort');
    expect(publicApi).toHaveProperty('KyselyPermissionedCheckpointStore');

    expect(publicApi).not.toHaveProperty('DenyAllGroupAuthorityPort');
    expect(publicApi).not.toHaveProperty('DenyAllArbiterMemberList');
    expect(publicApi).not.toHaveProperty('InMemoryNotificationSubscriber');
    expect(publicApi).not.toHaveProperty('InMemoryRepoPuller');
    expect(publicApi).not.toHaveProperty('FailClosedEcmhVerifier');
  });
});
