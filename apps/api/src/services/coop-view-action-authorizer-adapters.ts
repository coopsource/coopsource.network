import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { DID } from '@coopsource/common';
import type { CoopActionPermissionReader } from '@coopsource/coop-view';
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

    const permissions = await resolveRolePermissions(
      this.db,
      input.cooperativeDid,
      membershipResult.membership.roles,
    );

    return permissions.has('*') || permissions.has(input.action)
      ? { authorized: true }
      : { authorized: false, reason: 'missing-permission' };
  }
}
