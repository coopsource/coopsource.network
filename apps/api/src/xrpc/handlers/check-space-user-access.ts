import type { DID } from '@coopsource/common';
import { AppError } from '@coopsource/common';
import {
  parseProtocolSpaceUri,
  type ManagingAppAccessPolicyPort,
} from '@coopsource/arbiter-client';
import type { XrpcContext } from '../dispatcher.js';

export function handleCheckSpaceUserAccess(
  policy: ManagingAppAccessPolicyPort,
): (ctx: XrpcContext) => Promise<{ readonly authorized: boolean }> {
  return async (ctx) => {
    const spaceUri = stringParam(ctx.params.space, 'space');
    const userDid = didParam(ctx.params.user, 'user');
    const clientId = optionalStringParam(ctx.params.clientId, 'clientId');
    const space = parseProtocolSpaceUri(spaceUri);
    if (!space) {
      throw new AppError(
        'space must be a valid permissioned-space AT URI',
        400,
        'InvalidRequest',
      );
    }

    const issuerDid = ctx.serviceAuth?.issuerDid;
    if (!issuerDid) {
      throw new AppError(
        'Service authentication is required',
        401,
        'AuthenticationRequired',
      );
    }
    if (issuerDid !== space.arbiterDid) {
      throw new AppError(
        'Service-auth issuer does not control the requested space',
        403,
        'SpaceAuthorityMismatch',
      );
    }

    const decision = await policy.checkUserAccess({
      space,
      userDid,
      ...(clientId ? { clientId } : {}),
    });
    return { authorized: decision.authorized };
  };
}

function stringParam(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new AppError(`${name} is required`, 400, 'InvalidRequest');
  }
  return value;
}

function optionalStringParam(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  return stringParam(value, name);
}

function didParam(value: unknown, name: string): DID {
  const did = stringParam(value, name);
  if (!did.startsWith('did:')) {
    throw new AppError(`${name} must be a DID`, 400, 'InvalidRequest');
  }
  return did as DID;
}
