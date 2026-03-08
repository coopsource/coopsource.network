import type { Kysely, Selectable } from 'kysely';
import type { Database, MeetingRecordTable } from '@coopsource/db';
import { NotFoundError, ConflictError } from '@coopsource/common';
import type { IClock } from '@coopsource/federation';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

type MeetingRow = Selectable<MeetingRecordTable>;

export class MeetingRecordService {
  constructor(
    private db: Kysely<Database>,
    private clock: IClock,
  ) {}

  async create(
    cooperativeDid: string,
    authorDid: string,
    data: {
      title: string;
      meetingDate: string;
      meetingType: string;
      attendees?: string[];
      quorumMet?: boolean;
      resolutions?: string[];
      minutes?: string;
    },
  ): Promise<MeetingRow> {
    const now = this.clock.now();

    const [row] = await this.db
      .insertInto('meeting_record')
      .values({
        cooperative_did: cooperativeDid,
        author_did: authorDid,
        title: data.title,
        meeting_date: new Date(data.meetingDate),
        meeting_type: data.meetingType,
        attendee_dids: data.attendees ?? [],
        quorum_met: data.quorumMet ?? null,
        resolutions: data.resolutions ?? [],
        minutes: data.minutes ?? null,
        created_at: now,
        indexed_at: now,
      })
      .returningAll()
      .execute();

    return row!;
  }

  async getById(id: string, cooperativeDid: string): Promise<MeetingRow> {
    const row = await this.db
      .selectFrom('meeting_record')
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .where('invalidated_at', 'is', null)
      .selectAll()
      .executeTakeFirst();

    if (!row) throw new NotFoundError('Meeting record not found');
    return row;
  }

  async list(
    cooperativeDid: string,
    params: PageParams & { meetingType?: string },
  ): Promise<Page<MeetingRow>> {
    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('meeting_record')
      .where('cooperative_did', '=', cooperativeDid)
      .where('invalidated_at', 'is', null)
      .selectAll()
      .orderBy('meeting_date', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1);

    if (params.meetingType) {
      query = query.where('meeting_type', '=', params.meetingType);
    }

    if (params.cursor) {
      const { t, i } = decodeCursor(params.cursor);
      query = query.where((eb) =>
        eb.or([
          eb('meeting_date', '<', new Date(t)),
          eb.and([
            eb('meeting_date', '=', new Date(t)),
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
            slice[slice.length - 1]!.meeting_date,
            slice[slice.length - 1]!.id,
          )
        : undefined;

    return { items: slice, cursor };
  }

  async certify(id: string, cooperativeDid: string, certifierDid: string): Promise<MeetingRow> {
    const existing = await this.getById(id, cooperativeDid);

    if (existing.certified_by) {
      throw new ConflictError('Meeting record is already certified');
    }

    const now = this.clock.now();

    const [row] = await this.db
      .updateTable('meeting_record')
      .set({
        certified_by: certifierDid,
        indexed_at: now,
      })
      .where('id', '=', id)
      .returningAll()
      .execute();

    return row!;
  }
}
