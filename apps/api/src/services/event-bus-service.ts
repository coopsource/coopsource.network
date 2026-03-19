import type { Kysely, Selectable } from 'kysely';
import type {
  Database,
  WebhookEndpointTable,
  WebhookDeliveryLogTable,
} from '@coopsource/db';
import { NotFoundError } from '@coopsource/common';
import type { IClock } from '@coopsource/federation';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

type EndpointRow = Selectable<WebhookEndpointTable>;
type DeliveryLogRow = Selectable<WebhookDeliveryLogTable>;

interface EventCatalogEntry {
  readonly type: string;
  readonly description: string;
}

export class EventBusService {
  private static readonly EVENT_CATALOG = [
    { type: 'task.created', description: 'A task was created' },
    { type: 'task.updated', description: 'A task was updated' },
    { type: 'task.completed', description: 'A task was completed' },
    { type: 'expense.submitted', description: 'An expense was submitted' },
    { type: 'expense.approved', description: 'An expense was approved' },
    { type: 'expense.rejected', description: 'An expense was rejected' },
    { type: 'revenue.recorded', description: 'Revenue was recorded' },
    { type: 'timeEntry.submitted', description: 'Time entries were submitted' },
    { type: 'timeEntry.approved', description: 'Time entries were approved' },
    { type: 'proposal.created', description: 'A governance proposal was created' },
    { type: 'proposal.voted', description: 'A vote was cast on a proposal' },
    { type: 'proposal.resolved', description: 'A proposal was resolved' },
    { type: 'agreement.signed', description: 'An agreement was signed' },
    { type: 'member.joined', description: 'A new member joined' },
    { type: 'member.approved', description: 'A member was approved' },
    { type: 'listing.published', description: 'A commerce listing was published' },
    { type: 'need.published', description: 'A commerce need was published' },
    { type: 'intercoopAgreement.signed', description: 'An inter-coop agreement was signed' },
    { type: 'complianceItem.due', description: 'A compliance item is due' },
    { type: 'patronage.calculated', description: 'Patronage was calculated' },
  ] as const;

  constructor(
    private db: Kysely<Database>,
    private clock: IClock,
  ) {}

  // ─── Webhook endpoint CRUD ──────────────────────────────────────────

  async createWebhookEndpoint(
    cooperativeDid: string,
    data: {
      url: string;
      eventTypes: string[];
      secret: string;
      enabled?: boolean;
    },
  ): Promise<EndpointRow> {
    const now = this.clock.now();

    const [row] = await this.db
      .insertInto('webhook_endpoint')
      .values({
        cooperative_did: cooperativeDid,
        url: data.url,
        event_types: data.eventTypes,
        secret: data.secret,
        enabled: data.enabled ?? true,
        created_at: now,
        updated_at: now,
      })
      .returningAll()
      .execute();

    return row!;
  }

  async updateWebhookEndpoint(
    id: string,
    cooperativeDid: string,
    data: {
      url?: string;
      eventTypes?: string[];
      enabled?: boolean;
    },
  ): Promise<EndpointRow> {
    const now = this.clock.now();
    const updates: Record<string, unknown> = { updated_at: now };

    if (data.url !== undefined) updates.url = data.url;
    if (data.eventTypes !== undefined) updates.event_types = data.eventTypes;
    if (data.enabled !== undefined) updates.enabled = data.enabled;

    const [row] = await this.db
      .updateTable('webhook_endpoint')
      .set(updates)
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .returningAll()
      .execute();

    if (!row) throw new NotFoundError('Webhook endpoint not found');
    return row;
  }

  async getWebhookEndpoint(
    id: string,
    cooperativeDid: string,
  ): Promise<EndpointRow> {
    const row = await this.db
      .selectFrom('webhook_endpoint')
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .executeTakeFirst();

    if (!row) throw new NotFoundError('Webhook endpoint not found');
    return row;
  }

  async listWebhookEndpoints(cooperativeDid: string): Promise<EndpointRow[]> {
    return await this.db
      .selectFrom('webhook_endpoint')
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .orderBy('created_at', 'asc')
      .execute();
  }

  async deleteWebhookEndpoint(
    id: string,
    cooperativeDid: string,
  ): Promise<void> {
    const result = await this.db
      .deleteFrom('webhook_endpoint')
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .executeTakeFirst();

    if (result.numDeletedRows === 0n) {
      throw new NotFoundError('Webhook endpoint not found');
    }
  }

  // ─── Event dispatch ─────────────────────────────────────────────────

  // Note: This method creates delivery log records but does NOT make HTTP calls.
  // Actual webhook delivery is handled by a background job processor (not yet implemented).
  // The delivery logs serve as an outbox for the async delivery system.
  async dispatchEvent(
    cooperativeDid: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<number> {
    const now = this.clock.now();

    // Find all enabled endpoints for this cooperative that subscribe to this event type
    const endpoints = await this.db
      .selectFrom('webhook_endpoint')
      .where('cooperative_did', '=', cooperativeDid)
      .where('enabled', '=', true)
      .selectAll()
      .execute();

    // Filter endpoints whose event_types array includes this event type
    const matching = endpoints.filter((ep) =>
      ep.event_types.includes(eventType),
    );

    // Create delivery log entries for each matching endpoint
    for (const endpoint of matching) {
      await this.db
        .insertInto('webhook_delivery_log')
        .values({
          webhook_endpoint_id: endpoint.id,
          event_type: eventType,
          payload: JSON.stringify(payload),
          created_at: now,
        })
        .execute();
    }

    return matching.length;
  }

  // ─── Delivery logs ──────────────────────────────────────────────────

  async getDeliveryLogs(
    webhookEndpointId: string,
    cooperativeDid: string,
    params: PageParams,
  ): Promise<Page<DeliveryLogRow>> {
    // Verify endpoint belongs to cooperative
    const endpoint = await this.db
      .selectFrom('webhook_endpoint')
      .where('id', '=', webhookEndpointId)
      .where('cooperative_did', '=', cooperativeDid)
      .select(['id'])
      .executeTakeFirst();
    if (!endpoint) throw new NotFoundError('Webhook endpoint not found');

    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('webhook_delivery_log')
      .where('webhook_endpoint_id', '=', webhookEndpointId)
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

  // ─── Event catalog ──────────────────────────────────────────────────

  getEventCatalog(): readonly EventCatalogEntry[] {
    return EventBusService.EVENT_CATALOG;
  }
}
