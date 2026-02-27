import type { Kysely, Selectable } from 'kysely';
import type {
  Database,
  AgreementTable,
  AgreementSignatureTable,
  StakeholderTermsTable,
  AgreementRevisionTable,
} from '@coopsource/db';
import type { DID } from '@coopsource/common';
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@coopsource/common';
import type {
  CreateMasterAgreementInput,
  UpdateMasterAgreementInput,
  CreateStakeholderTermsInput,
} from '@coopsource/common';
import type { IPdsService, IFederationClient, IClock } from '@coopsource/federation';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';
import { emitAppEvent } from '../appview/sse.js';

type AgreementRow = Selectable<AgreementTable>;
type SignatureRow = Selectable<AgreementSignatureTable>;
type TermsRow = Selectable<StakeholderTermsTable>;

type ChangeType =
  | 'created'
  | 'field_update'
  | 'status_change'
  | 'terms_added'
  | 'terms_removed'
  | 'signed'
  | 'signature_retracted'
  | 'voided';

const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['open', 'active', 'voided'],
  open: ['active', 'voided'],
  active: ['amended', 'terminated'],
  amended: ['terminated'],
};

export class AgreementService {
  constructor(
    private db: Kysely<Database>,
    private pdsService: IPdsService,
    private federationClient: IFederationClient,
    private clock: IClock,
  ) {}

  // ─── Helpers ──────────────────────────────────────────────────────────

  private async nextRevisionNumber(agreementUri: string): Promise<number> {
    const last = await this.db
      .selectFrom('agreement_revision')
      .where('agreement_uri', '=', agreementUri)
      .select('revision_number')
      .orderBy('revision_number', 'desc')
      .limit(1)
      .executeTakeFirst();
    return (last?.revision_number ?? 0) + 1;
  }

  private async insertRevision(
    agreementUri: string,
    changedBy: string,
    changeType: ChangeType,
    opts: {
      fieldChanges?: Record<string, unknown>;
      snapshot?: Record<string, unknown>;
    } = {},
  ): Promise<void> {
    const revisionNumber = await this.nextRevisionNumber(agreementUri);
    await this.db
      .insertInto('agreement_revision')
      .values({
        agreement_uri: agreementUri,
        revision_number: revisionNumber,
        changed_by: changedBy,
        change_type: changeType,
        field_changes: opts.fieldChanges
          ? JSON.stringify(opts.fieldChanges)
          : null,
        snapshot: opts.snapshot ? JSON.stringify(opts.snapshot) : null,
        created_at: this.clock.now(),
      })
      .execute();
  }

  private rowToSnapshot(row: AgreementRow): Record<string, unknown> {
    return {
      uri: row.uri,
      title: row.title,
      purpose: row.purpose,
      scope: row.scope,
      body: row.body,
      agreementType: row.agreement_type,
      status: row.status,
      version: row.version,
      governanceFramework: row.governance_framework,
      disputeResolution: row.dispute_resolution,
      amendmentProcess: row.amendment_process,
      terminationConditions: row.termination_conditions,
    };
  }

  private validateTransition(currentStatus: string, newStatus: string): void {
    const allowed = STATUS_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new ValidationError(
        `Cannot transition from '${currentStatus}' to '${newStatus}'`,
      );
    }
  }

  // ─── Agreement CRUD ──────────────────────────────────────────────────

  async createAgreement(
    did: string,
    cooperativeDid: string,
    data: CreateMasterAgreementInput & { body?: string; bodyFormat?: string },
  ): Promise<AgreementRow> {
    const now = this.clock.now();

    const ref = await this.pdsService.createRecord({
      did: did as DID,
      collection: 'network.coopsource.agreement.master',
      record: {
        projectUri: cooperativeDid,
        title: data.title,
        purpose: data.purpose ?? '',
        scope: data.scope ?? '',
        agreementType: data.agreementType,
        body: data.body ?? '',
        governanceFramework: data.governanceFramework ?? null,
        disputeResolution: data.disputeResolution ?? null,
        amendmentProcess: data.amendmentProcess ?? null,
        terminationConditions: data.terminationConditions ?? null,
        status: 'draft',
        version: 1,
        createdAt: now.toISOString(),
      },
    });

    const rkey = ref.uri.split('/').pop()!;
    const [row] = await this.db
      .insertInto('agreement')
      .values({
        uri: ref.uri,
        did,
        rkey,
        project_uri: cooperativeDid,
        title: data.title,
        version: 1,
        purpose: data.purpose ?? null,
        scope: data.scope ?? null,
        agreement_type: data.agreementType,
        body: data.body ?? null,
        body_format: data.bodyFormat ?? 'markdown',
        created_by: did,
        governance_framework: data.governanceFramework
          ? JSON.stringify(data.governanceFramework)
          : null,
        dispute_resolution: data.disputeResolution
          ? JSON.stringify(data.disputeResolution)
          : null,
        amendment_process: data.amendmentProcess
          ? JSON.stringify(data.amendmentProcess)
          : null,
        termination_conditions: data.terminationConditions
          ? JSON.stringify(data.terminationConditions)
          : null,
        status: 'draft',
        effective_date: null,
        created_at: now,
        updated_at: now,
        indexed_at: now,
      })
      .returningAll()
      .execute();

    await this.insertRevision(ref.uri, did, 'created', {
      snapshot: this.rowToSnapshot(row!),
    });

    emitAppEvent({
      type: 'agreement.created',
      data: { did, uri: row!.uri, title: data.title },
      cooperativeDid,
    });

    return row!;
  }

  async getAgreement(uri: string): Promise<AgreementRow & { signatureCount: number; signatures: SignatureRow[] }> {
    const row = await this.db
      .selectFrom('agreement')
      .where('uri', '=', uri)
      .selectAll()
      .executeTakeFirst();

    if (!row) throw new NotFoundError('Agreement not found');

    const signatures = await this.db
      .selectFrom('agreement_signature')
      .where('agreement_uri', '=', uri)
      .where('retracted_at', 'is', null)
      .selectAll()
      .execute();

    return {
      ...row,
      signatureCount: signatures.length,
      signatures,
    };
  }

  async listAgreements(
    cooperativeDid: string,
    params: PageParams & { status?: string },
  ): Promise<Page<AgreementRow>> {
    const limit = params.limit ?? 50;
    let query = this.db
      .selectFrom('agreement')
      .where('project_uri', '=', cooperativeDid)
      .selectAll()
      .orderBy('created_at', 'desc')
      .orderBy('uri', 'desc')
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
            eb('uri', '<', i),
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
            slice[slice.length - 1]!.uri,
          )
        : undefined;

    return { items: slice, cursor };
  }

  async updateAgreement(
    uri: string,
    actorDid: string,
    data: UpdateMasterAgreementInput & { body?: string; bodyFormat?: string },
  ): Promise<AgreementRow> {
    const existing = await this.db
      .selectFrom('agreement')
      .where('uri', '=', uri)
      .selectAll()
      .executeTakeFirst();

    if (!existing) throw new NotFoundError('Agreement not found');

    if (existing.status !== 'draft') {
      throw new ValidationError('Only draft agreements can be updated');
    }

    const now = this.clock.now();
    const fieldChanges: Record<string, { from: unknown; to: unknown }> = {};

    const updates: Record<string, unknown> = {
      updated_at: now,
      indexed_at: now,
    };

    if (data.title !== undefined && data.title !== existing.title) {
      fieldChanges.title = { from: existing.title, to: data.title };
      updates.title = data.title;
    }
    if (data.purpose !== undefined && data.purpose !== existing.purpose) {
      fieldChanges.purpose = { from: existing.purpose, to: data.purpose };
      updates.purpose = data.purpose;
    }
    if (data.scope !== undefined && data.scope !== existing.scope) {
      fieldChanges.scope = { from: existing.scope, to: data.scope };
      updates.scope = data.scope;
    }
    if (data.body !== undefined && data.body !== existing.body) {
      fieldChanges.body = { from: existing.body, to: data.body };
      updates.body = data.body;
    }
    if (data.bodyFormat !== undefined && data.bodyFormat !== existing.body_format) {
      fieldChanges.bodyFormat = { from: existing.body_format, to: data.bodyFormat };
      updates.body_format = data.bodyFormat;
    }
    if (data.governanceFramework !== undefined) {
      updates.governance_framework = JSON.stringify(data.governanceFramework);
      fieldChanges.governanceFramework = {
        from: existing.governance_framework,
        to: data.governanceFramework,
      };
    }
    if (data.disputeResolution !== undefined) {
      updates.dispute_resolution = JSON.stringify(data.disputeResolution);
      fieldChanges.disputeResolution = {
        from: existing.dispute_resolution,
        to: data.disputeResolution,
      };
    }
    if (data.amendmentProcess !== undefined) {
      updates.amendment_process = JSON.stringify(data.amendmentProcess);
      fieldChanges.amendmentProcess = {
        from: existing.amendment_process,
        to: data.amendmentProcess,
      };
    }
    if (data.terminationConditions !== undefined) {
      updates.termination_conditions = JSON.stringify(data.terminationConditions);
      fieldChanges.terminationConditions = {
        from: existing.termination_conditions,
        to: data.terminationConditions,
      };
    }
    if (data.effectiveDate !== undefined) {
      updates.effective_date = new Date(data.effectiveDate);
    }

    const [row] = await this.db
      .updateTable('agreement')
      .set(updates)
      .where('uri', '=', uri)
      .returningAll()
      .execute();

    if (Object.keys(fieldChanges).length > 0) {
      await this.insertRevision(uri, actorDid, 'field_update', {
        fieldChanges,
      });
    }

    return row!;
  }

  // ─── Status Transitions ──────────────────────────────────────────────

  private async transitionStatus(
    uri: string,
    actorDid: string,
    newStatus: string,
  ): Promise<AgreementRow> {
    const existing = await this.db
      .selectFrom('agreement')
      .where('uri', '=', uri)
      .selectAll()
      .executeTakeFirst();

    if (!existing) throw new NotFoundError('Agreement not found');
    this.validateTransition(existing.status, newStatus);

    const now = this.clock.now();
    const updates: Record<string, unknown> = {
      status: newStatus,
      updated_at: now,
      indexed_at: now,
    };

    if (
      (newStatus === 'active' || newStatus === 'open') &&
      !existing.effective_date
    ) {
      updates.effective_date = now;
    }

    const [row] = await this.db
      .updateTable('agreement')
      .set(updates)
      .where('uri', '=', uri)
      .returningAll()
      .execute();

    await this.insertRevision(uri, actorDid, 'status_change', {
      fieldChanges: { status: { from: existing.status, to: newStatus } },
    });

    return row!;
  }

  async openAgreement(uri: string, actorDid: string): Promise<AgreementRow> {
    const row = await this.transitionStatus(uri, actorDid, 'open');
    emitAppEvent({
      type: 'agreement.opened',
      data: { uri, title: row.title },
      cooperativeDid: row.project_uri,
    });
    return row;
  }

  async activateAgreement(uri: string, actorDid: string): Promise<AgreementRow> {
    const row = await this.transitionStatus(uri, actorDid, 'active');
    emitAppEvent({
      type: 'agreement.activated',
      data: { uri, title: row.title },
      cooperativeDid: row.project_uri,
    });
    return row;
  }

  async terminateAgreement(uri: string, actorDid: string): Promise<AgreementRow> {
    return this.transitionStatus(uri, actorDid, 'terminated');
  }

  async voidAgreement(uri: string, actorDid: string): Promise<AgreementRow> {
    // Void can happen from any status
    const existing = await this.db
      .selectFrom('agreement')
      .where('uri', '=', uri)
      .selectAll()
      .executeTakeFirst();

    if (!existing) throw new NotFoundError('Agreement not found');

    const now = this.clock.now();
    const [row] = await this.db
      .updateTable('agreement')
      .set({ status: 'voided', updated_at: now, indexed_at: now })
      .where('uri', '=', uri)
      .returningAll()
      .execute();

    await this.insertRevision(uri, actorDid, 'voided', {
      fieldChanges: { status: { from: existing.status, to: 'voided' } },
    });

    emitAppEvent({
      type: 'agreement.voided',
      data: { uri, title: existing.title },
      cooperativeDid: existing.project_uri,
    });

    return row!;
  }

  // ─── Signing ─────────────────────────────────────────────────────────

  async signAgreement(
    uri: string,
    signerDid: string,
    statement?: string,
  ): Promise<SignatureRow> {
    const agreement = await this.db
      .selectFrom('agreement')
      .where('uri', '=', uri)
      .selectAll()
      .executeTakeFirst();

    if (!agreement) throw new NotFoundError('Agreement not found');
    if (agreement.status !== 'open') {
      throw new ValidationError('Agreement is not open for signing');
    }

    const now = this.clock.now();

    const ref = await this.pdsService.createRecord({
      did: signerDid as DID,
      collection: 'network.coopsource.agreement.signature',
      record: {
        agreement: agreement.uri,
        agreementCid: '',
        statement,
        signedAt: now.toISOString(),
      },
    });

    const [sig] = await this.db
      .insertInto('agreement_signature')
      .values({
        uri: ref.uri,
        cid: ref.cid,
        agreement_id: null,
        agreement_uri: agreement.uri,
        agreement_cid: '',
        signer_did: signerDid,
        statement: statement ?? null,
        signed_at: now,
        created_at: now,
        indexed_at: now,
      })
      .returningAll()
      .execute();

    await this.insertRevision(uri, signerDid, 'signed', {
      fieldChanges: { signerDid, signatureUri: ref.uri },
    });

    emitAppEvent({
      type: 'agreement.signed',
      data: { uri, signerDid },
      cooperativeDid: agreement.project_uri,
    });

    return sig!;
  }

  async retractSignature(
    uri: string,
    signerDid: string,
    reason?: string,
  ): Promise<void> {
    const sig = await this.db
      .selectFrom('agreement_signature')
      .where('agreement_uri', '=', uri)
      .where('signer_did', '=', signerDid)
      .where('retracted_at', 'is', null)
      .select('id')
      .executeTakeFirst();

    if (!sig) throw new NotFoundError('Signature not found');

    const now = this.clock.now();
    await this.db
      .updateTable('agreement_signature')
      .set({
        retracted_at: now,
        retracted_by: signerDid,
        retraction_reason: reason ?? null,
      })
      .where('id', '=', sig.id)
      .execute();

    await this.insertRevision(uri, signerDid, 'signature_retracted', {
      fieldChanges: { signerDid, reason: reason ?? null },
    });
  }

  // ─── Stakeholder Terms ───────────────────────────────────────────────

  async addStakeholderTerms(
    did: string,
    agreementUri: string,
    data: CreateStakeholderTermsInput,
  ): Promise<TermsRow> {
    const agreement = await this.db
      .selectFrom('agreement')
      .where('uri', '=', agreementUri)
      .selectAll()
      .executeTakeFirst();

    if (!agreement) throw new NotFoundError('Agreement not found');

    const now = this.clock.now();

    const ref = await this.pdsService.createRecord({
      did: did as DID,
      collection: 'network.coopsource.agreement.stakeholderTerms',
      record: {
        agreementUri,
        stakeholderDid: data.stakeholderDid,
        stakeholderType: data.stakeholderType,
        stakeholderClass: data.stakeholderClass ?? null,
        contributions: data.contributions ?? [],
        financialTerms: data.financialTerms ?? {},
        ipTerms: data.ipTerms ?? {},
        governanceRights: data.governanceRights ?? {},
        exitTerms: data.exitTerms ?? {},
        createdAt: now.toISOString(),
      },
    });

    const rkey = ref.uri.split('/').pop()!;
    const [row] = await this.db
      .insertInto('stakeholder_terms')
      .values({
        uri: ref.uri,
        did,
        rkey,
        agreement_uri: agreementUri,
        stakeholder_did: data.stakeholderDid,
        stakeholder_type: data.stakeholderType,
        stakeholder_class: data.stakeholderClass ?? null,
        contributions: JSON.stringify(data.contributions ?? []),
        financial_terms: JSON.stringify(data.financialTerms ?? {}),
        ip_terms: JSON.stringify(data.ipTerms ?? {}),
        governance_rights: JSON.stringify(data.governanceRights ?? {}),
        exit_terms: JSON.stringify(data.exitTerms ?? {}),
        signed_at: null,
        created_at: now,
        indexed_at: now,
      })
      .returningAll()
      .execute();

    await this.insertRevision(agreementUri, did, 'terms_added', {
      fieldChanges: {
        termsUri: ref.uri,
        stakeholderDid: data.stakeholderDid,
      },
    });

    emitAppEvent({
      type: 'stakeholderTerms.added',
      data: { did, uri: row!.uri, agreementUri },
      cooperativeDid: agreement.project_uri,
    });

    return row!;
  }

  async listStakeholderTerms(agreementUri: string): Promise<TermsRow[]> {
    return this.db
      .selectFrom('stakeholder_terms')
      .where('agreement_uri', '=', agreementUri)
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();
  }

  async removeStakeholderTerms(
    termsUri: string,
    actorDid: string,
  ): Promise<void> {
    const terms = await this.db
      .selectFrom('stakeholder_terms')
      .where('uri', '=', termsUri)
      .selectAll()
      .executeTakeFirst();

    if (!terms) throw new NotFoundError('Stakeholder terms not found');

    const agreement = await this.db
      .selectFrom('agreement')
      .where('uri', '=', terms.agreement_uri)
      .selectAll()
      .executeTakeFirst();

    if (!agreement) throw new NotFoundError('Agreement not found');

    if (agreement.status !== 'draft') {
      throw new ValidationError(
        'Can only remove terms from draft agreements',
      );
    }

    await this.db
      .deleteFrom('stakeholder_terms')
      .where('uri', '=', termsUri)
      .execute();

    await this.insertRevision(terms.agreement_uri, actorDid, 'terms_removed', {
      fieldChanges: {
        termsUri,
        stakeholderDid: terms.stakeholder_did,
      },
    });
  }

  // ─── Audit Trail ─────────────────────────────────────────────────────

  async getAgreementHistory(
    agreementUri: string,
  ): Promise<Selectable<AgreementRevisionTable>[]> {
    return this.db
      .selectFrom('agreement_revision')
      .where('agreement_uri', '=', agreementUri)
      .selectAll()
      .orderBy('revision_number', 'asc')
      .execute();
  }
}
