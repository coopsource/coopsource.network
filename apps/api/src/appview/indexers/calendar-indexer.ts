import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { FirehoseEvent } from '@coopsource/federation';
import { logger } from '../../middleware/logger.js';

/**
 * Index Smoke Signal calendar events that reference governance proposals.
 * Collection: community.lexicon.calendar.event
 */
export async function indexCalendarEvent(
  db: Kysely<Database>,
  event: FirehoseEvent,
): Promise<void> {
  if (event.operation === 'delete') {
    await db
      .deleteFrom('calendar_event_ref')
      .where('event_uri', '=', event.uri)
      .execute();
    return;
  }

  const record = event.record;
  if (!record) return;

  // Extract proposal reference if present
  const proposalUri = typeof record.proposalUri === 'string' ? record.proposalUri : null;
  const title = typeof record.name === 'string' ? record.name : null;
  const startsAt = typeof record.startDate === 'string' ? new Date(record.startDate) : null;

  await db
    .insertInto('calendar_event_ref')
    .values({
      event_uri: event.uri,
      proposal_uri: proposalUri,
      cooperative_did: event.did,
      title,
      starts_at: startsAt,
      indexed_at: new Date(),
    })
    .onConflict((oc) =>
      oc.column('event_uri').doUpdateSet({
        proposal_uri: proposalUri,
        title,
        starts_at: startsAt,
        indexed_at: new Date(),
      }),
    )
    .execute();
}

/**
 * Index Smoke Signal RSVPs — increment RSVP count on the referenced event.
 * Collection: community.lexicon.calendar.rsvp
 */
export async function indexCalendarRsvp(
  db: Kysely<Database>,
  event: FirehoseEvent,
): Promise<void> {
  const record = event.record;
  if (!record) return;

  const eventUri = typeof record.event === 'string' ? record.event : null;
  if (!eventUri) return;

  if (event.operation === 'delete') {
    // Decrement RSVP count
    await db
      .updateTable('calendar_event_ref')
      .set((eb) => ({
        rsvp_count: eb('rsvp_count', '-', 1),
      }))
      .where('event_uri', '=', eventUri)
      .where('rsvp_count', '>', 0)
      .execute();
    return;
  }

  // Increment RSVP count
  await db
    .updateTable('calendar_event_ref')
    .set((eb) => ({
      rsvp_count: eb('rsvp_count', '+', 1),
    }))
    .where('event_uri', '=', eventUri)
    .execute();
}
