import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { FirehoseEvent } from '@coopsource/federation';

export async function indexOfficer(
  db: Kysely<Database>,
  event: FirehoseEvent,
): Promise<void> {
  if (event.operation === 'delete') {
    await db
      .updateTable('admin_officer')
      .set({ invalidated_at: new Date() })
      .where('uri', '=', event.uri)
      .execute();
    return;
  }

  const record = event.record as Record<string, unknown> | undefined;
  if (!record) return;

  const existing = await db
    .selectFrom('admin_officer')
    .where('uri', '=', event.uri)
    .select('uri')
    .executeTakeFirst();

  if (existing) {
    await db
      .updateTable('admin_officer')
      .set({
        status: (record.status as string) ?? 'active',
        indexed_at: new Date(),
      })
      .where('uri', '=', event.uri)
      .execute();
  }
}

export async function indexComplianceItem(
  db: Kysely<Database>,
  event: FirehoseEvent,
): Promise<void> {
  if (event.operation === 'delete') {
    await db
      .updateTable('compliance_item')
      .set({ invalidated_at: new Date() })
      .where('uri', '=', event.uri)
      .execute();
    return;
  }

  const record = event.record as Record<string, unknown> | undefined;
  if (!record) return;

  const existing = await db
    .selectFrom('compliance_item')
    .where('uri', '=', event.uri)
    .select('uri')
    .executeTakeFirst();

  if (existing) {
    await db
      .updateTable('compliance_item')
      .set({
        status: (record.status as string) ?? 'pending',
        indexed_at: new Date(),
      })
      .where('uri', '=', event.uri)
      .execute();
  }
}

export async function indexMemberNotice(
  db: Kysely<Database>,
  event: FirehoseEvent,
): Promise<void> {
  if (event.operation === 'delete') {
    await db
      .updateTable('member_notice')
      .set({ invalidated_at: new Date() })
      .where('uri', '=', event.uri)
      .execute();
    return;
  }

  const record = event.record as Record<string, unknown> | undefined;
  if (!record) return;

  const existing = await db
    .selectFrom('member_notice')
    .where('uri', '=', event.uri)
    .select('uri')
    .executeTakeFirst();

  if (existing) {
    await db
      .updateTable('member_notice')
      .set({
        title: record.title as string,
        body: record.body as string,
        indexed_at: new Date(),
      })
      .where('uri', '=', event.uri)
      .execute();
  }
}

export async function indexFiscalPeriod(
  db: Kysely<Database>,
  event: FirehoseEvent,
): Promise<void> {
  if (event.operation === 'delete') {
    await db
      .updateTable('fiscal_period')
      .set({ invalidated_at: new Date() })
      .where('uri', '=', event.uri)
      .execute();
    return;
  }

  const record = event.record as Record<string, unknown> | undefined;
  if (!record) return;

  const existing = await db
    .selectFrom('fiscal_period')
    .where('uri', '=', event.uri)
    .select('uri')
    .executeTakeFirst();

  if (existing) {
    await db
      .updateTable('fiscal_period')
      .set({
        status: (record.status as string) ?? 'open',
        indexed_at: new Date(),
      })
      .where('uri', '=', event.uri)
      .execute();
  }
}
