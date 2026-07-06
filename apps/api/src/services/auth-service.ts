import { hash, compare } from 'bcrypt';
import type { Kysely, Transaction } from 'kysely';
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
import type { MembershipReadModel } from './membership-read-model.js';
import type { ProfileService } from './profile-service.js';

export class AuthService {
  constructor(
    private db: Kysely<Database>,
    private pdsService: IPdsService,
    private clock: IClock,
    private profileService: ProfileService,
    private instanceUrl: string = 'http://localhost:3001',
    private memberWriteProxy: IMemberRecordWriter | undefined,
    private groupMutationsForDb: (
      db: Kysely<Database> | Transaction<Database>,
    ) => GroupMutationPort,
    private membershipReadModel: MembershipReadModel,
  ) {}

  async register(params: {
    email: string;
    password: string;
    displayName: string;
    handle?: string | null;
    cooperativeDid?: string;
    invitationToken?: string;
  }): Promise<{
    did: string;
    displayName: string;
    handle: string | null;
    cooperativeDid: string;
    roles: readonly string[];
    joinedAt: string;
  }> {
    // Validate invitation token if provided
    let invitation:
      | {
          readonly id: string;
          readonly cooperative_did: string;
          readonly invited_by_did: string;
          readonly intended_roles: string[];
        }
      | undefined;
    if (params.invitationToken) {
      const inv = await this.db
        .selectFrom('invitation')
        .where('token', '=', params.invitationToken)
        .where('status', '=', 'pending')
        .where('invalidated_at', 'is', null)
        .select([
          'id',
          'cooperative_did',
          'expires_at',
          'invited_by_did',
          'intended_roles',
          'invitee_email',
        ])
        .executeTakeFirst();

      if (!inv) {
        throw new ValidationError('Invalid or expired invitation token');
      }
      if (new Date(inv.expires_at) < this.clock.now()) {
        throw new ValidationError('Invitation has expired');
      }
      // Addressee binding: an email-addressed invitation may only be redeemed
      // by that email, so a leaked token is useless to anyone else. (DID-bound
      // invites — the canonical path for existing identities — are enforced on
      // the OAuth accept flow; see Task 3.7.)
      if (
        inv.invitee_email &&
        inv.invitee_email.toLowerCase() !== params.email.toLowerCase()
      ) {
        throw new ValidationError(
          'This invitation was issued to a different email address',
        );
      }
      const existing = await this.db
        .selectFrom('auth_credential')
        .where('identifier', '=', params.email)
        .where('invalidated_at', 'is', null)
        .select('id')
        .executeTakeFirst();

      if (existing) {
        throw new ConflictError('Email already registered');
      }
      invitation = {
        id: inv.id,
        cooperative_did: inv.cooperative_did,
        invited_by_did: inv.invited_by_did,
        intended_roles: inv.intended_roles ?? ['member'],
      };
    }

    // Check email not already used
    if (!params.invitationToken) {
      const existing = await this.db
        .selectFrom('auth_credential')
        .where('identifier', '=', params.email)
        .where('invalidated_at', 'is', null)
        .select('id')
        .executeTakeFirst();

      if (existing) {
        throw new ConflictError('Email already registered');
      }
    }

    const cooperativeDid = invitation?.cooperative_did ?? params.cooperativeDid;
    if (!cooperativeDid) {
      throw new ValidationError('Instance not set up');
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
    const roles = invitation?.intended_roles ?? ['member'];

    // PDS writes are not rollback-safe, so they happen before consuming the
    // invitation/account transaction. If they fail, no DB state is committed.
    await this.pdsService.createRecord({
      did: did as DID,
      collection: 'network.coopsource.actor.profile',
      record: {
        displayName: params.displayName,
        createdAt: now.toISOString(),
      },
    });

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

    // Entity, default profile, auth_credential, invitation consumption, and
    // membership authority writes commit together. A failed authority mutation
    // rolls back the consumed invitation and account credential.
    await this.db.transaction().execute(async (trx) => {
      if (invitation) {
        // Atomic single-use consume: only the first redeemer flips pending to
        // accepted, so a token cannot be replayed or double-redeemed. This is
        // in the same DB transaction as the account credential insert so a
        // failed account write does not burn the invitation.
        const consumed = await trx
          .updateTable('invitation')
          .set({ status: 'accepted' })
          .where('id', '=', invitation.id)
          .where('status', '=', 'pending')
          .where('invalidated_at', 'is', null)
          .executeTakeFirst();
        if (Number(consumed.numUpdatedRows) === 0) {
          throw new ValidationError('Invitation has already been used');
        }
      }

      await trx
        .insertInto('entity')
        .values({
          did,
          type: 'person',
          handle: params.handle ?? null,
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

      const authority = this.groupMutationsForDb(trx);
      const authorityResult = await authority.addMember({
        cooperativeDid: cooperativeDid as DID,
        memberDid: did as DID,
        actorDid: (invitation?.invited_by_did ?? did) as DID,
        roles,
        consentRecordUri: consentRef.uri,
        consentRecordCid: consentRef.cid,
        invitationId: invitation?.id ?? null,
        joinedAt: now,
        reason: invitation ? 'accept invitation' : 'self registration',
      });
      if (!authorityResult.ok) {
        throw new ValidationError('Invalid membership mutation');
      }

      if (invitation) {
        await trx
          .updateTable('invitation')
          .set({ invitee_did: did })
          .where('id', '=', invitation.id)
          .execute();
      }
    });
    emitMemberJoined(cooperativeDid, did);

    return {
      did,
      displayName: params.displayName,
      handle: params.handle ?? null,
      cooperativeDid,
      roles,
      joinedAt: now.toISOString(),
    };
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
    const membership = await this.membershipReadModel.getPrimaryActorMembership(
      did as DID,
    );
    if (!membership) return null;
    const roles = [...membership.roles];
    return {
      did,
      displayName: membership.displayName,
      roles,
      cooperativeDid: membership.cooperativeDid,
      membershipId: membership.membershipId,
      hasRole: (...check: string[]) =>
        check.some((role) => roles.includes(role)),
    };
  }
}
