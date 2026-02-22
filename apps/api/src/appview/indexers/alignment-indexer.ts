import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { FirehoseEvent } from '@coopsource/federation';

export async function indexInterest(
  db: Kysely<Database>,
  event: FirehoseEvent,
): Promise<void> {
  if (event.operation === 'delete') {
    await db
      .deleteFrom('stakeholder_interest')
      .where('uri', '=', event.uri)
      .execute();
    return;
  }

  const record = event.record as Record<string, unknown> | undefined;
  if (!record) return;

  const existing = await db
    .selectFrom('stakeholder_interest')
    .where('uri', '=', event.uri)
    .select('uri')
    .executeTakeFirst();

  if (existing) {
    await db
      .updateTable('stakeholder_interest')
      .set({
        interests: JSON.stringify(record.interests ?? []),
        contributions: JSON.stringify(record.contributions ?? []),
        constraints: JSON.stringify(record.constraints ?? []),
        red_lines: JSON.stringify(record.redLines ?? []),
        preferences: JSON.stringify(record.preferences ?? {}),
        updated_at: new Date(),
        indexed_at: new Date(),
      })
      .where('uri', '=', event.uri)
      .execute();
  }
  // Note: interests are typically inserted directly by AlignmentService
}

export async function indexOutcome(
  db: Kysely<Database>,
  event: FirehoseEvent,
): Promise<void> {
  if (event.operation === 'delete') {
    await db
      .deleteFrom('desired_outcome')
      .where('uri', '=', event.uri)
      .execute();
    return;
  }

  const record = event.record as Record<string, unknown> | undefined;
  if (!record) return;

  const existing = await db
    .selectFrom('desired_outcome')
    .where('uri', '=', event.uri)
    .select('uri')
    .executeTakeFirst();

  if (existing) {
    await db
      .updateTable('desired_outcome')
      .set({
        title: record.title as string,
        description: (record.description as string) ?? null,
        category: record.category as string,
        success_criteria: JSON.stringify(record.successCriteria ?? []),
        stakeholder_support: JSON.stringify(record.stakeholderSupport ?? []),
        status: (record.status as string) ?? 'proposed',
        indexed_at: new Date(),
      })
      .where('uri', '=', event.uri)
      .execute();
  }
  // Note: outcomes are typically inserted directly by AlignmentService
}

export async function indexInterestMap(
  db: Kysely<Database>,
  event: FirehoseEvent,
): Promise<void> {
  if (event.operation === 'delete') {
    await db
      .deleteFrom('interest_map')
      .where('uri', '=', event.uri)
      .execute();
    return;
  }

  const record = event.record as Record<string, unknown> | undefined;
  if (!record) return;

  const existing = await db
    .selectFrom('interest_map')
    .where('uri', '=', event.uri)
    .select('uri')
    .executeTakeFirst();

  if (existing) {
    await db
      .updateTable('interest_map')
      .set({
        alignment_zones: JSON.stringify(record.alignmentZones ?? []),
        conflict_zones: JSON.stringify(record.conflictZones ?? []),
        indexed_at: new Date(),
      })
      .where('uri', '=', event.uri)
      .execute();
  }
  // Note: maps are typically inserted directly by AlignmentService
}
