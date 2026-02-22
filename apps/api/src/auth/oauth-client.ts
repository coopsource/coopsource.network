/**
 * ATProto OAuth client setup using @atproto/oauth-client-node.
 */
import { NodeOAuthClient } from '@atproto/oauth-client-node';
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import { PostgresStateStore, PostgresSessionStore } from './oauth-stores.js';

export interface OAuthClientOptions {
  /** Public URL of this API server, e.g. http://localhost:3001 */
  publicUrl: string;
  /** Kysely database instance */
  db: Kysely<Database>;
}

export function createOAuthClient(options: OAuthClientOptions): NodeOAuthClient {
  const { publicUrl, db } = options;

  const clientId = `${publicUrl}/api/v1/auth/oauth/client-metadata.json`;
  const redirectUri = `${publicUrl}/api/v1/auth/oauth/callback`;

  return new NodeOAuthClient({
    clientMetadata: {
      client_id: clientId,
      client_name: 'Co-op Source Network',
      client_uri: publicUrl,
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: 'atproto transition:generic',
      token_endpoint_auth_method: 'none',
      application_type: 'web',
      dpop_bound_access_tokens: true,
    },
    stateStore: new PostgresStateStore(db),
    sessionStore: new PostgresSessionStore(db),
  });
}
