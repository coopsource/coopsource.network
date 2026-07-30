import crypto from 'node:crypto';
import { NotFoundError, type CID } from '@coopsource/common';
import type {
  PermissionedRecordCreateRequest,
  PermissionedRecordDeleteRequest,
  PermissionedRecordUpdateRequest,
  PermissionedRecordWritePort,
  PermissionedRecordWriteResult,
} from '@coopsource/spaces-consumer';
import { PermissionedRecordWriteError } from '@coopsource/spaces-consumer';
import type { PrivateRecordService } from './private-record-service.js';

export class PrivateRecordPermissionedWritePort implements PermissionedRecordWritePort {
  constructor(private readonly privateRecordService: PrivateRecordService) {}

  async createRecord(
    args: PermissionedRecordCreateRequest,
  ): Promise<PermissionedRecordWriteResult> {
    const rkey = args.rkey ?? generatePermissionedRkey();
    const row = await this.privateRecordService.create(
      args.space.arbiterDid,
      args.collection,
      args.record,
      args.authorDid,
      formatPrivatePermissionedRecordRkey(args.authorDid, rkey),
    );

    return {
      location: {
        space: args.space,
        authorDid: args.authorDid,
        collection: row.collection,
        rkey,
      },
      cid: 'private' as CID,
    };
  }

  async updateRecord(
    args: PermissionedRecordUpdateRequest,
  ): Promise<PermissionedRecordWriteResult> {
    try {
      await this.privateRecordService.update(
        args.space.arbiterDid,
        args.collection,
        formatPrivatePermissionedRecordRkey(args.authorDid, args.rkey),
        args.record,
      );
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new PermissionedRecordWriteError(
          'not-found',
          `Permissioned record does not exist at ${args.space.arbiterDid}/${args.authorDid}/${args.collection}/${args.rkey}`,
        );
      }
      throw err;
    }

    return {
      location: {
        space: args.space,
        authorDid: args.authorDid,
        collection: args.collection,
        rkey: args.rkey,
      },
      cid: 'private' as CID,
    };
  }

  async deleteRecord(args: PermissionedRecordDeleteRequest): Promise<void> {
    try {
      await this.privateRecordService.delete(
        args.space.arbiterDid,
        args.collection,
        formatPrivatePermissionedRecordRkey(args.authorDid, args.rkey),
      );
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new PermissionedRecordWriteError(
          'not-found',
          `Permissioned record does not exist at ${args.space.arbiterDid}/${args.authorDid}/${args.collection}/${args.rkey}`,
        );
      }
      throw err;
    }
  }
}

export function formatPrivatePermissionedRecordRkey(authorDid: string, rkey: string): string {
  return `${encodeURIComponent(authorDid)}/${encodeURIComponent(rkey)}`;
}

export function parsePrivatePermissionedRecordRkey(
  physicalRkey: string,
): { readonly authorDid: string; readonly rkey: string } | null {
  const parts = physicalRkey.split('/');
  if (parts.length !== 2 || parts.some((part) => part.length === 0)) return null;
  try {
    const [authorDid, rkey] = parts.map((part) => decodeURIComponent(part)) as [string, string];
    if (!authorDid.startsWith('did:') || rkey.length === 0) return null;
    return { authorDid, rkey };
  } catch {
    return null;
  }
}

function generatePermissionedRkey(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 15);
}
