#!/usr/bin/env -S pnpm --filter @coopsource/api exec tsx
import type { DID } from '@coopsource/common';
import {
  PERMISSIONED_CONFORMANCE_TARGETS,
  runPermissionedConformanceProbe,
  type PermissionedConformanceProbeOptions,
  type PermissionedConformanceTargetId,
} from '@coopsource/spaces-consumer';
import { pathToFileURL } from 'node:url';

export interface PermissionedConformanceEnvironment {
  readonly PERMISSIONED_CONFORMANCE_TARGET?: string;
  readonly PERMISSIONED_CONFORMANCE_SERVICE_URL?: string;
  readonly PERMISSIONED_CONFORMANCE_SPACE_URI?: string;
  readonly PERMISSIONED_CONFORMANCE_REPO_DID?: string;
  readonly PERMISSIONED_CONFORMANCE_AUTHORIZATION?: string;
  readonly PERMISSIONED_CONFORMANCE_NOTIFICATION_ENDPOINT?: string;
  readonly PERMISSIONED_CONFORMANCE_NOTIFICATION_SERVICE_DID?: string;
}

export function parsePermissionedConformanceEnvironment(
  env: PermissionedConformanceEnvironment,
): PermissionedConformanceProbeOptions {
  const target = required(env, 'PERMISSIONED_CONFORMANCE_TARGET');
  if (!(target in PERMISSIONED_CONFORMANCE_TARGETS)) {
    throw new Error(
      `PERMISSIONED_CONFORMANCE_TARGET must be one of: ${Object.keys(PERMISSIONED_CONFORMANCE_TARGETS).join(', ')}`,
    );
  }
  const repoDid = did(
    required(env, 'PERMISSIONED_CONFORMANCE_REPO_DID'),
    'PERMISSIONED_CONFORMANCE_REPO_DID',
  );
  const notificationEndpoint =
    env.PERMISSIONED_CONFORMANCE_NOTIFICATION_ENDPOINT;
  const notificationServiceDid =
    env.PERMISSIONED_CONFORMANCE_NOTIFICATION_SERVICE_DID;
  if (notificationServiceDid && !notificationEndpoint) {
    throw new Error(
      'PERMISSIONED_CONFORMANCE_NOTIFICATION_SERVICE_DID requires PERMISSIONED_CONFORMANCE_NOTIFICATION_ENDPOINT',
    );
  }

  return {
    target: target as PermissionedConformanceTargetId,
    serviceUrl: required(env, 'PERMISSIONED_CONFORMANCE_SERVICE_URL'),
    spaceUri: required(env, 'PERMISSIONED_CONFORMANCE_SPACE_URI'),
    repoDid,
    authorization: required(env, 'PERMISSIONED_CONFORMANCE_AUTHORIZATION'),
    ...(notificationEndpoint
      ? {
          notification: {
            endpoint: notificationEndpoint,
            ...(notificationServiceDid
              ? {
                  serviceDid: did(
                    notificationServiceDid,
                    'PERMISSIONED_CONFORMANCE_NOTIFICATION_SERVICE_DID',
                  ),
                }
              : {}),
          },
        }
      : {}),
  };
}

async function main(): Promise<void> {
  const options = parsePermissionedConformanceEnvironment(process.env);
  const report = await runPermissionedConformanceProbe(options);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.summary.failed > 0) process.exitCode = 1;
}

function required(
  env: PermissionedConformanceEnvironment,
  name: keyof PermissionedConformanceEnvironment,
): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Set ${name}`);
  return value;
}

function did(value: string, name: string): DID {
  if (!value.startsWith('did:')) throw new Error(`${name} must be a DID`);
  return value as DID;
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
