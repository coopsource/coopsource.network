import type { DID } from '@coopsource/common';
import type {
  GroupMutationAuditPage,
  GroupMutationPort,
  GroupMutationResult,
  ProvisionCooperativeAuthorityResult,
} from '@coopsource/arbiter-client';
import type {
  SpaceCredentialStore,
  SpaceRef,
} from '@coopsource/spaces-consumer';

type GroupMutationMethodArgs<TMethod extends keyof GroupMutationPort> =
  Parameters<GroupMutationPort[TMethod]>[0];

/**
 * Keeps cached short-lived space credentials from surviving member-list changes.
 * The invalidation is deliberately cooperative-wide because role replacement
 * results do not expose the removed role spaces.
 */
export class SpaceCredentialInvalidatingGroupMutationPort
  implements GroupMutationPort
{
  constructor(
    private readonly delegate: GroupMutationPort,
    private readonly credentialStore: Pick<SpaceCredentialStore, 'delete' | 'live'>,
  ) {}

  async provisionCooperativeAuthority(
    args: GroupMutationMethodArgs<'provisionCooperativeAuthority'>,
  ): Promise<ProvisionCooperativeAuthorityResult> {
    const result = await this.delegate.provisionCooperativeAuthority(args);
    await this.invalidateIfChanged(result);
    return result;
  }

  async ensureRoleSpace(
    args: GroupMutationMethodArgs<'ensureRoleSpace'>,
  ): Promise<GroupMutationResult> {
    const result = await this.delegate.ensureRoleSpace(args);
    await this.invalidateIfChanged(result);
    return result;
  }

  async addMember(
    args: GroupMutationMethodArgs<'addMember'>,
  ): Promise<GroupMutationResult> {
    const result = await this.delegate.addMember(args);
    await this.invalidateIfChanged(result);
    return result;
  }

  async removeMember(
    args: GroupMutationMethodArgs<'removeMember'>,
  ): Promise<GroupMutationResult> {
    const result = await this.delegate.removeMember(args);
    await this.invalidateIfChanged(result);
    return result;
  }

  async suspendMember(
    args: GroupMutationMethodArgs<'suspendMember'>,
  ): Promise<GroupMutationResult> {
    const result = await this.delegate.suspendMember(args);
    await this.invalidateIfChanged(result);
    return result;
  }

  async reinstateMember(
    args: GroupMutationMethodArgs<'reinstateMember'>,
  ): Promise<GroupMutationResult> {
    const result = await this.delegate.reinstateMember(args);
    await this.invalidateIfChanged(result);
    return result;
  }

  async addRoleMember(
    args: GroupMutationMethodArgs<'addRoleMember'>,
  ): Promise<GroupMutationResult> {
    const result = await this.delegate.addRoleMember(args);
    await this.invalidateIfChanged(result);
    return result;
  }

  async removeRoleMember(
    args: GroupMutationMethodArgs<'removeRoleMember'>,
  ): Promise<GroupMutationResult> {
    const result = await this.delegate.removeRoleMember(args);
    await this.invalidateIfChanged(result);
    return result;
  }

  async setMemberRoles(
    args: GroupMutationMethodArgs<'setMemberRoles'>,
  ): Promise<GroupMutationResult> {
    const result = await this.delegate.setMemberRoles(args);
    await this.invalidateIfChanged(result);
    return result;
  }

  async listAuditEvents(
    args: GroupMutationMethodArgs<'listAuditEvents'>,
  ): Promise<GroupMutationAuditPage> {
    return this.delegate.listAuditEvents(args);
  }

  private async invalidateIfChanged(result: GroupMutationResult): Promise<void> {
    if (!result.changed) return;
    await invalidateSpaceCredentialsForAuthority(
      this.credentialStore,
      result.cooperativeDid,
    );
  }
}

export async function invalidateSpaceCredentialsForAuthority(
  credentialStore: Pick<SpaceCredentialStore, 'delete' | 'live'>,
  cooperativeDid: DID,
): Promise<void> {
  const liveCredentials = await credentialStore.live();
  const affectedRefs = liveCredentials
    .map((entry) => entry.ref)
    .filter((ref) => sameAuthority(ref, cooperativeDid));
  await Promise.all(affectedRefs.map((ref) => credentialStore.delete(ref)));
}

function sameAuthority(ref: SpaceRef, cooperativeDid: DID): boolean {
  return ref.arbiterDid === cooperativeDid;
}
