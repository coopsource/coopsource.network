import type { Kysely, Selectable } from 'kysely';
import type { Database, ReportTemplateTable, ReportSnapshotTable } from '@coopsource/db';
import { NotFoundError, ConflictError } from '@coopsource/common';
import type { IClock } from '@coopsource/federation';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

type TemplateRow = Selectable<ReportTemplateTable>;
type SnapshotRow = Selectable<ReportSnapshotTable>;

export class ReportingService {
  constructor(
    private db: Kysely<Database>,
    private clock: IClock,
  ) {}

  async createTemplate(
    cooperativeDid: string,
    createdBy: string,
    data: {
      name: string;
      reportType: string;
      config?: Record<string, unknown>;
    },
  ): Promise<TemplateRow> {
    const now = this.clock.now();

    try {
      const [row] = await this.db
        .insertInto('report_template')
        .values({
          cooperative_did: cooperativeDid,
          name: data.name,
          report_type: data.reportType,
          config: data.config ? JSON.stringify(data.config) : '{}',
          created_by: createdBy,
          created_at: now,
          updated_at: now,
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
        throw new ConflictError('Report template with this name already exists');
      }
      throw err;
    }
  }

  async listTemplates(cooperativeDid: string): Promise<TemplateRow[]> {
    return await this.db
      .selectFrom('report_template')
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .orderBy('created_at', 'asc')
      .execute();
  }

  async deleteTemplate(id: string, cooperativeDid: string): Promise<void> {
    const result = await this.db
      .deleteFrom('report_template')
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .executeTakeFirst();

    if (result.numDeletedRows === 0n) {
      throw new NotFoundError('Report template not found');
    }
  }

  async generateReport(
    cooperativeDid: string,
    generatedBy: string,
    data: {
      templateId?: string;
      reportType: string;
      title: string;
      periodStart?: string;
      periodEnd?: string;
    },
  ): Promise<SnapshotRow> {
    const now = this.clock.now();

    // Aggregate data based on report type
    const reportData = await this.aggregateReportData(
      cooperativeDid,
      data.reportType,
      data.periodStart,
      data.periodEnd,
      data.templateId,
    );

    const [row] = await this.db
      .insertInto('report_snapshot')
      .values({
        cooperative_did: cooperativeDid,
        template_id: data.templateId ?? null,
        report_type: data.reportType,
        title: data.title,
        data: JSON.stringify(reportData),
        generated_by: generatedBy,
        generated_at: now,
        period_start: data.periodStart ? new Date(data.periodStart) : null,
        period_end: data.periodEnd ? new Date(data.periodEnd) : null,
      })
      .returningAll()
      .execute();

    return row!;
  }

  async getReport(id: string, cooperativeDid: string): Promise<SnapshotRow> {
    const row = await this.db
      .selectFrom('report_snapshot')
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .executeTakeFirst();

    if (!row) throw new NotFoundError('Report not found');
    return row;
  }

  async listReports(
    cooperativeDid: string,
    params: PageParams,
    filters?: { reportType?: string },
  ): Promise<Page<SnapshotRow>> {
    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('report_snapshot')
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .orderBy('generated_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1);

    if (filters?.reportType) {
      query = query.where('report_type', '=', filters.reportType);
    }

    if (params.cursor) {
      const { t, i } = decodeCursor(params.cursor);
      query = query.where((eb) =>
        eb.or([
          eb('generated_at', '<', new Date(t)),
          eb.and([
            eb('generated_at', '=', new Date(t)),
            eb('id', '<', i),
          ]),
        ]),
      );
    }

    const rows = await query.execute();
    const slice = rows.slice(0, limit);
    const cursor =
      rows.length > limit
        ? encodeCursor(slice[slice.length - 1]!.generated_at, slice[slice.length - 1]!.id)
        : undefined;

    return { items: slice, cursor };
  }

  private async aggregateReportData(
    cooperativeDid: string,
    reportType: string,
    periodStart?: string,
    periodEnd?: string,
    templateId?: string,
  ): Promise<Record<string, unknown>> {
    switch (reportType) {
      case 'annual':
        return this.aggregateAnnualData(cooperativeDid, periodStart, periodEnd);
      case 'board_packet':
        return this.aggregateBoardPacketData(cooperativeDid);
      case 'equity_statement':
        return this.aggregateEquityStatementData(cooperativeDid);
      case 'patronage':
        return this.aggregatePatronageData(cooperativeDid, periodStart, periodEnd);
      case 'commerce':
        return this.aggregateCommerceData(cooperativeDid);
      case 'custom':
        return this.aggregateCustomData(cooperativeDid, templateId);
      default:
        return { reportType, message: 'Unknown report type' };
    }
  }

  private async aggregateAnnualData(
    cooperativeDid: string,
    periodStart?: string,
    periodEnd?: string,
  ): Promise<Record<string, unknown>> {
    const proposalCount = await this.db
      .selectFrom('proposal')
      .where('cooperative_did', '=', cooperativeDid)
      .$if(!!periodStart, (qb) => qb.where('created_at', '>=', new Date(periodStart!)))
      .$if(!!periodEnd, (qb) => qb.where('created_at', '<=', new Date(periodEnd!)))
      .select((eb) => eb.fn.count('id').as('count'))
      .executeTakeFirst();

    const agreementCount = await this.db
      .selectFrom('agreement')
      .where('project_uri', '=', cooperativeDid)
      .$if(!!periodStart, (qb) => qb.where('created_at', '>=', new Date(periodStart!)))
      .$if(!!periodEnd, (qb) => qb.where('created_at', '<=', new Date(periodEnd!)))
      .select((eb) => eb.fn.count('uri').as('count'))
      .executeTakeFirst();

    const memberCount = await this.db
      .selectFrom('membership')
      .where('cooperative_did', '=', cooperativeDid)
      .where('status', '=', 'active')
      .select((eb) => eb.fn.count('id').as('count'))
      .executeTakeFirst();

    const revenueResult = await this.db
      .selectFrom('revenue_entry')
      .where('cooperative_did', '=', cooperativeDid)
      .$if(!!periodStart, (qb) => qb.where('recorded_at', '>=', new Date(periodStart!)))
      .$if(!!periodEnd, (qb) => qb.where('recorded_at', '<=', new Date(periodEnd!)))
      .select((eb) => eb.fn.sum('amount').as('total'))
      .executeTakeFirst();

    const expenseResult = await this.db
      .selectFrom('expense')
      .where('cooperative_did', '=', cooperativeDid)
      .where('status', '=', 'approved')
      .$if(!!periodStart, (qb) => qb.where('created_at', '>=', new Date(periodStart!)))
      .$if(!!periodEnd, (qb) => qb.where('created_at', '<=', new Date(periodEnd!)))
      .select((eb) => eb.fn.sum('amount').as('total'))
      .executeTakeFirst();

    return {
      proposalCount: Number(proposalCount?.count ?? 0),
      agreementCount: Number(agreementCount?.count ?? 0),
      memberCount: Number(memberCount?.count ?? 0),
      totalRevenue: Number(revenueResult?.total ?? 0),
      totalExpenses: Number(expenseResult?.total ?? 0),
      periodStart,
      periodEnd,
    };
  }

  private async aggregateBoardPacketData(
    cooperativeDid: string,
  ): Promise<Record<string, unknown>> {
    const recentProposals = await this.db
      .selectFrom('proposal')
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .orderBy('created_at', 'desc')
      .limit(10)
      .execute();

    const upcomingCompliance = await this.db
      .selectFrom('compliance_item')
      .where('cooperative_did', '=', cooperativeDid)
      .where('status', 'in', ['upcoming', 'due', 'overdue'])
      .selectAll()
      .orderBy('due_date', 'asc')
      .limit(10)
      .execute();

    const recentMeetings = await this.db
      .selectFrom('meeting_record')
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .orderBy('meeting_date', 'desc')
      .limit(5)
      .execute();

    return {
      recentProposals: recentProposals.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        createdAt: p.created_at,
      })),
      upcomingCompliance: upcomingCompliance.map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        dueDate: c.due_date,
      })),
      recentMeetings: recentMeetings.map((m) => ({
        id: m.id,
        title: m.title,
        meetingDate: m.meeting_date,
      })),
    };
  }

  private async aggregateEquityStatementData(
    cooperativeDid: string,
  ): Promise<Record<string, unknown>> {
    const accounts = await this.db
      .selectFrom('capital_account')
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .orderBy('member_did', 'asc')
      .execute();

    return {
      accounts: accounts.map((a) => ({
        memberDid: a.member_did,
        balance: Number(a.balance),
        initialContribution: Number(a.initial_contribution),
        totalPatronageAllocated: Number(a.total_patronage_allocated),
        totalRedeemed: Number(a.total_redeemed),
      })),
      totalEquity: accounts.reduce((sum, a) => sum + Number(a.balance), 0),
      memberCount: new Set(accounts.map((a) => a.member_did)).size,
    };
  }

  private async aggregatePatronageData(
    cooperativeDid: string,
    periodStart?: string,
    periodEnd?: string,
  ): Promise<Record<string, unknown>> {
    let query = this.db
      .selectFrom('patronage_record')
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .orderBy('created_at', 'desc');

    if (periodStart) {
      query = query.where('created_at', '>=', new Date(periodStart));
    }
    if (periodEnd) {
      query = query.where('created_at', '<=', new Date(periodEnd));
    }

    const records = await query.execute();

    return {
      records: records.map((r) => ({
        memberDid: r.member_did,
        totalAllocation: Number(r.total_allocation),
        cashAmount: Number(r.cash_amount),
        retainedAmount: Number(r.retained_amount),
        status: r.status,
      })),
      totalAllocated: records.reduce((sum, r) => sum + Number(r.total_allocation), 0),
      totalCash: records.reduce((sum, r) => sum + Number(r.cash_amount), 0),
      totalRetained: records.reduce((sum, r) => sum + Number(r.retained_amount), 0),
      recordCount: records.length,
    };
  }

  private async aggregateCommerceData(
    cooperativeDid: string,
  ): Promise<Record<string, unknown>> {
    const listingCount = await this.db
      .selectFrom('commerce_listing')
      .where('cooperative_did', '=', cooperativeDid)
      .select((eb) => eb.fn.count('id').as('count'))
      .executeTakeFirst();

    const needCount = await this.db
      .selectFrom('commerce_need')
      .where('cooperative_did', '=', cooperativeDid)
      .select((eb) => eb.fn.count('id').as('count'))
      .executeTakeFirst();

    const agreementCount = await this.db
      .selectFrom('intercoop_agreement')
      .where((eb) =>
        eb.or([
          eb('initiator_did', '=', cooperativeDid),
          eb('responder_did', '=', cooperativeDid),
        ]),
      )
      .select((eb) => eb.fn.count('id').as('count'))
      .executeTakeFirst();

    return {
      listingCount: Number(listingCount?.count ?? 0),
      needCount: Number(needCount?.count ?? 0),
      intercoopAgreementCount: Number(agreementCount?.count ?? 0),
    };
  }

  private async aggregateCustomData(
    cooperativeDid: string,
    templateId?: string,
  ): Promise<Record<string, unknown>> {
    if (templateId) {
      const template = await this.db
        .selectFrom('report_template')
        .where('id', '=', templateId)
        .where('cooperative_did', '=', cooperativeDid)
        .selectAll()
        .executeTakeFirst();

      if (template) {
        return {
          templateName: template.name,
          templateConfig: template.config,
          generatedAt: this.clock.now().toISOString(),
        };
      }
    }

    return {
      message: 'Custom report with no template configuration',
      generatedAt: this.clock.now().toISOString(),
    };
  }
}
