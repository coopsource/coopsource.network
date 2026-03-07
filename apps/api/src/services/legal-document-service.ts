import type { Kysely, Selectable } from 'kysely';
import type { Database, LegalDocumentTable } from '@coopsource/db';
import { NotFoundError, ConflictError } from '@coopsource/common';
import type { IClock } from '@coopsource/federation';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

type DocumentRow = Selectable<LegalDocumentTable>;

export class LegalDocumentService {
  constructor(
    private db: Kysely<Database>,
    private clock: IClock,
  ) {}

  async create(
    cooperativeDid: string,
    authorDid: string,
    data: {
      title: string;
      body?: string;
      bodyFormat?: string;
      documentType: string;
      status?: string;
    },
  ): Promise<DocumentRow> {
    const now = this.clock.now();

    const [row] = await this.db
      .insertInto('legal_document')
      .values({
        cooperative_did: cooperativeDid,
        author_did: authorDid,
        title: data.title,
        body: data.body ?? null,
        body_format: data.bodyFormat ?? 'markdown',
        document_type: data.documentType,
        version: 1,
        status: data.status ?? 'draft',
        created_at: now,
        indexed_at: now,
      })
      .returningAll()
      .execute();

    return row!;
  }

  async getById(id: string): Promise<DocumentRow> {
    const row = await this.db
      .selectFrom('legal_document')
      .where('id', '=', id)
      .where('invalidated_at', 'is', null)
      .selectAll()
      .executeTakeFirst();

    if (!row) throw new NotFoundError('Legal document not found');
    return row;
  }

  async list(
    cooperativeDid: string,
    params: PageParams & { status?: string; documentType?: string },
  ): Promise<Page<DocumentRow>> {
    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('legal_document')
      .where('cooperative_did', '=', cooperativeDid)
      .where('invalidated_at', 'is', null)
      .selectAll()
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1);

    if (params.status) {
      query = query.where('status', '=', params.status);
    }
    if (params.documentType) {
      query = query.where('document_type', '=', params.documentType);
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

  async update(
    id: string,
    authorDid: string,
    cooperativeDid: string,
    data: {
      title?: string;
      body?: string;
      bodyFormat?: string;
      status?: string;
    },
  ): Promise<DocumentRow> {
    const existing = await this.getById(id);

    // Creating a new version: supersede the old, create new
    if (data.title !== undefined || data.body !== undefined) {
      const now = this.clock.now();

      // Supersede the old document
      if (existing.status === 'active') {
        await this.db
          .updateTable('legal_document')
          .set({ status: 'superseded', indexed_at: now })
          .where('id', '=', id)
          .execute();
      }

      const [newRow] = await this.db
        .insertInto('legal_document')
        .values({
          cooperative_did: cooperativeDid,
          author_did: authorDid,
          title: data.title ?? existing.title,
          body: data.body ?? existing.body,
          body_format: data.bodyFormat ?? existing.body_format,
          document_type: existing.document_type,
          version: existing.version + 1,
          previous_version_uri: existing.uri ?? existing.id,
          status: data.status ?? 'draft',
          created_at: now,
          indexed_at: now,
        })
        .returningAll()
        .execute();

      return newRow!;
    }

    // Status-only update
    if (data.status) {
      this.validateStatusTransition(existing.status, data.status);

      const now = this.clock.now();
      const [row] = await this.db
        .updateTable('legal_document')
        .set({ status: data.status, indexed_at: now })
        .where('id', '=', id)
        .returningAll()
        .execute();

      return row!;
    }

    return existing;
  }

  private validateStatusTransition(from: string, to: string): void {
    const valid: Record<string, string[]> = {
      draft: ['active', 'archived'],
      active: ['superseded', 'archived'],
      superseded: [],
      archived: [],
    };

    if (!valid[from]?.includes(to)) {
      throw new ConflictError(`Cannot transition from '${from}' to '${to}'`);
    }
  }
}
