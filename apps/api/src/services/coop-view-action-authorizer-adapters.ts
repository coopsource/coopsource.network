import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { DID } from '@coopsource/common';
import type { CoopActionPermissionReader } from '@coopsource/coop-view';
import type { JsonValue } from '@coopsource/governance-view';
import {
  membershipAuthorityAppError,
  type MembershipReadModel,
} from './membership-read-model.js';
import { resolveRolePermissions } from './role-permissions.js';

export class MembershipReadModelActionPermissionReader
  implements CoopActionPermissionReader
{
  constructor(
    private readonly db: Kysely<Database>,
    private readonly membershipReadModel: Pick<
      MembershipReadModel,
      'getActiveMembershipResult'
    >,
  ) {}

  async canActorPerformAction(input: {
    readonly cooperativeDid: string;
    readonly actorDid: string;
    readonly action: string;
    readonly at: string;
    readonly payload?: JsonValue;
  }): Promise<{ readonly authorized: boolean; readonly reason?: string }> {
    const membershipResult =
      await this.membershipReadModel.getActiveMembershipResult(
        input.cooperativeDid as DID,
        input.actorDid as DID,
      );

    if (!membershipResult.ok) {
      if (membershipResult.reason === 'not-member') {
        return {
          authorized: false,
          reason: 'not-active-member',
        };
      }

      throw membershipAuthorityAppError(membershipResult, 403, 'FORBIDDEN');
    }

    if (input.action === 'proposal.update.own') {
      return input.actorDid === payloadString(input.payload, 'proposalAuthorDid')
        ? { authorized: true }
        : { authorized: false, reason: 'not-proposal-author' };
    }

    const permissions = await this.permissionsFor(
      input.cooperativeDid,
      membershipResult.membership.roles,
    );

    if (input.action === 'proposal.delete') {
      const isAuthor =
        input.actorDid === payloadString(input.payload, 'proposalAuthorDid');
      const isAdmin = permissions.has('*');
      return isAuthor || isAdmin
        ? { authorized: true }
        : { authorized: false, reason: 'not-proposal-author-or-admin' };
    }

    return permissions.has('*') || permissions.has(input.action)
      ? { authorized: true }
      : { authorized: false, reason: 'missing-permission' };
  }

  private permissionsFor(
    cooperativeDid: string,
    roles: readonly string[],
  ): Promise<Set<string>> {
    return resolveRolePermissions(this.db, cooperativeDid, [...roles]);
  }
}

function payloadString(
  payload: JsonValue | undefined,
  key: string,
): string | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined;
  }

  const value = (payload as Readonly<Record<string, JsonValue>>)[key];
  return typeof value === 'string' ? value : undefined;
}
