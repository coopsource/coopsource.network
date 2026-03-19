import type { Kysely, Selectable } from 'kysely';
import type { Database, MentionTable } from '@coopsource/db';
import { NotFoundError } from '@coopsource/common';
import type { IClock } from '@coopsource/federation';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

type MentionRow = Selectable<MentionTable>;

export class MentionService {
  constructor(
    private db: Kysely<Database>,
    private clock: IClock,
  ) {}

  async createMention(
    cooperativeDid: string,
    mentionedBy: string,
    data: {
      sourceType: string;
      sourceId: string;
      mentionedDid: string;
    },
  ): Promise<MentionRow> {
    const now = this.clock.now();

    const [row] = await this.db
      .insertInto('mention')
      .values({
        cooperative_did: cooperativeDid,
        source_type: data.sourceType,
        source_id: data.sourceId,
        mentioned_did: data.mentionedDid,
        mentioned_by: mentionedBy,
        created_at: now,
      })
      .returningAll()
      .execute();

    return row!;
  }

  async getUnreadMentions(
    cooperativeDid: string,
    memberDid: string | undefined,
    params: PageParams,
  ): Promise<Page<MentionRow>> {
    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('mention')
      .where('cooperative_did', '=', cooperativeDid)
      .$if(!!memberDid, (qb) => qb.where('mentioned_did', '=', memberDid!))
      .where('read_at', 'is', null)
      .selectAll()
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1);

    if (params.cursor) {
      const { t, i } = decodeCursor(params.cursor);
      query = query.where((eb) =>
        eb.or([
          eb('created_at', '<', new Date(t)),
          eb.and([
            eb('created_at', '=', new Date(t)),
            eb('id', '<', i),
          ]),
        ]),
      );
    }

    const rows = await query.execute();
    const slice = rows.slice(0, limit);
    const cursor =
      rows.length > limit
        ? encodeCursor(slice[slice.length - 1]!.created_at, slice[slice.length - 1]!.id)
        : undefined;

    return { items: slice, cursor };
  }

  async markAsRead(id: string, cooperativeDid: string): Promise<MentionRow> {
    const now = this.clock.now();

    const [row] = await this.db
      .updateTable('mention')
      .set({ read_at: now })
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .returningAll()
      .execute();

    if (!row) throw new NotFoundError('Mention not found');
    return row;
  }

  async markAllAsRead(cooperativeDid: string, memberDid?: string): Promise<number> {
    const now = this.clock.now();

    const result = await this.db
      .updateTable('mention')
      .set({ read_at: now })
      .where('cooperative_did', '=', cooperativeDid)
      .$if(!!memberDid, (qb) => qb.where('mentioned_did', '=', memberDid!))
      .where('read_at', 'is', null)
      .execute();

    return Number(result[0]?.numUpdatedRows ?? 0);
  }

  async getUnreadCount(cooperativeDid: string, memberDid?: string): Promise<number> {
    const result = await this.db
      .selectFrom('mention')
      .where('cooperative_did', '=', cooperativeDid)
      .$if(!!memberDid, (qb) => qb.where('mentioned_did', '=', memberDid!))
      .where('read_at', 'is', null)
      .select((eb) => eb.fn.count('id').as('count'))
      .executeTakeFirst();

    return Number(result?.count ?? 0);
  }
}
