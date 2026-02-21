import { hash, compare } from 'bcrypt';
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { DID } from '@coopsource/common';
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@coopsource/common';
import type { IPdsService } from '@coopsource/federation';
import type { IClock } from '@coopsource/federation';
import type { Actor } from '../auth/middleware.js';

const BCRYPT_ROUNDS = 12;

export class AuthService {
  constructor(
    private db: Kysely<Database>,
    private pdsService: IPdsService,
    private clock: IClock,
  ) {}

  async register(params: {
    email: string;
    password: string;
    displayName: string;
    cooperativeDid: string;
    invitationToken?: string;
  }): Promise<{ did: string; displayName: string }> {
    // Validate invitation token if provided
    let invitation: { id: string; cooperative_did: string } | undefined;
    if (params.invitationToken) {
      const inv = await this.db
        .selectFrom('invitation')
        .where('token', '=', params.invitationToken)
        .where('status', '=', 'pending')
        .where('invalidated_at', 'is', null)
        .select(['id', 'cooperative_did', 'expires_at'])
        .executeTakeFirst();

      if (!inv) {
        throw new ValidationError('Invalid or expired invitation token');
      }
      if (new Date(inv.expires_at) < this.clock.now()) {
        throw new ValidationError('Invitation has expired');
      }
      invitation = inv;
    }

    // Check email not already used
    const existing = await this.db
      .selectFrom('auth_credential')
      .where('identifier', '=', params.email)
      .where('invalidated_at', 'is', null)
      .select('id')
      .executeTakeFirst();

    if (existing) {
      throw new ConflictError('Email already registered');
    }

    // Create DID via pdsService
    const didDoc = await this.pdsService.createDid({
      entityType: 'person',
      pdsUrl: 'http://localhost:3001',
    });
    const did = didDoc.id;

    const now = this.clock.now();

    // Hash password
    const secretHash = await hash(params.password, BCRYPT_ROUNDS);

    // Insert entity
    await this.db
      .insertInto('entity')
      .values({
        did,
        type: 'person',
        display_name: params.displayName,
        status: 'active',
        created_at: now,
        indexed_at: now,
      })
      .execute();

    // Insert auth_credential
    await this.db
      .insertInto('auth_credential')
      .values({
        entity_did: did,
        credential_type: 'password',
        identifier: params.email,
        secret_hash: secretHash,
        created_at: now,
      })
      .execute();

    // Write actor.profile PDS record
    await this.pdsService.createRecord({
      did: did as DID,
      collection: 'network.coopsource.actor.profile',
      record: {
        displayName: params.displayName,
        createdAt: now.toISOString(),
      },
    });

    // Create membership
    const cooperativeDid = params.cooperativeDid;
    await this.db
      .insertInto('membership')
      .values({
        member_did: did,
        cooperative_did: cooperativeDid,
        status: 'pending',
        created_at: now,
        indexed_at: now,
      })
      .execute();

    // Write org.membership PDS record (member's assertion)
    await this.pdsService.createRecord({
      did: did as DID,
      collection: 'network.coopsource.org.membership',
      record: {
        cooperative: cooperativeDid,
        createdAt: now.toISOString(),
      },
    });

    // Mark invitation accepted if token provided
    if (invitation) {
      await this.db
        .updateTable('invitation')
        .set({
          status: 'accepted',
          invitee_did: did,
          invalidated_at: now,
        })
        .where('id', '=', invitation.id)
        .execute();
    }

    return { did, displayName: params.displayName };
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ did: string; displayName: string }> {
    const cred = await this.db
      .selectFrom('auth_credential')
      .where('identifier', '=', email)
      .where('credential_type', '=', 'password')
      .where('invalidated_at', 'is', null)
      .select(['entity_did', 'secret_hash'])
      .executeTakeFirst();

    if (!cred || !cred.secret_hash) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const valid = await compare(password, cred.secret_hash);
    if (!valid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Update last_used_at
    await this.db
      .updateTable('auth_credential')
      .set({ last_used_at: this.clock.now() })
      .where('entity_did', '=', cred.entity_did)
      .where('identifier', '=', email)
      .execute();

    const entity = await this.db
      .selectFrom('entity')
      .where('did', '=', cred.entity_did)
      .where('status', '=', 'active')
      .select(['did', 'display_name'])
      .executeTakeFirst();

    if (!entity) {
      throw new NotFoundError('Account not found');
    }

    return { did: entity.did, displayName: entity.display_name };
  }

  async getSessionActor(did: string): Promise<Actor | null> {
    const entity = await this.db
      .selectFrom('entity')
      .where('did', '=', did)
      .where('status', '=', 'active')
      .select(['did', 'display_name'])
      .executeTakeFirst();

    if (!entity) return null;

    const membership = await this.db
      .selectFrom('membership')
      .where('member_did', '=', did)
      .where('status', '=', 'active')
      .where('invalidated_at', 'is', null)
      .select(['id', 'cooperative_did'])
      .executeTakeFirst();

    if (!membership) return null;

    const roleRows = await this.db
      .selectFrom('membership_role')
      .where('membership_id', '=', membership.id)
      .select('role')
      .execute();

    const roles = roleRows.map((r) => r.role);

    return {
      did: entity.did,
      displayName: entity.display_name,
      roles,
      cooperativeDid: membership.cooperative_did,
      membershipId: membership.id,
      hasRole: (...check: string[]) =>
        check.some((r) => roles.includes(r)),
    };
  }
}
