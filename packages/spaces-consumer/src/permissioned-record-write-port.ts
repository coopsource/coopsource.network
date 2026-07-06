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

export interface PermissionedRecordDeleteRequest {
  readonly space: SpaceRef;
  readonly authorDid: DID;
  readonly collection: string;
  readonly rkey: string;
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
  deleteRecord(args: PermissionedRecordDeleteRequest): Promise<void>;
}

export type PermissionedRecordWriteErrorKind =
  | 'conflict'
  | 'invalid-space'
  | 'not-found'
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
  readonly beforeDelete?: (
    args: PermissionedRecordDeleteRequest,
  ) => Promise<void> | void;
}

export class InMemoryPermissionedRecordWritePort implements PermissionedRecordWritePort {
  private readonly writes: StoredPermissionedRecordWrite[] = [];
  private cidSequence = 0;
  private rkeySequence = 0;

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
      (`cid-${this.nextCidNumber()}` as CID);
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

  async deleteRecord(args: PermissionedRecordDeleteRequest): Promise<void> {
    await this.opts.beforeDelete?.(args);

    const index = this.writes.findIndex(
      (write) =>
        spaceRefKey(write.location.space) === spaceRefKey(args.space) &&
        write.location.authorDid === args.authorDid &&
        write.location.collection === args.collection &&
        write.location.rkey === args.rkey,
    );
    if (index === -1) {
      throw new PermissionedRecordWriteError(
        'not-found',
        `Permissioned record does not exist at ${formatPermissionedRecordLocationKey(
          {
            space: args.space,
            authorDid: args.authorDid,
            collection: args.collection,
            rkey: args.rkey,
          },
        )}`,
      );
    }

    this.writes.splice(index, 1);
  }

  writtenRecords(): readonly StoredPermissionedRecordWrite[] {
    return [...this.writes];
  }

  private nextRkey(): string {
    this.rkeySequence += 1;
    return `rk${String(this.rkeySequence).padStart(6, '0')}`;
  }

  private nextCidNumber(): number {
    this.cidSequence += 1;
    return this.cidSequence;
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
