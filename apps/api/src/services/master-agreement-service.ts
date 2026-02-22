import type { Kysely, Selectable } from 'kysely';
import type {
  Database,
  MasterAgreementTable,
  StakeholderTermsTable,
} from '@coopsource/db';
import type { DID } from '@coopsource/common';
import {
  NotFoundError,
  ValidationError,
} from '@coopsource/common';
import type {
  CreateMasterAgreementInput,
  UpdateMasterAgreementInput,
  CreateStakeholderTermsInput,
} from '@coopsource/common';
import type { IPdsService, IClock } from '@coopsource/federation';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';
import { emitAppEvent } from '../appview/sse.js';

type AgreementRow = Selectable<MasterAgreementTable>;
type TermsRow = Selectable<StakeholderTermsTable>;

export class MasterAgreementService {
  constructor(
    private db: Kysely<Database>,
    private pdsService: IPdsService,
    private clock: IClock,
  ) {}

  // ─── Master Agreements ──────────────────────────────────────────────

  async createMasterAgreement(
    did: string,
    cooperativeDid: string,
    data: CreateMasterAgreementInput,
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
      .insertInto('master_agreement')
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

    emitAppEvent({
      type: 'masterAgreement.created',
      data: { did, uri: row!.uri, title: data.title },
      cooperativeDid,
    });

    return row!;
  }

  async getMasterAgreement(uri: string): Promise<AgreementRow> {
    const row = await this.db
      .selectFrom('master_agreement')
      .where('uri', '=', uri)
      .selectAll()
      .executeTakeFirst();

    if (!row) throw new NotFoundError('Master agreement not found');
    return row;
  }

  async listMasterAgreements(
    cooperativeDid: string,
    params: PageParams & { status?: string },
  ): Promise<Page<AgreementRow>> {
    const limit = params.limit ?? 50;
    let query = this.db
      .selectFrom('master_agreement')
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

  async updateMasterAgreement(
    uri: string,
    cooperativeDid: string,
    data: UpdateMasterAgreementInput,
  ): Promise<AgreementRow> {
    const existing = await this.getMasterAgreement(uri);

    if (existing.status !== 'draft') {
      throw new ValidationError('Only draft agreements can be updated');
    }

    const now = this.clock.now();

    const updates: Record<string, unknown> = {
      updated_at: now,
      indexed_at: now,
    };
    if (data.title !== undefined) updates.title = data.title;
    if (data.purpose !== undefined) updates.purpose = data.purpose;
    if (data.scope !== undefined) updates.scope = data.scope;
    if (data.governanceFramework !== undefined)
      updates.governance_framework = JSON.stringify(data.governanceFramework);
    if (data.disputeResolution !== undefined)
      updates.dispute_resolution = JSON.stringify(data.disputeResolution);
    if (data.amendmentProcess !== undefined)
      updates.amendment_process = JSON.stringify(data.amendmentProcess);
    if (data.terminationConditions !== undefined)
      updates.termination_conditions = JSON.stringify(data.terminationConditions);
    if (data.effectiveDate !== undefined)
      updates.effective_date = new Date(data.effectiveDate);

    const [row] = await this.db
      .updateTable('master_agreement')
      .set(updates)
      .where('uri', '=', uri)
      .returningAll()
      .execute();

    return row!;
  }

  async updateMasterAgreementStatus(
    uri: string,
    cooperativeDid: string,
    newStatus: string,
  ): Promise<AgreementRow> {
    const existing = await this.getMasterAgreement(uri);

    const allowed: Record<string, string[]> = {
      draft: ['active'],
      active: ['amended', 'terminated'],
    };

    const validTransitions = allowed[existing.status] ?? [];
    if (!validTransitions.includes(newStatus)) {
      throw new ValidationError(
        `Cannot transition from '${existing.status}' to '${newStatus}'`,
      );
    }

    const now = this.clock.now();
    const updates: Record<string, unknown> = {
      status: newStatus,
      updated_at: now,
      indexed_at: now,
    };

    if (newStatus === 'active' && !existing.effective_date) {
      updates.effective_date = now;
    }

    const [row] = await this.db
      .updateTable('master_agreement')
      .set(updates)
      .where('uri', '=', uri)
      .returningAll()
      .execute();

    if (newStatus === 'active') {
      emitAppEvent({
        type: 'masterAgreement.activated',
        data: { uri, title: existing.title },
        cooperativeDid,
      });
    }

    return row!;
  }

  // ─── Stakeholder Terms ──────────────────────────────────────────────

  async addStakeholderTerms(
    did: string,
    masterAgreementUri: string,
    data: CreateStakeholderTermsInput,
  ): Promise<TermsRow> {
    const agreement = await this.getMasterAgreement(masterAgreementUri);
    const now = this.clock.now();

    const ref = await this.pdsService.createRecord({
      did: did as DID,
      collection: 'network.coopsource.agreement.stakeholderTerms',
      record: {
        masterAgreementUri,
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
        master_agreement_uri: masterAgreementUri,
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

    emitAppEvent({
      type: 'stakeholderTerms.added',
      data: { did, uri: row!.uri, masterAgreementUri },
      cooperativeDid: agreement.project_uri,
    });

    return row!;
  }

  async getStakeholderTerms(uri: string): Promise<TermsRow> {
    const row = await this.db
      .selectFrom('stakeholder_terms')
      .where('uri', '=', uri)
      .selectAll()
      .executeTakeFirst();

    if (!row) throw new NotFoundError('Stakeholder terms not found');
    return row;
  }

  async listStakeholderTerms(masterAgreementUri: string): Promise<TermsRow[]> {
    return this.db
      .selectFrom('stakeholder_terms')
      .where('master_agreement_uri', '=', masterAgreementUri)
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();
  }

  async removeStakeholderTerms(uri: string, actorDid: string): Promise<void> {
    const terms = await this.getStakeholderTerms(uri);
    const agreement = await this.getMasterAgreement(terms.master_agreement_uri);

    if (agreement.status !== 'draft') {
      throw new ValidationError('Can only remove terms from draft agreements');
    }

    await this.db
      .deleteFrom('stakeholder_terms')
      .where('uri', '=', uri)
      .execute();
  }
}
