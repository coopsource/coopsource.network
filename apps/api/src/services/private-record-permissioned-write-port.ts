import type { CID } from '@coopsource/common';
import type {
  PermissionedRecordCreateRequest,
  PermissionedRecordWritePort,
  PermissionedRecordWriteResult,
} from '@coopsource/spaces-consumer';
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
}
