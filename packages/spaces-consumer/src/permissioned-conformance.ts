import type { DID } from '@coopsource/common';
import { PERMISSIONED_DATA_DRAFT_BASELINE } from '@coopsource/lexicons';
import { CarReader } from '@ipld/car';
import * as dagCbor from '@ipld/dag-cbor';

const ATPROTO_PR_5187 = 'atproto-pr-5187';
const HAPPYVIEW_2_12_DEV_2 = 'happyview-2.12.0-dev.2';
const BASELINE_COMMIT_FIELDS = new Set<string>(
  PERMISSIONED_DATA_DRAFT_BASELINE.commitFields,
);

type JsonObject = Readonly<Record<string, unknown>>;

export type PermissionedConformanceTargetId =
  | typeof ATPROTO_PR_5187
  | typeof HAPPYVIEW_2_12_DEV_2;

export type PermissionedConformanceCheckId =
  | 'listRepos'
  | 'listRepoOps'
  | 'getLatestCommit'
  | 'getRepo'
  | 'registerNotify';

export type PermissionedConformanceOutcome =
  | 'conformant'
  | 'deviation'
  | 'unsupported'
  | 'failed'
  | 'skipped';

export interface PermissionedConformanceDeviation {
  readonly area:
    | 'auth'
    | 'credential'
    | 'oplog'
    | 'commit'
    | 'car'
    | 'registration'
    | 'notification';
  readonly baseline: string;
  readonly target: string;
  readonly impact: 'informational' | 'adapter-required' | 'blocking';
}

export interface PermissionedConformanceTarget {
  readonly id: PermissionedConformanceTargetId;
  readonly label: string;
  readonly source: {
    readonly url: string;
    readonly ref: string;
    readonly commit: string;
  };
  readonly wire: {
    readonly repoParameter: 'repo' | 'did';
    readonly oplogCursorParameter: 'since' | 'cursor';
    readonly commitFields: ReadonlyArray<string>;
    readonly notificationRegistration:
      | {
          readonly input: 'space-endpoint';
          readonly outputField: 'expiresAt';
        }
      | {
          readonly input: 'space-service-endpoint';
          readonly outputField: 'id';
        };
  };
  readonly knownDeviations: ReadonlyArray<PermissionedConformanceDeviation>;
}

export interface PermissionedConformanceFetchInit {
  readonly method: 'GET' | 'POST';
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly signal?: AbortSignal;
}

export interface PermissionedConformanceFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly headers?: {
    get(name: string): string | null;
  };
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type PermissionedConformanceFetch = (
  url: string,
  init: PermissionedConformanceFetchInit,
) => Promise<PermissionedConformanceFetchResponse>;

export interface PermissionedConformanceProbeOptions {
  readonly target: PermissionedConformanceTargetId;
  readonly serviceUrl: string;
  readonly spaceUri: string;
  readonly repoDid: DID;
  /**
   * Exact Authorization header value. This supports a Proposal 0016 space
   * credential as well as target-specific DPoP test sessions.
   */
  readonly authorization: string;
  readonly notification?: {
    readonly endpoint: string;
    readonly serviceDid?: DID;
  };
  readonly signal?: AbortSignal;
  readonly fetcher?: PermissionedConformanceFetch;
}

export interface PermissionedConformanceCheck {
  readonly id: PermissionedConformanceCheckId;
  readonly outcome: PermissionedConformanceOutcome;
  readonly httpStatus?: number;
  readonly mediaType?: string;
  readonly observations: ReadonlyArray<string>;
}

export interface PermissionedConformanceReport {
  readonly generatedAt: string;
  readonly target: PermissionedConformanceTarget;
  readonly serviceOrigin: string;
  readonly spaceUri: string;
  readonly repoDid: DID;
  readonly knownDeviations: ReadonlyArray<PermissionedConformanceDeviation>;
  readonly checks: ReadonlyArray<PermissionedConformanceCheck>;
  readonly summary: Readonly<Record<PermissionedConformanceOutcome, number>>;
}

export const PERMISSIONED_CONFORMANCE_TARGETS: Readonly<
  Record<PermissionedConformanceTargetId, PermissionedConformanceTarget>
> = {
  [ATPROTO_PR_5187]: {
    id: ATPROTO_PR_5187,
    label: 'bluesky-social/atproto PR #5187',
    source: {
      url: PERMISSIONED_DATA_DRAFT_BASELINE.implementation.url,
      ref: 'refs/pull/5187/head',
      commit: PERMISSIONED_DATA_DRAFT_BASELINE.implementation.commit,
    },
    wire: {
      repoParameter: 'repo',
      oplogCursorParameter: 'since',
      commitFields: PERMISSIONED_DATA_DRAFT_BASELINE.commitFields,
      notificationRegistration: {
        input: 'space-endpoint',
        outputField: 'expiresAt',
      },
    },
    knownDeviations: [
      {
        area: 'car',
        baseline: 'getRepo returns a two-root CAR v1 repository export',
        target: 'the pinned handler throws MethodNotImplemented',
        impact: 'blocking',
      },
    ],
  },
  [HAPPYVIEW_2_12_DEV_2]: {
    id: HAPPYVIEW_2_12_DEV_2,
    label: 'HappyView 2.12.0-dev.2',
    source: {
      url: 'https://github.com/gamesgamesgamesgamesgames/happyview',
      ref: 'v2.12.0-dev.2',
      commit: 'bf4517c6121839189a2466dd48ec4639364f3b63',
    },
    wire: {
      repoParameter: 'did',
      oplogCursorParameter: 'cursor',
      commitFields: ['ver', 'hash', 'mac', 'ikm', 'rev'],
      notificationRegistration: {
        input: 'space-service-endpoint',
        outputField: 'id',
      },
    },
    knownDeviations: [
      {
        area: 'auth',
        baseline:
          'Bearer space credentials are accepted on canonical com.atproto.space routes',
        target:
          '2.12.0-dev.2 recognizes them only on legacy dev.happyview.space routes',
        impact: 'blocking',
      },
      {
        area: 'credential',
        baseline:
          'getDelegationToken returns token; getSpaceCredential exchanges a bearer delegation token with {space, clientAttestation?}',
        target:
          'getDelegationToken returns delegationToken; getSpaceCredential requires an authenticated caller and {grant}',
        impact: 'blocking',
      },
      {
        area: 'oplog',
        baseline: 'repo and since query parameters',
        target: 'did and cursor query parameters',
        impact: 'adapter-required',
      },
      {
        area: 'commit',
        baseline: 'signed commits include ver, hash, mac, ikm, sig, and rev',
        target: 'commits omit sig',
        impact: 'blocking',
      },
      {
        area: 'registration',
        baseline: 'input {space, endpoint}; output {expiresAt}',
        target: 'input {space, serviceDid, endpoint}; output {id}',
        impact: 'adapter-required',
      },
      {
        area: 'notification',
        baseline: 'notifyWrite carries {space, repo, rev, hash}',
        target: 'notifyWrite carries {space, did, collection, rkey, cid}',
        impact: 'adapter-required',
      },
    ],
  },
};

export async function runPermissionedConformanceProbe(
  options: PermissionedConformanceProbeOptions,
): Promise<PermissionedConformanceReport> {
  const target = PERMISSIONED_CONFORMANCE_TARGETS[options.target];
  const serviceUrl = normalizeServiceUrl(options.serviceUrl);
  const fetcher = options.fetcher ?? defaultFetch();
  const context: ProbeContext = {
    target,
    serviceUrl,
    spaceUri: options.spaceUri,
    repoDid: options.repoDid,
    authorization: options.authorization,
    notification: options.notification,
    signal: options.signal,
    fetcher,
  };

  const checks: PermissionedConformanceCheck[] = [];
  checks.push(await probeListRepos(context));
  checks.push(await probeListRepoOps(context));
  checks.push(await probeLatestCommit(context));
  checks.push(await probeRepoCar(context));
  checks.push(await probeNotificationRegistration(context));

  return {
    generatedAt: new Date().toISOString(),
    target,
    serviceOrigin: new URL(serviceUrl).origin,
    spaceUri: options.spaceUri,
    repoDid: options.repoDid,
    knownDeviations: target.knownDeviations,
    checks,
    summary: summarize(checks),
  };
}

interface ProbeContext {
  readonly target: PermissionedConformanceTarget;
  readonly serviceUrl: string;
  readonly spaceUri: string;
  readonly repoDid: DID;
  readonly authorization: string;
  readonly notification?: {
    readonly endpoint: string;
    readonly serviceDid?: DID;
  };
  readonly signal?: AbortSignal;
  readonly fetcher: PermissionedConformanceFetch;
}

async function probeListRepos(
  context: ProbeContext,
): Promise<PermissionedConformanceCheck> {
  return probeJson(context, 'listRepos', {}, (body) => {
    if (!Array.isArray(body.repos)) return ['repos is not an array'];
    const invalid = body.repos.filter((repo) => {
      const object = asObject(repo);
      return typeof object?.did !== 'string' || !object.did.startsWith('did:');
    });
    return invalid.length > 0
      ? [`${invalid.length} repo entries have no valid did`]
      : [];
  });
}

async function probeListRepoOps(
  context: ProbeContext,
): Promise<PermissionedConformanceCheck> {
  return probeJson(
    context,
    'listRepoOps',
    {
      [context.target.wire.repoParameter]: context.repoDid,
      limit: '1',
    },
    (body) => {
      const observations: string[] = [];
      if (!Array.isArray(body.ops)) {
        observations.push('ops is not an array');
      } else {
        const invalid = body.ops.filter(
          (operation) => !isRepoOperation(operation),
        );
        if (invalid.length > 0) {
          observations.push(
            `${invalid.length} ops are missing required fields`,
          );
        }
      }
      observations.push(
        ...commitObservations(body.commit, context.target.wire.commitFields),
      );
      if (context.target.wire.oplogCursorParameter !== 'since') {
        observations.push(
          `target pagination uses ${context.target.wire.oplogCursorParameter} instead of since`,
        );
      }
      return observations;
    },
  );
}

async function probeLatestCommit(
  context: ProbeContext,
): Promise<PermissionedConformanceCheck> {
  return probeJson(
    context,
    'getLatestCommit',
    { [context.target.wire.repoParameter]: context.repoDid },
    (body) => commitObservations(body.commit, context.target.wire.commitFields),
  );
}

async function probeRepoCar(
  context: ProbeContext,
): Promise<PermissionedConformanceCheck> {
  throwIfAborted(context.signal);
  const response = await request(
    context,
    'getRepo',
    buildQuery(context, 'getRepo', {
      [context.target.wire.repoParameter]: context.repoDid,
    }),
    {
      method: 'GET',
      headers: requestHeaders(context, 'application/vnd.ipld.car'),
    },
  );
  if ('check' in response) return response.check;

  const mediaType = response.value.headers?.get('content-type') ?? undefined;
  if (!response.value.ok) {
    return httpFailure('getRepo', response.value.status, mediaType);
  }

  try {
    const reader = await CarReader.fromBytes(
      new Uint8Array(await response.value.arrayBuffer()),
    );
    const roots = await reader.getRoots();
    const observations: string[] = [];
    if (
      mediaType &&
      !mediaType.toLowerCase().startsWith('application/vnd.ipld.car')
    ) {
      observations.push(`response media type is ${mediaType}`);
    }
    if (roots.length !== 2) {
      observations.push(`CAR has ${roots.length} roots instead of 2`);
    }
    const commitRoot = roots[0];
    if (!commitRoot) {
      observations.push('CAR has no commit root');
    } else {
      const block = await reader.get(commitRoot);
      if (!block) {
        observations.push('CAR is missing its commit root block');
      } else {
        const commit = asObject(dagCbor.decode(block.bytes));
        observations.push(
          ...commitObservations(
            commit,
            PERMISSIONED_DATA_DRAFT_BASELINE.commitFields,
          ),
        );
      }
    }
    return {
      id: 'getRepo',
      outcome: observations.length === 0 ? 'conformant' : 'deviation',
      httpStatus: response.value.status,
      ...(mediaType ? { mediaType } : {}),
      observations,
    };
  } catch (error) {
    return {
      id: 'getRepo',
      outcome: 'deviation',
      httpStatus: response.value.status,
      ...(mediaType ? { mediaType } : {}),
      observations: [`invalid CAR response: ${errorMessage(error)}`],
    };
  }
}

async function probeNotificationRegistration(
  context: ProbeContext,
): Promise<PermissionedConformanceCheck> {
  if (!context.notification) {
    return {
      id: 'registerNotify',
      outcome: 'skipped',
      observations: ['notification registration was not requested'],
    };
  }
  const registration = context.target.wire.notificationRegistration;
  if (
    registration.input === 'space-service-endpoint' &&
    !context.notification.serviceDid
  ) {
    return {
      id: 'registerNotify',
      outcome: 'skipped',
      observations: ['this target requires notification.serviceDid'],
    };
  }

  const body =
    registration.input === 'space-service-endpoint'
      ? {
          space: context.spaceUri,
          serviceDid: context.notification.serviceDid,
          endpoint: context.notification.endpoint,
        }
      : {
          space: context.spaceUri,
          endpoint: context.notification.endpoint,
        };
  return probeJson(
    context,
    'registerNotify',
    {},
    (output) => {
      const observations: string[] = [];
      if (typeof output[registration.outputField] !== 'string') {
        observations.push(
          `response has no string ${registration.outputField} field`,
        );
      }
      if (registration.outputField !== 'expiresAt') {
        observations.push(
          `target returns ${registration.outputField} instead of expiresAt`,
        );
      }
      return observations;
    },
    body,
  );
}

async function probeJson(
  context: ProbeContext,
  id: PermissionedConformanceCheckId,
  parameters: Readonly<Record<string, string>>,
  inspect: (body: JsonObject) => ReadonlyArray<string>,
  body?: JsonObject,
): Promise<PermissionedConformanceCheck> {
  throwIfAborted(context.signal);
  const response = await request(
    context,
    id,
    body
      ? `${context.serviceUrl}/xrpc/${methodNsid(id)}`
      : buildQuery(context, id, parameters),
    body
      ? {
          method: 'POST',
          headers: requestHeaders(context, 'application/json', true),
          body: JSON.stringify(body),
        }
      : {
          method: 'GET',
          headers: requestHeaders(context, 'application/json'),
        },
  );
  if ('check' in response) return response.check;

  const mediaType = response.value.headers?.get('content-type') ?? undefined;
  if (!response.value.ok) {
    return httpFailure(id, response.value.status, mediaType);
  }
  try {
    const parsed = JSON.parse(await response.value.text()) as unknown;
    const object = asObject(parsed);
    if (!object) {
      return {
        id,
        outcome: 'deviation',
        httpStatus: response.value.status,
        ...(mediaType ? { mediaType } : {}),
        observations: ['response is not a JSON object'],
      };
    }
    const observations = [...inspect(object)];
    return {
      id,
      outcome: observations.length === 0 ? 'conformant' : 'deviation',
      httpStatus: response.value.status,
      ...(mediaType ? { mediaType } : {}),
      observations,
    };
  } catch (error) {
    return {
      id,
      outcome: 'deviation',
      httpStatus: response.value.status,
      ...(mediaType ? { mediaType } : {}),
      observations: [`invalid JSON response: ${errorMessage(error)}`],
    };
  }
}

async function request(
  context: ProbeContext,
  id: PermissionedConformanceCheckId,
  url: string,
  init: Omit<PermissionedConformanceFetchInit, 'signal'>,
): Promise<
  | { readonly value: PermissionedConformanceFetchResponse }
  | { readonly check: PermissionedConformanceCheck }
> {
  try {
    return {
      value: await context.fetcher(url, {
        ...init,
        ...(context.signal ? { signal: context.signal } : {}),
      }),
    };
  } catch (error) {
    if (context.signal?.aborted) throw abortReason(context.signal);
    return {
      check: {
        id,
        outcome: 'failed',
        observations: [`request failed: ${errorMessage(error)}`],
      },
    };
  }
}

function buildQuery(
  context: ProbeContext,
  id: PermissionedConformanceCheckId,
  parameters: Readonly<Record<string, string>>,
): string {
  const query = new URLSearchParams({
    space: context.spaceUri,
    ...parameters,
  });
  return `${context.serviceUrl}/xrpc/${methodNsid(id)}?${query.toString()}`;
}

function methodNsid(id: PermissionedConformanceCheckId): string {
  return `com.atproto.space.${id}`;
}

function requestHeaders(
  context: ProbeContext,
  accept: string,
  jsonBody = false,
): Readonly<Record<string, string>> {
  return {
    accept,
    authorization: context.authorization,
    ...(jsonBody ? { 'content-type': 'application/json' } : {}),
  };
}

function commitObservations(
  value: unknown,
  targetFields: ReadonlyArray<string>,
): ReadonlyArray<string> {
  if (value === null || value === undefined) {
    // The draft allows an unwritten permissioned repo to have no commit.
    return [];
  }
  const commit = asObject(value);
  if (!commit) return ['commit is not an object'];

  const observations: string[] = [];
  for (const field of PERMISSIONED_DATA_DRAFT_BASELINE.commitFields) {
    if (!(field in commit)) observations.push(`commit is missing ${field}`);
  }
  const targetOnly = targetFields.filter(
    (field) => !BASELINE_COMMIT_FIELDS.has(field),
  );
  if (targetOnly.length > 0) {
    observations.push(
      `target defines additional commit fields: ${targetOnly.join(', ')}`,
    );
  }
  return observations;
}

function httpFailure(
  id: PermissionedConformanceCheckId,
  status: number,
  mediaType?: string,
): PermissionedConformanceCheck {
  const unsupported = id === 'getRepo' && (status === 404 || status === 501);
  return {
    id,
    outcome: unsupported ? 'unsupported' : 'failed',
    httpStatus: status,
    ...(mediaType ? { mediaType } : {}),
    observations: [
      unsupported
        ? `target does not implement ${methodNsid(id)}`
        : `${methodNsid(id)} returned HTTP ${status}`,
    ],
  };
}

function summarize(
  checks: ReadonlyArray<PermissionedConformanceCheck>,
): Readonly<Record<PermissionedConformanceOutcome, number>> {
  const summary: Record<PermissionedConformanceOutcome, number> = {
    conformant: 0,
    deviation: 0,
    unsupported: 0,
    failed: 0,
    skipped: 0,
  };
  for (const check of checks) summary[check.outcome] += 1;
  return summary;
}

function normalizeServiceUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Conformance target must use HTTP or HTTPS: ${value}`);
  }
  return url.toString().replace(/\/+$/, '');
}

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonObject;
}

function isRepoOperation(value: unknown): boolean {
  const operation = asObject(value);
  return (
    typeof operation?.rev === 'string' &&
    typeof operation.collection === 'string' &&
    typeof operation.rkey === 'string' &&
    isNullableString(operation.cid) &&
    isNullableString(operation.prev)
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortReason(signal);
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error('Permissioned conformance probe aborted');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function defaultFetch(): PermissionedConformanceFetch {
  return async (url, init) => fetch(url, init);
}
