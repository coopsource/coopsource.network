/**
 * PostgreSQL-backed state and session stores for @atproto/oauth-client-node.
 */
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type {
  NodeSavedState,
  NodeSavedStateStore,
  NodeSavedSession,
  NodeSavedSessionStore,
} from '@atproto/oauth-client-node';

// ─── State Store (CSRF / OAuth flow state) ──────────────────────────────────

export class PostgresStateStore implements NodeSavedStateStore {
  constructor(private db: Kysely<Database>) {}

  async get(key: string): Promise<NodeSavedState | undefined> {
    const row = await this.db
      .selectFrom('oauth_state')
      .where('key', '=', key)
      .where('expires_at', '>', new Date())
      .select(['state'])
      .executeTakeFirst();

    if (!row) return undefined;
    return row.state as unknown as NodeSavedState;
  }

  async set(key: string, val: NodeSavedState): Promise<void> {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.db
      .insertInto('oauth_state')
      .values({
        key,
        state: JSON.parse(JSON.stringify(val)),
        expires_at: expiresAt,
        created_at: new Date(),
      })
      .onConflict((oc) =>
        oc.column('key').doUpdateSet({
          state: JSON.parse(JSON.stringify(val)),
          expires_at: expiresAt,
        }),
      )
      .execute();
  }

  async del(key: string): Promise<void> {
    await this.db
      .deleteFrom('oauth_state')
      .where('key', '=', key)
      .execute();
  }
}

// ─── Session Store (OAuth token persistence) ────────────────────────────────

export class PostgresSessionStore implements NodeSavedSessionStore {
  constructor(private db: Kysely<Database>) {}

  async get(did: string): Promise<NodeSavedSession | undefined> {
    const row = await this.db
      .selectFrom('oauth_session')
      .where('did', '=', did)
      .select(['token_set'])
      .executeTakeFirst();

    if (!row) return undefined;
    return row.token_set as unknown as NodeSavedSession;
  }

  async set(did: string, val: NodeSavedSession): Promise<void> {
    const now = new Date();
    await this.db
      .insertInto('oauth_session')
      .values({
        did,
        token_set: JSON.parse(JSON.stringify(val)),
        created_at: now,
        updated_at: now,
      })
      .onConflict((oc) =>
        oc.column('did').doUpdateSet({
          token_set: JSON.parse(JSON.stringify(val)),
          updated_at: now,
        }),
      )
      .execute();
  }

  async del(did: string): Promise<void> {
    await this.db
      .deleteFrom('oauth_session')
      .where('did', '=', did)
      .execute();
  }
}
