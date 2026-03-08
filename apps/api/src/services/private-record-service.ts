import type { Kysely, Selectable } from 'kysely';
import type { Database, PrivateRecordTable } from '@coopsource/db';
import { NotFoundError, ConflictError } from '@coopsource/common';
import type { IClock } from '@coopsource/federation';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';
import type { Page, PageParams } from '../lib/pagination.js';
import crypto from 'node:crypto';

export type PrivateRecord = Selectable<PrivateRecordTable>;

export class PrivateRecordService {
  constructor(
    private db: Kysely<Database>,
    private clock: IClock,
  ) {}

  async create(
    cooperativeDid: string,
    collection: string,
    record: Record<string, unknown>,
    createdBy: string,
    rkey?: string,
  ): Promise<PrivateRecord> {
    const effectiveRkey = rkey ?? crypto.randomUUID().replace(/-/g, '').slice(0, 15);
    const now = this.clock.now();

    try {
      const [row] = await this.db
        .insertInto('private_record')
        .values({
          did: cooperativeDid,
          collection,
          rkey: effectiveRkey,
          record: JSON.stringify(record),
          created_by: createdBy,
          created_at: now,
          updated_at: now,
        })
        .returningAll()
        .execute();

      return row!;
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        (err.message.includes('duplicate key') ||
         err.message.includes('unique constraint'))
      ) {
        throw new ConflictError(`Record with rkey '${effectiveRkey}' already exists in collection '${collection}'`);
      }
      throw err;
    }
  }

  async get(
    cooperativeDid: string,
    collection: string,
    rkey: string,
  ): Promise<PrivateRecord> {
    const row = await this.db
      .selectFrom('private_record')
      .where('did', '=', cooperativeDid)
      .where('collection', '=', collection)
      .where('rkey', '=', rkey)
      .selectAll()
      .executeTakeFirst();

    if (!row) throw new NotFoundError('Private record not found');
    return row;
  }

  async list(
    cooperativeDid: string,
    params: PageParams & { collection?: string },
  ): Promise<Page<PrivateRecord>> {
    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('private_record')
      .where('did', '=', cooperativeDid)
      .selectAll()
      .orderBy('created_at', 'desc')
      .orderBy('rkey', 'desc')
      .limit(limit + 1);

    if (params.collection) {
      query = query.where('collection', '=', params.collection);
    }

    if (params.cursor) {
      const { t, i } = decodeCursor(params.cursor);
      query = query.where((eb) =>
        eb.or([
          eb('created_at', '<', new Date(t)),
          eb.and([
            eb('created_at', '=', new Date(t)),
            eb('rkey', '<', i),
          ]),
        ]),
      );
    }

    const rows = await query.execute();
    const slice = rows.slice(0, limit);
    const cursor =
      rows.length > limit
        ? encodeCursor(
            slice[slice.length - 1]!.created_at,
            slice[slice.length - 1]!.rkey,
          )
        : undefined;

    return { items: slice, cursor };
  }

  async update(
    cooperativeDid: string,
    collection: string,
    rkey: string,
    record: Record<string, unknown>,
  ): Promise<PrivateRecord> {
    const now = this.clock.now();

    const [row] = await this.db
      .updateTable('private_record')
      .set({
        record: JSON.stringify(record),
        updated_at: now,
      })
      .where('did', '=', cooperativeDid)
      .where('collection', '=', collection)
      .where('rkey', '=', rkey)
      .returningAll()
      .execute();

    if (!row) throw new NotFoundError('Private record not found');
    return row;
  }

  async delete(
    cooperativeDid: string,
    collection: string,
    rkey: string,
  ): Promise<void> {
    const result = await this.db
      .deleteFrom('private_record')
      .where('did', '=', cooperativeDid)
      .where('collection', '=', collection)
      .where('rkey', '=', rkey)
      .executeTakeFirst();

    if (result.numDeletedRows === 0n) {
      throw new NotFoundError('Private record not found');
    }
  }
}
