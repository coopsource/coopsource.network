import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { FirehoseEvent } from '@coopsource/federation';

export async function indexLegalDocument(
  db: Kysely<Database>,
  event: FirehoseEvent,
): Promise<void> {
  if (event.operation === 'delete') {
    await db
      .updateTable('legal_document')
      .set({ invalidated_at: new Date() })
      .where('uri', '=', event.uri)
      .execute();
    return;
  }

  const record = event.record as Record<string, unknown> | undefined;
  if (!record) return;

  const existing = await db
    .selectFrom('legal_document')
    .where('uri', '=', event.uri)
    .select('uri')
    .executeTakeFirst();

  if (existing) {
    await db
      .updateTable('legal_document')
      .set({
        title: record.title as string,
        body: (record.body as string) ?? null,
        status: (record.status as string) ?? 'draft',
        indexed_at: new Date(),
      })
      .where('uri', '=', event.uri)
      .execute();
  }
}

export async function indexMeetingRecord(
  db: Kysely<Database>,
  event: FirehoseEvent,
): Promise<void> {
  if (event.operation === 'delete') {
    await db
      .updateTable('meeting_record')
      .set({ invalidated_at: new Date() })
      .where('uri', '=', event.uri)
      .execute();
    return;
  }

  const record = event.record as Record<string, unknown> | undefined;
  if (!record) return;

  const existing = await db
    .selectFrom('meeting_record')
    .where('uri', '=', event.uri)
    .select('uri')
    .executeTakeFirst();

  if (existing) {
    await db
      .updateTable('meeting_record')
      .set({
        title: record.title as string,
        minutes: (record.minutes as string) ?? null,
        certified_by: (record.certifiedBy as string) ?? null,
        indexed_at: new Date(),
      })
      .where('uri', '=', event.uri)
      .execute();
  }
}
