import { NotFoundError, type CID } from '@coopsource/common';
import type {
  PermissionedRecordCreateRequest,
  PermissionedRecordDeleteRequest,
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
    const row = await this.privateRecordService.create(
      args.space.arbiterDid,
      args.collection,
      args.record,
      args.authorDid,
      args.rkey,
    );

    return {
      location: {
        space: args.space,
        authorDid: args.authorDid,
        collection: row.collection,
        rkey: row.rkey,
      },
      cid: 'private' as CID,
    };
  }

  async deleteRecord(args: PermissionedRecordDeleteRequest): Promise<void> {
    try {
      await this.privateRecordService.delete(
        args.space.arbiterDid,
        args.collection,
        args.rkey,
      );
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new PermissionedRecordWriteError(
          'not-found',
          `Permissioned record does not exist at ${args.space.arbiterDid}/${args.collection}/${args.rkey}`,
        );
      }
      throw err;
    }
  }
}
