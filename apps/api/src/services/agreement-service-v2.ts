import type { Kysely, Selectable } from 'kysely';
import type { Database, AgreementTable, AgreementSignatureTable } from '@coopsource/db';

type AgreementRow = Selectable<AgreementTable>;
type AgreementSignatureRow = Selectable<AgreementSignatureTable>;
import type { DID } from '@coopsource/common';
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@coopsource/common';
import type { IPdsService, IClock } from '@coopsource/federation';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

export interface AgreementWithParties {
  agreement: AgreementRow;
  parties: Array<{ entityDid: string; required: boolean }>;
  signatures: AgreementSignatureRow[];
}

export interface CreateAgreementInput {
  cooperativeDid: string;
  title: string;
  body: string;
  bodyFormat?: string;
  agreementType: string;
  partyDids?: string[];
}

export class AgreementServiceV2 {
  constructor(
    private db: Kysely<Database>,
    private pdsService: IPdsService,
    private clock: IClock,
  ) {}

  async listAgreements(
    cooperativeDid: string,
    params: PageParams,
  ): Promise<Page<AgreementRow>> {
    const limit = params.limit ?? 50;
    let query = this.db
      .selectFrom('agreement')
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

  async getAgreement(id: string): Promise<AgreementWithParties | null> {
    const agreement = await this.db
      .selectFrom('agreement')
      .where('id', '=', id)
      .where('invalidated_at', 'is', null)
      .selectAll()
      .executeTakeFirst();

    if (!agreement) return null;

    const parties = await this.db
      .selectFrom('agreement_party')
      .where('agreement_id', '=', id)
      .select(['entity_did', 'required'])
      .execute();

    const signatures = await this.db
      .selectFrom('agreement_signature')
      .where('agreement_id', '=', id)
      .where('retracted_at', 'is', null)
      .selectAll()
      .execute();

    return {
      agreement,
      parties: parties.map((p) => ({
        entityDid: p.entity_did,
        required: p.required,
      })),
      signatures,
    };
  }

  async createAgreement(
    createdByDid: string,
    data: CreateAgreementInput,
  ): Promise<AgreementRow> {
    const now = this.clock.now();

    // Write PDS record
    const ref = await this.pdsService.createRecord({
      did: createdByDid as DID,
      collection: 'network.coopsource.agreement.master',
      record: {
        title: data.title,
        body: data.body,
        agreementType: data.agreementType,
        cooperative: data.cooperativeDid,
        createdAt: now.toISOString(),
      },
    });

    const [row] = await this.db
      .insertInto('agreement')
      .values({
        uri: ref.uri,
        cid: ref.cid,
        cooperative_did: data.cooperativeDid,
        created_by: createdByDid,
        title: data.title,
        body: data.body,
        body_format: data.bodyFormat ?? 'text',
        agreement_type: data.agreementType,
        status: 'draft',
        created_at: now,
        indexed_at: now,
      })
      .returningAll()
      .execute();

    // Add parties
    if (data.partyDids && data.partyDids.length > 0) {
      await this.db
        .insertInto('agreement_party')
        .values(
          data.partyDids.map((did) => ({
            agreement_id: row!.id,
            entity_did: did,
            required: true,
            added_at: now,
          })),
        )
        .execute();
    }

    return row!;
  }

  async openAgreement(
    id: string,
    actorDid: string,
  ): Promise<AgreementRow> {
    const agreement = await this.db
      .selectFrom('agreement')
      .where('id', '=', id)
      .where('invalidated_at', 'is', null)
      .selectAll()
      .executeTakeFirst();

    if (!agreement) throw new NotFoundError('Agreement not found');
    if (agreement.created_by !== actorDid) {
      throw new UnauthorizedError('Not the agreement author');
    }
    if (agreement.status !== 'draft') {
      throw new ValidationError('Can only open a draft agreement');
    }

    const now = this.clock.now();
    const [updated] = await this.db
      .updateTable('agreement')
      .set({ status: 'open', effective_date: now, indexed_at: now })
      .where('id', '=', id)
      .returningAll()
      .execute();

    return updated!;
  }

  async sign(
    agreementId: string,
    signerDid: string,
    statement?: string,
  ): Promise<AgreementSignatureRow> {
    const agreement = await this.db
      .selectFrom('agreement')
      .where('id', '=', agreementId)
      .where('invalidated_at', 'is', null)
      .selectAll()
      .executeTakeFirst();

    if (!agreement) throw new NotFoundError('Agreement not found');
    if (agreement.status !== 'open') {
      throw new ValidationError('Agreement is not open for signing');
    }

    const now = this.clock.now();

    // Write PDS record
    const ref = await this.pdsService.createRecord({
      did: signerDid as DID,
      collection: 'network.coopsource.agreement.signature',
      record: {
        agreement: agreement.uri,
        agreementCid: agreement.cid,
        statement,
        signedAt: now.toISOString(),
      },
    });

    const [sig] = await this.db
      .insertInto('agreement_signature')
      .values({
        uri: ref.uri,
        cid: ref.cid,
        agreement_id: agreementId,
        agreement_uri: agreement.uri ?? '',
        agreement_cid: agreement.cid ?? '',
        signer_did: signerDid,
        statement: statement ?? null,
        signed_at: now,
        created_at: now,
        indexed_at: now,
      })
      .returningAll()
      .execute();

    return sig!;
  }

  async retractSignature(
    agreementId: string,
    signerDid: string,
    reason?: string,
  ): Promise<void> {
    const sig = await this.db
      .selectFrom('agreement_signature')
      .where('agreement_id', '=', agreementId)
      .where('signer_did', '=', signerDid)
      .where('retracted_at', 'is', null)
      .select('id')
      .executeTakeFirst();

    if (!sig) throw new NotFoundError('Signature not found');

    await this.db
      .updateTable('agreement_signature')
      .set({
        retracted_at: this.clock.now(),
        retracted_by: signerDid,
        retraction_reason: reason ?? null,
      })
      .where('id', '=', sig.id)
      .execute();
  }

  async voidAgreement(
    id: string,
    _actorDid: string,
  ): Promise<AgreementRow> {
    const agreement = await this.db
      .selectFrom('agreement')
      .where('id', '=', id)
      .where('invalidated_at', 'is', null)
      .selectAll()
      .executeTakeFirst();

    if (!agreement) throw new NotFoundError('Agreement not found');

    const now = this.clock.now();
    const [updated] = await this.db
      .updateTable('agreement')
      .set({
        status: 'voided',
        indexed_at: now,
      })
      .where('id', '=', id)
      .returningAll()
      .execute();

    return updated!;
  }
}
