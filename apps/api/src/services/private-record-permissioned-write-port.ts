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
      physicalPrivateRecordRkey(args.authorDid, rkey),
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
        physicalPrivateRecordRkey(args.authorDid, args.rkey),
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
        physicalPrivateRecordRkey(args.authorDid, args.rkey),
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

function physicalPrivateRecordRkey(authorDid: string, rkey: string): string {
  return `${encodeURIComponent(authorDid)}/${encodeURIComponent(rkey)}`;
}

function generatePermissionedRkey(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 15);
}
