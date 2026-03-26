import { sql, type Kysely, type Selectable } from 'kysely';
import type { Database, CollaborativeProjectTable, CollaborativeContributionTable } from '@coopsource/db';
import { NotFoundError, ConflictError } from '@coopsource/common';
import type { DID } from '@coopsource/common';
import type { IClock } from '@coopsource/federation';
import type { IPdsService } from '@coopsource/federation';
import type { OperatorWriteProxy } from './operator-write-proxy.js';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

type ProjectRow = Selectable<CollaborativeProjectTable>;
type ContributionRow = Selectable<CollaborativeContributionTable>;

export class CollaborativeProjectService {
  constructor(
    private db: Kysely<Database>,
    private pdsService: IPdsService,
    private clock: IClock,
    private operatorWriteProxy?: OperatorWriteProxy,
  ) {}

  async createProject(
    hostCooperativeDid: string,
    createdBy: string,
    data: {
      title: string;
      description?: string | null;
      participantDids: string[];
      revenueSplit?: Record<string, unknown> | null;
    },
  ): Promise<ProjectRow> {
    const now = this.clock.now();

    // Best-effort PDS write (with operator audit logging when proxy available)
    let uri: string | null = null;
    let cid: string | null = null;
    try {
      const collection = 'network.coopsource.commerce.collaborativeProject';
      const record = {
        title: data.title,
        description: data.description ?? undefined,
        participantDids: data.participantDids,
        revenueSplit: data.revenueSplit ?? undefined,
        createdBy,
        createdAt: now.toISOString(),
      };
      const result = this.operatorWriteProxy
        ? await this.operatorWriteProxy.writeCoopRecord({
            operatorDid: createdBy, cooperativeDid: hostCooperativeDid as DID, collection, record,
          })
        : await this.pdsService.createRecord({ did: hostCooperativeDid as DID, collection, record });
      uri = result.uri;
      cid = result.cid;
    } catch {
      // PDS write is best-effort; project is still materialized in PostgreSQL
    }

    try {
      const [row] = await this.db
        .insertInto('collaborative_project')
        .values({
          host_cooperative_did: hostCooperativeDid,
          title: data.title,
          description: data.description ?? null,
          status: 'active',
          participant_dids: data.participantDids,
          uri,
          cid,
          revenue_split: data.revenueSplit ?? null,
          created_by: createdBy,
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
        throw new ConflictError('A project with these details already exists');
      }
      throw err;
    }
  }

  async updateProject(
    id: string,
    hostCooperativeDid: string,
    data: {
      title?: string;
      description?: string | null;
      status?: string;
      participantDids?: string[];
      revenueSplit?: Record<string, unknown> | null;
    },
  ): Promise<ProjectRow> {
    const now = this.clock.now();
    const updates: Record<string, unknown> = { updated_at: now, indexed_at: now };

    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) updates.description = data.description;
    if (data.status !== undefined) updates.status = data.status;
    if (data.participantDids !== undefined) updates.participant_dids = data.participantDids;
    if (data.revenueSplit !== undefined) {
      updates.revenue_split = data.revenueSplit ? JSON.stringify(data.revenueSplit) : null;
    }

    const [row] = await this.db
      .updateTable('collaborative_project')
      .set(updates)
      .where('id', '=', id)
      .where('host_cooperative_did', '=', hostCooperativeDid)
      .returningAll()
      .execute();

    if (!row) throw new NotFoundError('Collaborative project not found');
    return row;
  }

  async getProject(
    id: string,
  ): Promise<ProjectRow & { contributions: ContributionRow[] }> {
    const project = await this.db
      .selectFrom('collaborative_project')
      .where('id', '=', id)
      .selectAll()
      .executeTakeFirst();

    if (!project) throw new NotFoundError('Collaborative project not found');

    const contributions = await this.db
      .selectFrom('collaborative_contribution')
      .where('project_id', '=', id)
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();

    return { ...project, contributions };
  }

  async listProjects(
    cooperativeDid: string,
    params: PageParams,
    filters?: {
      status?: string;
    },
  ): Promise<Page<ProjectRow>> {
    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('collaborative_project')
      .where((eb) =>
        eb.or([
          eb('host_cooperative_did', '=', cooperativeDid),
          sql<boolean>`participant_dids @> ARRAY[${cooperativeDid}]::text[]`,
        ]),
      )
      .selectAll()
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1);

    if (filters?.status) {
      query = query.where('status', '=', filters.status);
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

  async recordContribution(
    projectId: string,
    data: {
      cooperativeDid: string;
      hoursContributed?: number;
      revenueEarned?: number;
      expenseIncurred?: number;
      periodStart: string;
      periodEnd: string;
    },
  ): Promise<ContributionRow> {
    // Verify the project exists
    const project = await this.db
      .selectFrom('collaborative_project')
      .where('id', '=', projectId)
      .select(['id'])
      .executeTakeFirst();

    if (!project) throw new NotFoundError('Collaborative project not found');

    const now = this.clock.now();

    // Upsert: check for existing contribution in same period
    const existing = await this.db
      .selectFrom('collaborative_contribution')
      .where('project_id', '=', projectId)
      .where('cooperative_did', '=', data.cooperativeDid)
      .where('period_start', '=', new Date(data.periodStart))
      .where('period_end', '=', new Date(data.periodEnd))
      .select(['id'])
      .executeTakeFirst();

    if (existing) {
      const updates: Record<string, unknown> = { indexed_at: now };
      if (data.hoursContributed !== undefined) updates.hours_contributed = data.hoursContributed;
      if (data.revenueEarned !== undefined) updates.revenue_earned = data.revenueEarned;
      if (data.expenseIncurred !== undefined) updates.expense_incurred = data.expenseIncurred;

      const [row] = await this.db
        .updateTable('collaborative_contribution')
        .set(updates)
        .where('id', '=', existing.id)
        .returningAll()
        .execute();

      return row!;
    }

    try {
      const [row] = await this.db
        .insertInto('collaborative_contribution')
        .values({
          project_id: projectId,
          cooperative_did: data.cooperativeDid,
          hours_contributed: data.hoursContributed ?? 0,
          revenue_earned: data.revenueEarned ?? 0,
          expense_incurred: data.expenseIncurred ?? 0,
          period_start: data.periodStart,
          period_end: data.periodEnd,
          created_at: now,
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
        throw new ConflictError('Contribution record already exists for this period');
      }
      throw err;
    }
  }

  async getContributions(
    projectId: string,
    params: PageParams,
  ): Promise<Page<ContributionRow>> {
    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('collaborative_contribution')
      .where('project_id', '=', projectId)
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
}
