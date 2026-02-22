import type { Kysely, Selectable } from 'kysely';
import type { Database, AgreementTemplateTable, AgreementTable } from '@coopsource/db';
import { NotFoundError } from '@coopsource/common';
import type {
  CreateAgreementTemplateInput,
  UpdateAgreementTemplateInput,
  CreateMasterAgreementInput,
} from '@coopsource/common';
import type { IClock } from '@coopsource/federation';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';
import type { AgreementService } from './agreement-service.js';

type TemplateRow = Selectable<AgreementTemplateTable>;
type AgreementRow = Selectable<AgreementTable>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export class AgreementTemplateService {
  constructor(
    private db: Kysely<Database>,
    private clock: IClock,
  ) {}

  async createTemplate(
    cooperativeDid: string,
    createdBy: string,
    data: CreateAgreementTemplateInput,
  ): Promise<TemplateRow> {
    const now = this.clock.now();

    const [row] = await this.db
      .insertInto('agreement_template')
      .values({
        cooperative_did: cooperativeDid,
        created_by: createdBy,
        name: data.name,
        description: data.description ?? null,
        agreement_type: data.agreementType,
        template_data: JSON.stringify(data.templateData ?? {}),
        created_at: now,
        updated_at: now,
      })
      .returningAll()
      .execute();

    return row!;
  }

  async getTemplate(id: string): Promise<TemplateRow> {
    const row = await this.db
      .selectFrom('agreement_template')
      .where('id', '=', id)
      .selectAll()
      .executeTakeFirst();

    if (!row) throw new NotFoundError('Agreement template not found');
    return row;
  }

  async listTemplates(
    cooperativeDid: string,
    params: PageParams,
  ): Promise<Page<TemplateRow>> {
    const limit = params.limit ?? 50;
    let query = this.db
      .selectFrom('agreement_template')
      .where('cooperative_did', '=', cooperativeDid)
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

  async updateTemplate(
    id: string,
    data: UpdateAgreementTemplateInput,
  ): Promise<TemplateRow> {
    const existing = await this.getTemplate(id);

    const now = this.clock.now();
    const updates: Record<string, unknown> = { updated_at: now };

    if (data.name !== undefined) updates.name = data.name;
    if (data.description !== undefined) updates.description = data.description;
    if (data.agreementType !== undefined) updates.agreement_type = data.agreementType;
    if (data.templateData !== undefined) updates.template_data = JSON.stringify(data.templateData);

    const [row] = await this.db
      .updateTable('agreement_template')
      .set(updates)
      .where('id', '=', existing.id)
      .returningAll()
      .execute();

    return row!;
  }

  async deleteTemplate(id: string): Promise<void> {
    const result = await this.db
      .deleteFrom('agreement_template')
      .where('id', '=', id)
      .executeTakeFirst();

    if (result.numDeletedRows === 0n) {
      throw new NotFoundError('Agreement template not found');
    }
  }

  async useTemplate(
    id: string,
    did: string,
    cooperativeDid: string,
    agreementService: AgreementService,
  ): Promise<AgreementRow> {
    const template = await this.getTemplate(id);
    const td = template.template_data;

    const agreement = await agreementService.createAgreement(
      did,
      cooperativeDid,
      {
        title: typeof td.title === 'string' && td.title ? td.title : template.name,
        purpose: typeof td.purpose === 'string' ? td.purpose : undefined,
        scope: typeof td.scope === 'string' ? td.scope : undefined,
        agreementType: template.agreement_type as CreateMasterAgreementInput['agreementType'],
        body: typeof td.body === 'string' ? td.body : undefined,
        bodyFormat: typeof td.bodyFormat === 'string' ? td.bodyFormat : undefined,
        governanceFramework: isRecord(td.governanceFramework) ? td.governanceFramework : undefined,
        disputeResolution: isRecord(td.disputeResolution) ? td.disputeResolution : undefined,
        amendmentProcess: isRecord(td.amendmentProcess) ? td.amendmentProcess : undefined,
        terminationConditions: isRecord(td.terminationConditions) ? td.terminationConditions : undefined,
      },
    );

    return agreement;
  }
}
