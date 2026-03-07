import type { Kysely, Selectable } from 'kysely';
import type { Database, MemberNoticeTable } from '@coopsource/db';
import type { IClock } from '@coopsource/federation';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

type NoticeRow = Selectable<MemberNoticeTable>;

export class MemberNoticeService {
  constructor(
    private db: Kysely<Database>,
    private clock: IClock,
  ) {}

  async create(
    cooperativeDid: string,
    authorDid: string,
    data: {
      title: string;
      body: string;
      noticeType: string;
      targetAudience: string;
    },
  ): Promise<NoticeRow> {
    const now = this.clock.now();

    const [row] = await this.db
      .insertInto('member_notice')
      .values({
        cooperative_did: cooperativeDid,
        author_did: authorDid,
        title: data.title,
        body: data.body,
        notice_type: data.noticeType,
        target_audience: data.targetAudience,
        sent_at: now,
        created_at: now,
        indexed_at: now,
      })
      .returningAll()
      .execute();

    return row!;
  }

  async list(
    cooperativeDid: string,
    params: PageParams,
  ): Promise<Page<NoticeRow>> {
    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('member_notice')
      .where('cooperative_did', '=', cooperativeDid)
      .where('invalidated_at', 'is', null)
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
        ? encodeCursor(
            slice[slice.length - 1]!.created_at,
            slice[slice.length - 1]!.id,
          )
        : undefined;

    return { items: slice, cursor };
  }
}
