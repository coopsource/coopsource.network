import type { Kysely, Selectable } from 'kysely';
import type { Database, AdminOfficerTable } from '@coopsource/db';
import { NotFoundError, ConflictError } from '@coopsource/common';
import type { IClock } from '@coopsource/federation';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

type OfficerRow = Selectable<AdminOfficerTable>;

export class OfficerRecordService {
  constructor(
    private db: Kysely<Database>,
    private clock: IClock,
  ) {}

  async appoint(
    cooperativeDid: string,
    data: {
      officerDid: string;
      title: string;
      appointedAt: string;
      termEndsAt?: string;
      appointmentType: string;
      responsibilities?: string;
    },
  ): Promise<OfficerRow> {
    const now = this.clock.now();

    const [row] = await this.db
      .insertInto('admin_officer')
      .values({
        cooperative_did: cooperativeDid,
        officer_did: data.officerDid,
        title: data.title,
        appointed_at: new Date(data.appointedAt),
        term_ends_at: data.termEndsAt ? new Date(data.termEndsAt) : null,
        appointment_type: data.appointmentType,
        responsibilities: data.responsibilities ?? null,
        status: 'active',
        created_at: now,
        indexed_at: now,
      })
      .returningAll()
      .execute();

    return row!;
  }

  async endTerm(id: string): Promise<OfficerRow> {
    const existing = await this.db
      .selectFrom('admin_officer')
      .where('id', '=', id)
      .where('invalidated_at', 'is', null)
      .selectAll()
      .executeTakeFirst();

    if (!existing) throw new NotFoundError('Officer record not found');
    if (existing.status === 'ended') {
      throw new ConflictError('Officer term has already ended');
    }

    const now = this.clock.now();

    const [row] = await this.db
      .updateTable('admin_officer')
      .set({
        status: 'ended',
        term_ends_at: now,
        indexed_at: now,
      })
      .where('id', '=', id)
      .returningAll()
      .execute();

    return row!;
  }

  async list(
    cooperativeDid: string,
    params: PageParams & { status?: string },
  ): Promise<Page<OfficerRow>> {
    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('admin_officer')
      .where('cooperative_did', '=', cooperativeDid)
      .where('invalidated_at', 'is', null)
      .selectAll()
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1);

    if (params.status) {
      query = query.where('status', '=', params.status);
    }

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

  async getCurrent(cooperativeDid: string): Promise<OfficerRow[]> {
    return this.db
      .selectFrom('admin_officer')
      .where('cooperative_did', '=', cooperativeDid)
      .where('status', '=', 'active')
      .where('invalidated_at', 'is', null)
      .selectAll()
      .orderBy('title', 'asc')
      .execute();
  }
}
