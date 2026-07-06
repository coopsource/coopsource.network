import type { CID, DID } from '@coopsource/common';
import { formatSpaceRecordUri } from './space-uri.js';
import {
  spaceRefKey,
  type PermissionedRecordLocation,
  type SpaceRef,
  type UnknownLexiconObject,
} from './types.js';

export interface PermissionedRecordCreateRequest {
  readonly space: SpaceRef;
  readonly authorDid: DID;
  readonly collection: string;
  readonly record: UnknownLexiconObject;
  readonly rkey?: string;
}

export interface PermissionedRecordWriteResult {
  readonly location: PermissionedRecordLocation;
  readonly cid: CID;
  readonly sourceRevision?: string;
}

export interface PermissionedRecordWritePort {
  createRecord(
    args: PermissionedRecordCreateRequest,
  ): Promise<PermissionedRecordWriteResult>;
}

export type PermissionedRecordWriteErrorKind =
  | 'conflict'
  | 'invalid-space'
  | 'protocol';

export class PermissionedRecordWriteError extends Error {
  constructor(
    public readonly kind: PermissionedRecordWriteErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'PermissionedRecordWriteError';
  }
}

export interface StoredPermissionedRecordWrite {
  readonly location: PermissionedRecordLocation;
  readonly cid: CID;
  readonly record: UnknownLexiconObject;
  readonly sourceRevision?: string;
}

export interface InMemoryPermissionedRecordWritePortOptions {
  readonly rkeyFactory?: (args: PermissionedRecordCreateRequest) => string;
  readonly cidFactory?: (
    args: PermissionedRecordCreateRequest & { readonly rkey: string },
  ) => CID;
  readonly sourceRevisionFactory?: (
    args: PermissionedRecordCreateRequest & { readonly rkey: string },
  ) => string | undefined;
  readonly beforeCreate?: (
    args: PermissionedRecordCreateRequest,
  ) => Promise<void> | void;
}

export class InMemoryPermissionedRecordWritePort implements PermissionedRecordWritePort {
  private readonly writes: StoredPermissionedRecordWrite[] = [];

  constructor(
    private readonly opts: InMemoryPermissionedRecordWritePortOptions = {},
  ) {}

  async createRecord(
    args: PermissionedRecordCreateRequest,
  ): Promise<PermissionedRecordWriteResult> {
    await this.opts.beforeCreate?.(args);

    const rkey = args.rkey ?? this.opts.rkeyFactory?.(args) ?? this.nextRkey();
    const location: PermissionedRecordLocation = {
      space: args.space,
      authorDid: args.authorDid,
      collection: args.collection,
      rkey,
    };

    if (this.hasLocation(location)) {
      throw new PermissionedRecordWriteError(
        'conflict',
        `Permissioned record already exists at ${formatPermissionedRecordLocationKey(
          location,
        )}`,
      );
    }

    const argsWithRkey = { ...args, rkey };
    const cid =
      this.opts.cidFactory?.(argsWithRkey) ??
      (`cid-${this.writes.length + 1}` as CID);
    const sourceRevision = this.opts.sourceRevisionFactory?.(argsWithRkey);
    const stored = {
      location,
      cid,
      record: args.record,
      ...(sourceRevision && { sourceRevision }),
    };
    this.writes.push(stored);
    return {
      location,
      cid,
      ...(sourceRevision && { sourceRevision }),
    };
  }

  writtenRecords(): readonly StoredPermissionedRecordWrite[] {
    return [...this.writes];
  }

  private nextRkey(): string {
    return `rk${String(this.writes.length + 1).padStart(6, '0')}`;
  }

  private hasLocation(location: PermissionedRecordLocation): boolean {
    return this.writes.some(
      (write) =>
        spaceRefKey(write.location.space) === spaceRefKey(location.space) &&
        write.location.authorDid === location.authorDid &&
        write.location.collection === location.collection &&
        write.location.rkey === location.rkey,
    );
  }
}

export function formatPermissionedRecordLocationUri(
  location: PermissionedRecordLocation,
): string {
  if (!location.space.expectedSpaceType) {
    throw new PermissionedRecordWriteError(
      'invalid-space',
      'Permissioned record URI formatting requires SpaceRef.expectedSpaceType',
    );
  }
  return formatSpaceRecordUri({
    spaceDid: location.space.arbiterDid,
    spaceType: location.space.expectedSpaceType,
    skey: location.space.spaceKey,
    authorDid: location.authorDid,
    collection: location.collection,
    rkey: location.rkey,
  });
}

function formatPermissionedRecordLocationKey(
  location: PermissionedRecordLocation,
): string {
  return `${spaceRefKey(location.space)}|${location.authorDid}|${location.collection}|${location.rkey}`;
}
