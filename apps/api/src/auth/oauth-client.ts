/**
 * ATProto OAuth client setup using @atproto/oauth-client-node.
 */
import { NodeOAuthClient } from '@atproto/oauth-client-node';
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import {
  formatCsnAppViewReadScopePlan,
  formatCsnMembersSpaceManageScope,
  formatCsnMemberWriteScopePlan,
} from '@coopsource/lexicons';
import type { AppConfig } from '../config.js';
import { PostgresStateStore, PostgresSessionStore } from './oauth-stores.js';

/**
 * OAuth scope string declaring the ATProto namespaces CSN needs for
 * member writes. Members write to their own PDS; the PDS enforces
 * scopes at the token level.
 *
 * V9.2.2 namespace audit (2026-04-12):
 *   alignment — interest, outcome, interestMap
 *   agreement — signature
 *   funding   — pledge
 *   governance — vote, delegation
 *   org       — membership
 *   connection — link, binding
 *
 * Cooperative-only namespaces (admin, legal, ops, commerce, finance)
 * are excluded — those writes go through OperatorWriteProxy with
 * app-password auth, not member OAuth.
 *
 * The per-namespace `rpc:` tokens are forward-compatible declarations.
 * The PDS does not enforce per-namespace scopes yet (as of @atproto
 * 0.6.x / PDS 0.4), but declaring them documents intent and will
 * take effect when the ecosystem ships enforcement.
 */
export const BASE_OAUTH_SCOPES = [
  'atproto',
  'rpc:network.coopsource.alignment',
  'rpc:network.coopsource.agreement',
  'rpc:network.coopsource.funding',
  'rpc:network.coopsource.governance',
  'rpc:network.coopsource.org',
  'rpc:network.coopsource.connection',
] as const;

export const DRAFT_PERMISSIONED_SPACE_WRITE_SCOPES =
  formatCsnMemberWriteScopePlan({
    authority: '*',
    actions: ['create', 'update', 'delete'],
  });
export const DRAFT_PERMISSIONED_SPACE_APPVIEW_READ_SCOPES =
  formatCsnAppViewReadScopePlan({
    authority: '*',
  });
export const DRAFT_PERMISSIONED_SPACE_MANAGEMENT_SCOPES = [
  formatCsnMembersSpaceManageScope({
    authority: '*',
    manages: ['create', 'update'],
  }),
] as const;

export const OAUTH_SCOPE = BASE_OAUTH_SCOPES.join(' ');

export function oauthScopeForConfig(
  config: Pick<
    AppConfig,
    'PERMISSIONED_RECORD_WRITER_MODE' | 'PERMISSIONED_REPO_READER_MODE'
  >,
): string {
  return [
    ...BASE_OAUTH_SCOPES,
    ...(config.PERMISSIONED_RECORD_WRITER_MODE === 'draft-xrpc' ||
    config.PERMISSIONED_REPO_READER_MODE === 'draft-xrpc'
      ? DRAFT_PERMISSIONED_SPACE_APPVIEW_READ_SCOPES
      : []),
    ...(config.PERMISSIONED_RECORD_WRITER_MODE === 'draft-xrpc'
      ? [
          ...DRAFT_PERMISSIONED_SPACE_WRITE_SCOPES,
          ...DRAFT_PERMISSIONED_SPACE_MANAGEMENT_SCOPES,
        ]
      : []),
  ].join(' ');
}

export interface OAuthClientOptions {
  /** Public URL of this API server, e.g. http://localhost:3001 */
  publicUrl: string;
  /** Kysely database instance */
  db: Kysely<Database>;
  /** Scope requested and advertised by this OAuth client. */
  scope?: string;
}

export function createOAuthClient(options: OAuthClientOptions): NodeOAuthClient {
  const { publicUrl, db, scope = OAUTH_SCOPE } = options;

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
      scope,
      token_endpoint_auth_method: 'none',
      application_type: 'web',
      dpop_bound_access_tokens: true,
    },
    stateStore: new PostgresStateStore(db),
    sessionStore: new PostgresSessionStore(db),
  });
}
