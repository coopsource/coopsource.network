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
import type { GroupMutationPort } from '@coopsource/arbiter-client';
import type { Actor } from '../auth/middleware.js';
import { BCRYPT_ROUNDS } from '../lib/crypto-config.js';
import { emitMemberJoined } from '../appview/membership-events.js';
import type { IMemberRecordWriter } from './member-write-proxy.js';
import type { ProfileService } from './profile-service.js';

export class AuthService {
  constructor(
    private db: Kysely<Database>,
    private pdsService: IPdsService,
    private clock: IClock,
    private profileService: ProfileService,
    private instanceUrl: string = 'http://localhost:3001',
    private memberWriteProxy: IMemberRecordWriter | undefined,
    private groupMutations: GroupMutationPort,
  ) {}

  async register(params: {
    email: string;
    password: string;
    displayName: string;
    cooperativeDid: string;
    invitationToken?: string;
  }): Promise<{ did: string; displayName: string }> {
    // Validate invitation token if provided
    let invitation: {
      readonly id: string;
      readonly cooperative_did: string;
      readonly invited_by_did: string;
      readonly intended_roles: string[];
    } | undefined;
    if (params.invitationToken) {
      const inv = await this.db
        .selectFrom('invitation')
        .where('token', '=', params.invitationToken)
        .where('status', '=', 'pending')
        .where('invalidated_at', 'is', null)
        .select(['id', 'cooperative_did', 'expires_at', 'invited_by_did', 'intended_roles'])
        .executeTakeFirst();

      if (!inv) {
        throw new ValidationError('Invalid or expired invitation token');
      }
      if (new Date(inv.expires_at) < this.clock.now()) {
        throw new ValidationError('Invitation has expired');
      }
      invitation = {
        id: inv.id,
        cooperative_did: inv.cooperative_did,
        invited_by_did: inv.invited_by_did,
        intended_roles: inv.intended_roles ?? ['member'],
      };
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
      pdsUrl: this.instanceUrl,
    });
    const did = didDoc.id;

    const now = this.clock.now();

    // Hash password
    const secretHash = await hash(params.password, BCRYPT_ROUNDS);

    // V8.3 — entity, default profile, and auth_credential are written in a
    // single transaction so the entity row never exists without its companion
    // profile + credential. PDS writes below remain outside the transaction
    // (they're network calls and not rollback-safe).
    await this.db.transaction().execute(async (trx) => {
      await trx
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

      // Default profile carries the user's presentation layer. Entity owns
      // the DID; profile owns display name / avatar / bio. One default
      // profile per person, verified=true in V8.3 (single profile per user).
      await this.profileService.createDefaultProfile({
        entityDid: did,
        displayName: params.displayName,
        db: trx,
      });

      await trx
        .insertInto('auth_credential')
        .values({
          entity_did: did,
          credential_type: 'password',
          identifier: params.email,
          secret_hash: secretHash,
          created_at: now,
        })
        .execute();
    });

    // Write actor.profile PDS record
    await this.pdsService.createRecord({
      did: did as DID,
      collection: 'network.coopsource.actor.profile',
      record: {
        displayName: params.displayName,
        createdAt: now.toISOString(),
      },
    });

    // Create member-authored consent evidence; membership authority is
    // written through the V11 Group Mutation port.
    const cooperativeDid = params.cooperativeDid;

    const consentRecord = {
      cooperative: cooperativeDid,
      consentType: invitation ? 'invitationAcceptance' : 'joinRequest',
      createdAt: now.toISOString(),
    };
    const consentRef = this.memberWriteProxy
      ? await this.memberWriteProxy.writeRecord({
          memberDid: did as DID,
          collection: 'network.coopsource.org.memberConsent',
          record: consentRecord,
        })
      : await this.pdsService.createRecord({
          did: did as DID,
          collection: 'network.coopsource.org.memberConsent',
          record: consentRecord,
        });

    const authorityResult = await this.groupMutations.addMember({
      cooperativeDid: cooperativeDid as DID,
      memberDid: did as DID,
      actorDid: (invitation?.invited_by_did ?? did) as DID,
      roles: invitation?.intended_roles ?? ['member'],
      consentRecordUri: consentRef.uri,
      consentRecordCid: consentRef.cid,
      invitationId: invitation?.id ?? null,
      joinedAt: now,
      reason: invitation ? 'accept invitation' : 'self registration',
    });
    if (!authorityResult.ok) {
      throw new ValidationError('Invalid membership mutation');
    }
    emitMemberJoined(cooperativeDid, did);

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
