import type { Kysely, Selectable } from 'kysely';
import type {
  Database,
  ProcurementGroupTable,
  ProcurementDemandTable,
} from '@coopsource/db';
import { NotFoundError } from '@coopsource/common';
import type { IClock } from '@coopsource/federation';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

type GroupRow = Selectable<ProcurementGroupTable>;
type DemandRow = Selectable<ProcurementDemandTable>;

interface GroupWithDemand extends GroupRow {
  totalQuantity: number;
  demandCount: number;
}

export class ProcurementService {
  constructor(
    private db: Kysely<Database>,
    private clock: IClock,
  ) {}

  // ─── Group CRUD ─────────────────────────────────────────────────────

  async createGroup(
    networkDid: string,
    createdBy: string,
    data: {
      title: string;
      description?: string;
      category?: string;
      targetQuantity?: number;
      deadline?: Date | string;
    },
  ): Promise<GroupRow> {
    const now = this.clock.now();

    const [row] = await this.db
      .insertInto('procurement_group')
      .values({
        network_did: networkDid,
        created_by: createdBy,
        title: data.title,
        description: data.description ?? null,
        category: data.category ?? null,
        target_quantity: data.targetQuantity ?? null,
        deadline: data.deadline ?? null,
        status: 'open',
        created_at: now,
        updated_at: now,
      })
      .returningAll()
      .execute();

    return row!;
  }

  async updateGroup(
    id: string,
    networkDid: string,
    data: {
      title?: string;
      description?: string;
      category?: string;
      targetQuantity?: number;
      deadline?: Date | string;
      status?: string;
    },
  ): Promise<GroupRow> {
    const now = this.clock.now();
    const updates: Record<string, unknown> = { updated_at: now };

    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) updates.description = data.description;
    if (data.category !== undefined) updates.category = data.category;
    if (data.targetQuantity !== undefined) updates.target_quantity = data.targetQuantity;
    if (data.deadline !== undefined) updates.deadline = data.deadline;
    if (data.status !== undefined) updates.status = data.status;

    const [row] = await this.db
      .updateTable('procurement_group')
      .set(updates)
      .where('id', '=', id)
      .where('network_did', '=', networkDid)
      .returningAll()
      .execute();

    if (!row) throw new NotFoundError('Procurement group not found');
    return row;
  }

  async getGroup(id: string): Promise<GroupWithDemand> {
    const group = await this.db
      .selectFrom('procurement_group')
      .where('id', '=', id)
      .selectAll()
      .executeTakeFirst();

    if (!group) throw new NotFoundError('Procurement group not found');

    // Aggregate demand
    const agg = await this.db
      .selectFrom('procurement_demand')
      .where('group_id', '=', id)
      .select((eb) => [
        eb.fn.coalesce(eb.fn.sum('quantity'), eb.lit(0)).as('total_quantity'),
        eb.fn.countAll().as('demand_count'),
      ])
      .executeTakeFirst();

    return {
      ...group,
      totalQuantity: Number(agg?.total_quantity ?? 0),
      demandCount: Number(agg?.demand_count ?? 0),
    };
  }

  async listGroups(
    networkDid: string,
    params: PageParams,
    filters?: {
      status?: string;
      category?: string;
    },
  ): Promise<Page<GroupRow>> {
    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('procurement_group')
      .where('network_did', '=', networkDid)
      .selectAll()
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1);

    if (filters?.status) {
      query = query.where('status', '=', filters.status);
    }

    if (filters?.category) {
      query = query.where('category', '=', filters.category);
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

  // ─── Demand management ──────────────────────────────────────────────

  async addDemand(
    groupId: string,
    cooperativeDid: string,
    data: {
      quantity: number;
      notes?: string;
    },
  ): Promise<DemandRow> {
    const now = this.clock.now();

    const [row] = await this.db
      .insertInto('procurement_demand')
      .values({
        group_id: groupId,
        cooperative_did: cooperativeDid,
        quantity: data.quantity,
        notes: data.notes ?? null,
        created_at: now,
      })
      .returningAll()
      .execute();

    return row!;
  }

  async removeDemand(
    groupId: string,
    cooperativeDid: string,
  ): Promise<void> {
    const result = await this.db
      .deleteFrom('procurement_demand')
      .where('group_id', '=', groupId)
      .where('cooperative_did', '=', cooperativeDid)
      .executeTakeFirst();

    if (result.numDeletedRows === 0n) {
      throw new NotFoundError('Demand not found');
    }
  }

  async getDemands(groupId: string): Promise<DemandRow[]> {
    return await this.db
      .selectFrom('procurement_demand')
      .where('group_id', '=', groupId)
      .selectAll()
      .orderBy('created_at', 'asc')
      .execute();
  }
}
