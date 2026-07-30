#!/usr/bin/env -S pnpm --filter @coopsource/api exec tsx
import type { DID } from '@coopsource/common';
import {
  MEMBERS_SPACE_KEY,
  MEMBERS_SPACE_TYPE,
  XrpcSimpleSpaceManagementClient,
  XrpcSimpleSpaceManagementError,
  type XrpcSimpleSpaceManagementFetch,
} from '@coopsource/arbiter-client';
import {
  DidSpaceAuthorityResolver,
  PermissionedRecordWriteError,
  SpaceCredentialError,
  TwoStepSpaceCredentialIssuer,
} from '@coopsource/spaces-consumer';
import type { SpaceRef } from '@coopsource/spaces-consumer';
import {
  createOAuthClient,
  oauthScopeForConfig,
} from '../src/auth/oauth-client.js';
import { loadConfig } from '../src/config.js';
import { createContainer } from '../src/container.js';
import type { OAuthPermissionedRecordWriteSession } from '../src/services/oauth-permissioned-record-write-session-provider.js';
import { OAuthSpaceCredentialExchangeClient } from '../src/services/oauth-space-credential-exchange-client.js';

const VOTE_COLLECTION = 'network.coopsource.governance.vote';
const CLIENT_METADATA_PATH = '/api/v1/auth/oauth/client-metadata.json';

interface SessionTransport {
  readonly serviceUrl: string;
  readonly authenticatedFetch: XrpcSimpleSpaceManagementFetch;
}

async function main(): Promise<void> {
  const config = loadConfig();
  if (config.PERMISSIONED_RECORD_WRITER_MODE !== 'draft-xrpc') {
    throw new ExerciseConfigError(
      'Set PERMISSIONED_RECORD_WRITER_MODE=draft-xrpc before running the live draft-XRPC exercise.',
    );
  }

  const cooperativeDid = didFromEnv('LIVE_XRPC_COOP_DID', config.COOP_DID);
  const authorDid = didFromEnv('LIVE_XRPC_AUTHOR_DID');
  const ownerDid = didFromEnv('LIVE_XRPC_OWNER_DID', cooperativeDid);
  const managingDids = parseDidList(config.SPACE_MANAGING_SESSION_DIDS);
  if (managingDids.length === 0) {
    throw new ExerciseConfigError(
      'Set SPACE_MANAGING_SESSION_DIDS to one or more cooperative-designated managing session DIDs.',
    );
  }

  const space: SpaceRef = {
    arbiterDid: cooperativeDid,
    spaceKey: process.env.LIVE_XRPC_SPACE_KEY ?? MEMBERS_SPACE_KEY,
    expectedSpaceType: process.env.LIVE_XRPC_SPACE_TYPE ?? MEMBERS_SPACE_TYPE,
  };
  const clientId = `${config.PUBLIC_API_URL}${CLIENT_METADATA_PATH}`;
  const container = createContainer(config);
  try {
    const authorityResolver = new DidSpaceAuthorityResolver({
      resolveDid: (did) => container.didResolver.resolve(did),
    });
    const resolvedAuthority = await authorityResolver.resolve(space);
    const authorityServiceUrl =
      process.env.LIVE_XRPC_PDS_URL ?? resolvedAuthority.serviceUrl;
    const oauthScope = oauthScopeForConfig(config);
    const oauthClient = createOAuthClient({
      publicUrl: config.PUBLIC_API_URL,
      db: container.db,
      scope: oauthScope,
    });
    container.memberWriteProxy.setOAuthClient(oauthClient);
    container.permissionedRecordWriteSessionProvider.setOAuthClient(
      oauthClient,
    );
    container.managingSpaceCredentialSessionSelector.setOAuthClient(
      oauthClient,
    );

    console.log('Draft-XRPC live exercise starting');
    console.log(
      `space: ${space.arbiterDid}/${space.expectedSpaceType}/${space.spaceKey}`,
    );
    console.log(`author DID: ${authorDid}`);
    console.log(`owner DID: ${ownerDid}`);
    console.log(`managing DIDs: ${managingDids.join(', ')}`);
    console.log(`authority service: ${authorityServiceUrl}`);
    console.log(
      `authority verification method: ${resolvedAuthority.verificationMethodId}`,
    );
    console.log(`OAuth client ID: ${clientId}`);

    const ownerTransport = await sessionTransportForDid(oauthClient, ownerDid);
    const managementClient = new XrpcSimpleSpaceManagementClient({
      serviceUrl: ownerTransport.serviceUrl,
      authenticatedFetch: ownerTransport.authenticatedFetch,
    });
    await createOrReuseSpace(managementClient, space);
    for (const did of uniqueDids([authorDid, ...managingDids])) {
      await managementClient.addMember({ space, memberDid: did });
      console.log(`member authorized: ${did}`);
    }

    const issuer = new TwoStepSpaceCredentialIssuer(
      container.spaceDelegationTokenClient,
      new OAuthSpaceCredentialExchangeClient({
        serviceUrlForSpaceAuthority: () => authorityServiceUrl,
      }),
      {
        clientId,
        ...(process.env.LIVE_XRPC_CLIENT_ATTESTATION
          ? {
              clientAttestationProvider: {
                getClientAttestation: async () =>
                  process.env.LIVE_XRPC_CLIENT_ATTESTATION,
              },
            }
          : {}),
      },
    );
    const credential = await issuer.issue({
      ref: space,
      reason: 'missing',
      now: new Date(),
    });
    console.log(
      `space credential expires: ${credential.expiresAt.toISOString()}`,
    );

    const createResult = await container.permissionedRecordWriter.createRecord({
      space,
      authorDid,
      collection: VOTE_COLLECTION,
      record: voteRecord(authorDid, 'yes'),
      ...(process.env.LIVE_XRPC_RKEY
        ? { rkey: process.env.LIVE_XRPC_RKEY }
        : {}),
    });
    console.log(
      `created: ${createResult.location.rkey} cid=${createResult.cid}`,
    );

    const updateResult = await container.permissionedRecordWriter.updateRecord({
      space,
      authorDid,
      collection: VOTE_COLLECTION,
      rkey: createResult.location.rkey,
      record: voteRecord(authorDid, 'abstain'),
    });
    console.log(
      `updated: ${updateResult.location.rkey} cid=${updateResult.cid}`,
    );

    await container.permissionedRecordWriter.deleteRecord({
      space,
      authorDid,
      collection: VOTE_COLLECTION,
      rkey: createResult.location.rkey,
    });
    console.log(`deleted: ${createResult.location.rkey}`);
    console.log('Draft-XRPC live exercise completed');
  } finally {
    await container.db.destroy();
  }
}

async function createOrReuseSpace(
  client: XrpcSimpleSpaceManagementClient,
  space: SpaceRef,
): Promise<void> {
  try {
    const result = await client.createSpace({
      space,
      config: {
        $type: 'com.atproto.simplespace.defs#spaceConfig',
        policy: 'member-list',
        appAccess: { $type: 'com.atproto.simplespace.defs#open' },
      },
    });
    console.log(`space created: ${result.uri}`);
  } catch (err) {
    if (
      err instanceof XrpcSimpleSpaceManagementError &&
      err.kind === 'conflict'
    ) {
      console.log('space already exists; continuing with existing space');
      return;
    }
    throw err;
  }
}

async function sessionTransportForDid(
  oauthClient: {
    restore(
      did: string,
      refresh?: boolean | 'auto',
    ): Promise<OAuthPermissionedRecordWriteSession>;
  },
  did: DID,
): Promise<SessionTransport> {
  let session: OAuthPermissionedRecordWriteSession;
  try {
    session = await oauthClient.restore(did);
  } catch (err) {
    throw new ExerciseConfigError(
      `No restorable OAuth session for ${did}. Complete real OAuth consent through the API first. ${errorMessage(err)}`,
    );
  }
  if (session.did && session.did !== did) {
    throw new SpaceCredentialError(
      `OAuth session DID mismatch: session has ${session.did} but exercise requested ${did}`,
      'auth',
    );
  }
  const tokenInfo = await session.getTokenInfo('auto');
  if (!tokenInfo.aud) {
    throw new SpaceCredentialError(
      `OAuth session for ${did} has no PDS audience`,
      'auth',
    );
  }
  return {
    serviceUrl: tokenInfo.aud,
    authenticatedFetch: authenticatedFetchForSession(session, tokenInfo.aud),
  };
}

function authenticatedFetchForSession(
  session: OAuthPermissionedRecordWriteSession,
  audience: string,
): XrpcSimpleSpaceManagementFetch {
  const expectedOrigin = originForAudience(audience);
  return async (url, init) => {
    const target = new URL(url);
    if (target.origin !== expectedOrigin) {
      throw new SpaceCredentialError(
        `OAuth session audience ${expectedOrigin} cannot call ${target.origin}`,
        'auth',
      );
    }
    return session.fetchHandler(`${target.pathname}${target.search}`, {
      method: init.method,
      headers: init.headers,
      body: init.body,
    });
  };
}

function voteRecord(authorDid: DID, choice: string): Record<string, unknown> {
  return {
    proposalUri:
      'at://did:plc:coopsource-live-exercise/network.coopsource.governance.proposal/phase4',
    voterDid: authorDid,
    choice,
    weight: 1,
    rationale: 'V12 Phase 4 live draft-XRPC/PDS exercise',
    createdAt: new Date().toISOString(),
  };
}

function didFromEnv(name: string, fallback?: string): DID {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new ExerciseConfigError(`Set ${name}.`);
  }
  if (!value.startsWith('did:')) {
    throw new ExerciseConfigError(`${name} must be a DID, got ${value}.`);
  }
  return value as DID;
}

function parseDidList(value: string | undefined): readonly DID[] {
  return (value ?? '')
    .split(',')
    .map((did) => did.trim())
    .filter((did): did is DID => did.startsWith('did:'));
}

function uniqueDids(values: readonly DID[]): readonly DID[] {
  return [...new Set(values)];
}

function originForAudience(audience: string): string {
  try {
    return new URL(audience).origin;
  } catch {
    throw new SpaceCredentialError(
      `OAuth session audience is not a valid URL: ${audience}`,
      'auth',
    );
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

class ExerciseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExerciseConfigError';
  }
}

main().catch((err) => {
  const kind =
    err instanceof PermissionedRecordWriteError ||
    err instanceof SpaceCredentialError ||
    err instanceof XrpcSimpleSpaceManagementError
      ? ` kind=${err.kind}`
      : '';
  console.error(
    `${err instanceof Error ? err.name : 'Error'}${kind}: ${errorMessage(err)}`,
  );
  process.exitCode = 1;
});
