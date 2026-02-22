import { randomBytes } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type {
  Database,
  ExternalConnectionTable,
  ConnectionBindingTable,
} from '@coopsource/db';
import type { DID } from '@coopsource/common';
import {
  NotFoundError,
  ValidationError,
} from '@coopsource/common';
import type { BindResourceInput } from '@coopsource/common';
import type { IPdsService, IClock } from '@coopsource/federation';
import type { AppConfig } from '../config.js';
import { encryptToken } from '../lib/token-encryption.js';
import {
  getGitHubAuthUrl,
  exchangeGitHubCode,
  getGitHubUser,
  getGoogleAuthUrl,
  exchangeGoogleCode,
  getGoogleUser,
  isServiceConfigured,
  getConfiguredServices,
} from '../lib/oauth/index.js';
import type { SupportedService } from '../lib/oauth/index.js';
import { emitAppEvent } from '../appview/sse.js';

type ConnectionRow = Selectable<ExternalConnectionTable>;
type BindingRow = Selectable<ConnectionBindingTable>;

// In-memory state store for OAuth flows (short-lived, keyed by random state param)
const pendingOAuthStates = new Map<string, { did: string; service: SupportedService; expiresAt: number }>();

export class ConnectionService {
  constructor(
    private db: Kysely<Database>,
    private pdsService: IPdsService,
    private clock: IClock,
    private config: AppConfig,
  ) {}

  // ─── OAuth Flow ─────────────────────────────────────────────────────

  initiateConnection(
    did: string,
    service: SupportedService,
  ): { authUrl: string; state: string } {
    if (!isServiceConfigured(service, this.config)) {
      throw new ValidationError(`Service '${service}' is not configured`);
    }

    const state = randomBytes(32).toString('hex');
    const redirectUri = `${this.config.PUBLIC_API_URL}/api/v1/connections/callback/${service}`;

    pendingOAuthStates.set(state, {
      did,
      service,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    });

    let authUrl: string;
    switch (service) {
      case 'github':
        authUrl = getGitHubAuthUrl(this.config.GITHUB_CLIENT_ID!, redirectUri, state);
        break;
      case 'google':
        authUrl = getGoogleAuthUrl(this.config.GOOGLE_CLIENT_ID!, redirectUri, state);
        break;
      default:
        throw new ValidationError(`Unsupported service: ${service}`);
    }

    return { authUrl, state };
  }

  async completeConnection(
    service: SupportedService,
    code: string,
    state: string,
  ): Promise<ConnectionRow> {
    const pending = pendingOAuthStates.get(state);
    if (!pending || pending.service !== service) {
      throw new ValidationError('Invalid or expired OAuth state');
    }
    if (Date.now() > pending.expiresAt) {
      pendingOAuthStates.delete(state);
      throw new ValidationError('OAuth state expired');
    }
    pendingOAuthStates.delete(state);

    const did = pending.did;
    const redirectUri = `${this.config.PUBLIC_API_URL}/api/v1/connections/callback/${service}`;
    const now = this.clock.now();

    let accessToken: string;
    let metadata: Record<string, unknown> = {};

    switch (service) {
      case 'github': {
        const tokenResult = await exchangeGitHubCode(
          code,
          this.config.GITHUB_CLIENT_ID!,
          this.config.GITHUB_CLIENT_SECRET!,
          redirectUri,
        );
        accessToken = tokenResult.accessToken;
        const user = await getGitHubUser(accessToken);
        metadata = { login: user.login, name: user.name, avatarUrl: user.avatarUrl };
        break;
      }
      case 'google': {
        const tokenResult = await exchangeGoogleCode(
          code,
          this.config.GOOGLE_CLIENT_ID!,
          this.config.GOOGLE_CLIENT_SECRET!,
          redirectUri,
        );
        accessToken = tokenResult.accessToken;
        const user = await getGoogleUser(accessToken);
        metadata = { email: user.email, name: user.name, picture: user.picture };
        break;
      }
      default:
        throw new ValidationError(`Unsupported service: ${service}`);
    }

    // Encrypt token
    const encryptionKey = this.config.CONNECTION_TOKEN_ENCRYPTION_KEY;
    const encryptedToken = encryptionKey
      ? encryptToken(accessToken, encryptionKey)
      : null;

    // Create PDS record
    const ref = await this.pdsService.createRecord({
      did: did as DID,
      collection: 'network.coopsource.connection.link',
      record: {
        service,
        status: 'active',
        metadata,
        createdAt: now.toISOString(),
      },
    });

    const rkey = ref.uri.split('/').pop()!;
    const [row] = await this.db
      .insertInto('external_connection')
      .values({
        uri: ref.uri,
        did,
        rkey,
        service,
        status: 'active',
        oauth_token_encrypted: encryptedToken,
        metadata: JSON.stringify(metadata),
        created_at: now,
        indexed_at: now,
      })
      .returningAll()
      .execute();

    emitAppEvent({
      type: 'connection.connected',
      data: { did, uri: row!.uri, service },
      cooperativeDid: did,
    });

    return row!;
  }

  // ─── CRUD ───────────────────────────────────────────────────────────

  async listConnections(did: string): Promise<ConnectionRow[]> {
    return this.db
      .selectFrom('external_connection')
      .where('did', '=', did)
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();
  }

  async getConnection(uri: string): Promise<ConnectionRow> {
    const row = await this.db
      .selectFrom('external_connection')
      .where('uri', '=', uri)
      .selectAll()
      .executeTakeFirst();

    if (!row) throw new NotFoundError('Connection not found');
    return row;
  }

  async revokeConnection(uri: string, actorDid: string): Promise<void> {
    const conn = await this.getConnection(uri);
    if (conn.did !== actorDid) {
      throw new ValidationError('Not authorized to revoke this connection');
    }

    const now = this.clock.now();
    await this.db
      .updateTable('external_connection')
      .set({
        status: 'revoked',
        oauth_token_encrypted: null,
        indexed_at: now,
      })
      .where('uri', '=', uri)
      .execute();

    emitAppEvent({
      type: 'connection.disconnected',
      data: { did: actorDid, uri, service: conn.service },
      cooperativeDid: actorDid,
    });
  }

  getAvailableServices(): SupportedService[] {
    return getConfiguredServices(this.config);
  }

  // ─── Bindings ───────────────────────────────────────────────────────

  async bindResource(
    did: string,
    connectionUri: string,
    data: BindResourceInput,
  ): Promise<BindingRow> {
    const conn = await this.getConnection(connectionUri);
    if (conn.status !== 'active') {
      throw new ValidationError('Cannot bind resources to a revoked connection');
    }

    const now = this.clock.now();

    const ref = await this.pdsService.createRecord({
      did: did as DID,
      collection: 'network.coopsource.connection.binding',
      record: {
        connectionUri,
        projectUri: data.projectUri,
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        metadata: data.metadata ?? {},
        createdAt: now.toISOString(),
      },
    });

    const rkey = ref.uri.split('/').pop()!;
    const [row] = await this.db
      .insertInto('connection_binding')
      .values({
        uri: ref.uri,
        did,
        rkey,
        connection_uri: connectionUri,
        project_uri: data.projectUri,
        resource_type: data.resourceType,
        resource_id: data.resourceId,
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
        created_at: now,
        indexed_at: now,
      })
      .returningAll()
      .execute();

    emitAppEvent({
      type: 'connection.resource.bound',
      data: { did, uri: row!.uri, connectionUri, resourceType: data.resourceType },
      cooperativeDid: did,
    });

    return row!;
  }

  async listBindings(connectionUri: string): Promise<BindingRow[]> {
    return this.db
      .selectFrom('connection_binding')
      .where('connection_uri', '=', connectionUri)
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();
  }

  async listProjectBindings(projectUri: string): Promise<BindingRow[]> {
    return this.db
      .selectFrom('connection_binding')
      .where('project_uri', '=', projectUri)
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();
  }

  async removeBinding(uri: string, actorDid: string): Promise<void> {
    const binding = await this.db
      .selectFrom('connection_binding')
      .where('uri', '=', uri)
      .selectAll()
      .executeTakeFirst();

    if (!binding) throw new NotFoundError('Binding not found');
    if (binding.did !== actorDid) {
      throw new ValidationError('Not authorized to remove this binding');
    }

    await this.db
      .deleteFrom('connection_binding')
      .where('uri', '=', uri)
      .execute();
  }
}
