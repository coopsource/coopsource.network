import type { DID } from '@coopsource/common';
import type { GroupDirectoryPort, SpaceRef } from '@coopsource/spaces-consumer';
import { parseCsnSpace } from './space-ref.js';

export type ManagingAppAccessDenialReason =
  | 'not-member'
  | 'policy-unavailable'
  | 'unsupported-space';

export type ManagingAppAccessDecision =
  | {
      readonly authorized: true;
      readonly sourceRevision?: string;
    }
  | {
      readonly authorized: false;
      readonly reason: ManagingAppAccessDenialReason;
    };

export interface ManagingAppAccessRequest {
  readonly space: SpaceRef;
  readonly userDid: DID;
  readonly clientId?: string;
}

export interface ManagingAppAccessPolicyPort {
  checkUserAccess(
    request: ManagingAppAccessRequest,
  ): Promise<ManagingAppAccessDecision>;
}

export class DenyAllManagingAppAccessPolicy implements ManagingAppAccessPolicyPort {
  async checkUserAccess(
    _request: ManagingAppAccessRequest,
  ): Promise<ManagingAppAccessDecision> {
    return { authorized: false, reason: 'unsupported-space' };
  }
}

/**
 * CSN's first managing-app policy: a user must appear in the strict resolved
 * membership of the requested CSN space. Client access remains the space
 * authority's separate `appAccess` decision.
 */
export class CsnGroupDirectoryManagingAppAccessPolicy implements ManagingAppAccessPolicyPort {
  constructor(private readonly groupDirectory: GroupDirectoryPort) {}

  async checkUserAccess(
    request: ManagingAppAccessRequest,
  ): Promise<ManagingAppAccessDecision> {
    if (!parseCsnSpace(request.space)) {
      return { authorized: false, reason: 'unsupported-space' };
    }

    try {
      const resolved = await this.groupDirectory.resolveSpaceMembers({
        ...request.space,
        consistency: 'strict',
      });
      if (!resolved.ok || resolved.partial || resolved.stale) {
        return { authorized: false, reason: 'policy-unavailable' };
      }

      const authorized = resolved.members.some(
        (member) => member.did === request.userDid,
      );
      if (!authorized) {
        return { authorized: false, reason: 'not-member' };
      }
      return {
        authorized: true,
        ...(resolved.sourceRevision
          ? { sourceRevision: resolved.sourceRevision }
          : {}),
      };
    } catch {
      return { authorized: false, reason: 'policy-unavailable' };
    }
  }
}
