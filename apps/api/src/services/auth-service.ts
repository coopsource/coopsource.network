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
import type { IClock, IPdsService, RecordRef } from '@coopsource/federation';
import type { GroupMutationPort } from '@coopsource/arbiter-client';
import type { Actor } from '../auth/middleware.js';
import { BCRYPT_ROUNDS } from '../lib/crypto-config.js';
import { emitMemberJoined } from '../appview/membership-events.js';
import type { IMemberRecordWriter } from './member-write-proxy.js';
import type { MembershipReadModel } from './membership-read-model.js';
import type { ProfileService } from './profile-service.js';

interface InvitationRegistration {
  readonly id: string;
  readonly cooperative_did: string;
  readonly invited_by_did: string;
  readonly intended_roles: readonly string[];
}

interface RegistrationArtifacts {
  readonly did: string;
  readonly consentRef: RecordRef;
}

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
    let invitation: InvitationRegistration | undefined;
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

    if (params.handle) {
      const existingHandle = await this.db
        .selectFrom('entity')
        .where('handle', '=', params.handle)
        .select('did')
        .executeTakeFirst();

      if (existingHandle) {
        throw new ConflictError('Handle already registered');
      }
    }

    const cooperativeDid = invitation?.cooperative_did ?? params.cooperativeDid;
    if (!cooperativeDid) {
      throw new ValidationError('Instance not set up');
    }

    const now = this.clock.now();

    // Hash password
    const secretHash = await hash(params.password, BCRYPT_ROUNDS);
    const roles = invitation?.intended_roles ?? ['member'];

    let artifacts: RegistrationArtifacts | undefined;
    if (invitation) {
      await this.db.transaction().execute(async (trx) => {
        // Atomic single-use consume happens before external PDS writes. The
        // row lock forces concurrent redeemers to wait here, so losers fail
        // before creating DIDs or records outside the DB transaction.
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

        artifacts = await this.createRegistrationArtifacts({
          cooperativeDid,
          displayName: params.displayName,
          invitation: true,
          now,
        });
        await this.persistRegistration({
          trx,
          params,
          cooperativeDid,
          roles,
          invitation,
          artifacts,
          secretHash,
          now,
        });
        await trx
          .updateTable('invitation')
          .set({ invitee_did: artifacts.did })
          .where('id', '=', invitation.id)
          .execute();
      });
    } else {
      // PDS writes are not rollback-safe, so self-registration keeps the
      // existing fail-before-DB shape: if an external write fails, no DB state
      // is committed.
      artifacts = await this.createRegistrationArtifacts({
        cooperativeDid,
        displayName: params.displayName,
        invitation: false,
        now,
      });
      await this.db.transaction().execute((trx) =>
        this.persistRegistration({
          trx,
          params,
          cooperativeDid,
          roles,
          artifacts: artifacts!,
          secretHash,
          now,
        }),
      );
    }

    if (!artifacts) {
      throw new Error('Registration artifacts were not created');
    }

    const did = artifacts.did;
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

  private async createRegistrationArtifacts(args: {
    readonly cooperativeDid: string;
    readonly displayName: string;
    readonly invitation: boolean;
    readonly now: Date;
  }): Promise<RegistrationArtifacts> {
    const didDoc = await this.pdsService.createDid({
      entityType: 'person',
      pdsUrl: this.instanceUrl,
    });
    const did = didDoc.id;

    await this.pdsService.createRecord({
      did: did as DID,
      collection: 'network.coopsource.actor.profile',
      record: {
        displayName: args.displayName,
        createdAt: args.now.toISOString(),
      },
    });

    const consentRecord = {
      cooperative: args.cooperativeDid,
      consentType: args.invitation ? 'invitationAcceptance' : 'joinRequest',
      createdAt: args.now.toISOString(),
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

    return { did, consentRef };
  }

  private async persistRegistration(args: {
    readonly trx: Transaction<Database>;
    readonly params: {
      readonly email: string;
      readonly displayName: string;
      readonly handle?: string | null;
    };
    readonly cooperativeDid: string;
    readonly roles: readonly string[];
    readonly invitation?: InvitationRegistration;
    readonly artifacts: RegistrationArtifacts;
    readonly secretHash: string;
    readonly now: Date;
  }): Promise<void> {
    const { trx, params, artifacts, invitation } = args;
    const did = artifacts.did;

    await trx
      .insertInto('entity')
      .values({
        did,
        type: 'person',
        handle: params.handle ?? null,
        display_name: params.displayName,
        status: 'active',
        created_at: args.now,
        indexed_at: args.now,
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
        secret_hash: args.secretHash,
        created_at: args.now,
      })
      .execute();

    const authority = this.groupMutationsForDb(trx);
    const authorityResult = await authority.addMember({
      cooperativeDid: args.cooperativeDid as DID,
      memberDid: did as DID,
      actorDid: (invitation?.invited_by_did ?? did) as DID,
      roles: args.roles,
      consentRecordUri: artifacts.consentRef.uri,
      consentRecordCid: artifacts.consentRef.cid,
      invitationId: invitation?.id ?? null,
      joinedAt: args.now,
      reason: invitation ? 'accept invitation' : 'self registration',
    });
    if (!authorityResult.ok) {
      throw new ValidationError('Invalid membership mutation');
    }
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
