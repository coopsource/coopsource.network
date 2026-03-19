import type { Kysely, Selectable } from 'kysely';
import type { Database, IntercoopAgreementTable } from '@coopsource/db';
import { NotFoundError, ConflictError, ValidationError } from '@coopsource/common';
import type { DID } from '@coopsource/common';
import type { IClock } from '@coopsource/federation';
import type { IPdsService } from '@coopsource/federation';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

type AgreementRow = Selectable<IntercoopAgreementTable>;

const STATUS_TRANSITIONS: Record<string, string[]> = {
  proposed: ['negotiating', 'active', 'cancelled'],
  negotiating: ['active', 'cancelled'],
  active: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export class IntercoopAgreementService {
  constructor(
    private db: Kysely<Database>,
    private pdsService: IPdsService,
    private clock: IClock,
  ) {}

  async createAgreement(
    initiatorDid: string,
    data: {
      responderDid: string;
      title: string;
      description?: string | null;
      agreementType?: string;
      terms?: Record<string, unknown> | null;
    },
  ): Promise<AgreementRow> {
    const now = this.clock.now();
    const agreementType = data.agreementType ?? 'general';

    // Best-effort PDS write for the initiator
    let initiatorUri: string | null = null;
    let initiatorCid: string | null = null;
    try {
      const result = await this.pdsService.createRecord({
        did: initiatorDid as DID,
        collection: 'network.coopsource.commerce.intercoopAgreement',
        record: {
          responderDid: data.responderDid,
          title: data.title,
          description: data.description ?? undefined,
          agreementType,
          terms: data.terms ?? undefined,
          status: 'proposed',
          createdAt: now.toISOString(),
        },
      });
      initiatorUri = result.uri;
      initiatorCid = result.cid;
    } catch {
      // PDS write is best-effort; agreement is still materialized in PostgreSQL
    }

    try {
      const [row] = await this.db
        .insertInto('intercoop_agreement')
        .values({
          initiator_did: initiatorDid,
          responder_did: data.responderDid,
          title: data.title,
          description: data.description ?? null,
          agreement_type: agreementType,
          initiator_uri: initiatorUri,
          initiator_cid: initiatorCid,
          responder_uri: null,
          responder_cid: null,
          status: 'proposed',
          terms: data.terms ?? null,
          created_at: now,
          updated_at: now,
          indexed_at: now,
        })
        .returningAll()
        .execute();

      return row!;
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        (err.message.includes('duplicate key') ||
         err.message.includes('unique constraint'))
      ) {
        throw new ConflictError('An agreement with these details already exists');
      }
      throw err;
    }
  }

  async updateAgreement(
    id: string,
    cooperativeDid: string,
    data: {
      title?: string;
      description?: string | null;
      agreementType?: string;
      terms?: Record<string, unknown> | null;
      status?: string;
    },
  ): Promise<AgreementRow> {
    // Verify the cooperative is a party to this agreement
    const existing = await this.db
      .selectFrom('intercoop_agreement')
      .where('id', '=', id)
      .where((eb) =>
        eb.or([
          eb('initiator_did', '=', cooperativeDid),
          eb('responder_did', '=', cooperativeDid),
        ]),
      )
      .select(['id', 'status'])
      .executeTakeFirst();

    if (!existing) throw new NotFoundError('Agreement not found');

    // Validate status transition if status change requested
    if (data.status !== undefined) {
      const allowed = STATUS_TRANSITIONS[existing.status];
      if (!allowed || !allowed.includes(data.status)) {
        throw new ValidationError(
          `Cannot transition agreement from '${existing.status}' to '${data.status}'`,
        );
      }
    }

    const now = this.clock.now();
    const updates: Record<string, unknown> = { updated_at: now, indexed_at: now };

    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) updates.description = data.description;
    if (data.agreementType !== undefined) updates.agreement_type = data.agreementType;
    if (data.terms !== undefined) updates.terms = data.terms ? JSON.stringify(data.terms) : null;
    if (data.status !== undefined) updates.status = data.status;

    const [row] = await this.db
      .updateTable('intercoop_agreement')
      .set(updates)
      .where('id', '=', id)
      .returningAll()
      .execute();

    if (!row) throw new NotFoundError('Agreement not found');
    return row;
  }

  async respondToAgreement(
    id: string,
    responderDid: string,
    accept: boolean,
  ): Promise<AgreementRow> {
    const existing = await this.db
      .selectFrom('intercoop_agreement')
      .where('id', '=', id)
      .where((eb) =>
        eb.or([
          eb('initiator_did', '=', responderDid),
          eb('responder_did', '=', responderDid),
        ]),
      )
      .selectAll()
      .executeTakeFirst();

    if (!existing) throw new NotFoundError('Agreement not found');

    // Can only respond to proposed or negotiating agreements
    if (existing.status !== 'proposed' && existing.status !== 'negotiating') {
      throw new ValidationError(
        `Cannot respond to agreement in '${existing.status}' status`,
      );
    }

    const newStatus = accept ? 'active' : 'cancelled';
    const now = this.clock.now();

    // Best-effort PDS write for the responder
    let responderUri: string | null = existing.responder_uri;
    let responderCid: string | null = existing.responder_cid;
    if (accept) {
      try {
        const result = await this.pdsService.createRecord({
          did: responderDid as DID,
          collection: 'network.coopsource.commerce.intercoopAgreement',
          record: {
            initiatorDid: existing.initiator_did,
            title: existing.title,
            description: existing.description ?? undefined,
            agreementType: existing.agreement_type,
            terms: existing.terms ?? undefined,
            status: newStatus,
            respondedAt: now.toISOString(),
          },
        });
        responderUri = result.uri;
        responderCid = result.cid;
      } catch {
        // PDS write is best-effort
      }
    }

    const [row] = await this.db
      .updateTable('intercoop_agreement')
      .set({
        status: newStatus,
        responder_uri: responderUri,
        responder_cid: responderCid,
        updated_at: now,
        indexed_at: now,
      })
      .where('id', '=', id)
      .returningAll()
      .execute();

    if (!row) throw new NotFoundError('Agreement not found');
    return row;
  }

  async getAgreement(id: string): Promise<AgreementRow> {
    const row = await this.db
      .selectFrom('intercoop_agreement')
      .where('id', '=', id)
      .selectAll()
      .executeTakeFirst();

    if (!row) throw new NotFoundError('Agreement not found');
    return row;
  }

  async listAgreements(
    cooperativeDid: string,
    params: PageParams,
    filters?: {
      status?: string;
      partnerDid?: string;
    },
  ): Promise<Page<AgreementRow>> {
    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('intercoop_agreement')
      .where((eb) =>
        eb.or([
          eb('initiator_did', '=', cooperativeDid),
          eb('responder_did', '=', cooperativeDid),
        ]),
      )
      .selectAll()
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1);

    if (filters?.status) {
      query = query.where('status', '=', filters.status);
    }
    if (filters?.partnerDid) {
      query = query.where((eb) =>
        eb.or([
          eb('initiator_did', '=', filters.partnerDid!),
          eb('responder_did', '=', filters.partnerDid!),
        ]),
      );
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
        ? encodeCursor(slice[slice.length - 1]!.created_at, slice[slice.length - 1]!.id)
        : undefined;

    return { items: slice, cursor };
  }

  async completeAgreement(
    id: string,
    cooperativeDid: string,
  ): Promise<AgreementRow> {
    const existing = await this.db
      .selectFrom('intercoop_agreement')
      .where('id', '=', id)
      .where((eb) =>
        eb.or([
          eb('initiator_did', '=', cooperativeDid),
          eb('responder_did', '=', cooperativeDid),
        ]),
      )
      .select(['id', 'status'])
      .executeTakeFirst();

    if (!existing) throw new NotFoundError('Agreement not found');

    if (existing.status !== 'active') {
      throw new ValidationError(
        `Cannot complete agreement in '${existing.status}' status; must be 'active'`,
      );
    }

    const now = this.clock.now();

    const [row] = await this.db
      .updateTable('intercoop_agreement')
      .set({
        status: 'completed',
        updated_at: now,
        indexed_at: now,
      })
      .where('id', '=', id)
      .returningAll()
      .execute();

    if (!row) throw new NotFoundError('Agreement not found');
    return row;
  }
}
