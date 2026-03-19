import type { Kysely, Selectable } from 'kysely';
import type { Database, TaskTable, TaskLabelTable, TaskChecklistItemTable } from '@coopsource/db';
import { NotFoundError, ConflictError, ValidationError } from '@coopsource/common';
import type { DID } from '@coopsource/common';
import type { IClock } from '@coopsource/federation';
import type { IPdsService } from '@coopsource/federation';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

type TaskRow = Selectable<TaskTable>;
type LabelRow = Selectable<TaskLabelTable>;
type ChecklistRow = Selectable<TaskChecklistItemTable>;

const TASK_STATUS_TRANSITIONS: Record<string, string[]> = {
  backlog: ['todo', 'cancelled'],
  todo: ['in_progress', 'backlog', 'cancelled'],
  in_progress: ['in_review', 'todo', 'cancelled'],
  in_review: ['done', 'in_progress', 'cancelled'],
  done: ['backlog'],
  cancelled: ['backlog'],
};

export class TaskService {
  constructor(
    private db: Kysely<Database>,
    private pdsService: IPdsService,
    private clock: IClock,
  ) {}

  // ── Tasks ──────────────────────────────────────

  async createTask(
    cooperativeDid: string,
    createdBy: string,
    data: {
      title: string;
      description?: string | null;
      status?: string;
      priority?: string;
      projectId?: string | null;
      assigneeDids?: string[];
      dueDate?: string | null;
      labels?: string[];
      linkedProposalId?: string | null;
      checklist?: Array<{ title: string; sortOrder?: number }>;
    },
  ): Promise<TaskRow & { checklist_items: ChecklistRow[] }> {
    const now = this.clock.now();
    const status = data.status ?? 'backlog';
    const priority = data.priority ?? 'medium';

    // Best-effort PDS write
    let uri: string | null = null;
    let cid: string | null = null;
    try {
      const result = await this.pdsService.createRecord({
        did: cooperativeDid as DID,
        collection: 'network.coopsource.ops.task',
        record: {
          title: data.title,
          description: data.description ?? undefined,
          status,
          priority,
          assigneeDids: data.assigneeDids ?? [],
          dueDate: data.dueDate ?? undefined,
          labels: data.labels ?? [],
          linkedProposalId: data.linkedProposalId ?? undefined,
          createdBy,
          createdAt: now.toISOString(),
        },
      });
      uri = result.uri;
      cid = result.cid;
    } catch {
      // PDS write is best-effort in dev; task is still materialized in PostgreSQL
    }

    const [taskRow] = await this.db
      .insertInto('task')
      .values({
        cooperative_did: cooperativeDid,
        project_id: data.projectId ?? null,
        title: data.title,
        description: data.description ?? null,
        status,
        priority,
        assignee_dids: data.assigneeDids ?? [],
        due_date: data.dueDate ?? null,
        labels: data.labels ?? [],
        linked_proposal_id: data.linkedProposalId ?? null,
        uri,
        cid,
        created_by: createdBy,
        created_at: now,
        updated_at: now,
        indexed_at: now,
      })
      .returningAll()
      .execute();

    const task = taskRow!;

    // Create checklist items if provided
    const checklistItems: ChecklistRow[] = [];
    if (data.checklist && data.checklist.length > 0) {
      for (let idx = 0; idx < data.checklist.length; idx++) {
        const item = data.checklist[idx]!;
        const [row] = await this.db
          .insertInto('task_checklist_item')
          .values({
            task_id: task.id,
            title: item.title,
            completed: false,
            sort_order: item.sortOrder ?? idx,
            created_at: now,
          })
          .returningAll()
          .execute();
        checklistItems.push(row!);
      }
    }

    return { ...task, checklist_items: checklistItems };
  }

  async updateTask(
    id: string,
    cooperativeDid: string,
    data: {
      title?: string;
      description?: string | null;
      status?: string;
      priority?: string;
      projectId?: string | null;
      assigneeDids?: string[];
      dueDate?: string | null;
      labels?: string[];
      linkedProposalId?: string | null;
    },
  ): Promise<TaskRow> {
    // If status change requested, validate the transition
    if (data.status !== undefined) {
      const existing = await this.db
        .selectFrom('task')
        .where('id', '=', id)
        .where('cooperative_did', '=', cooperativeDid)
        .select(['status'])
        .executeTakeFirst();

      if (!existing) throw new NotFoundError('Task not found');

      const allowed = TASK_STATUS_TRANSITIONS[existing.status];
      if (!allowed || !allowed.includes(data.status)) {
        throw new ValidationError(
          `Cannot transition task from '${existing.status}' to '${data.status}'`,
        );
      }
    }

    const now = this.clock.now();
    const updates: Record<string, unknown> = { updated_at: now, indexed_at: now };

    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) updates.description = data.description;
    if (data.status !== undefined) updates.status = data.status;
    if (data.priority !== undefined) updates.priority = data.priority;
    if (data.projectId !== undefined) updates.project_id = data.projectId;
    if (data.assigneeDids !== undefined) updates.assignee_dids = data.assigneeDids;
    if (data.dueDate !== undefined) updates.due_date = data.dueDate;
    if (data.labels !== undefined) updates.labels = data.labels;
    if (data.linkedProposalId !== undefined) updates.linked_proposal_id = data.linkedProposalId;

    const [row] = await this.db
      .updateTable('task')
      .set(updates)
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .returningAll()
      .execute();

    if (!row) throw new NotFoundError('Task not found');
    return row;
  }

  async getTask(
    id: string,
    cooperativeDid: string,
  ): Promise<TaskRow & { checklist_items: ChecklistRow[] }> {
    const task = await this.db
      .selectFrom('task')
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .executeTakeFirst();

    if (!task) throw new NotFoundError('Task not found');

    const checklistItems = await this.db
      .selectFrom('task_checklist_item')
      .where('task_id', '=', id)
      .selectAll()
      .orderBy('sort_order', 'asc')
      .execute();

    return { ...task, checklist_items: checklistItems };
  }

  async listTasks(
    cooperativeDid: string,
    params: PageParams,
    filters?: {
      status?: string;
      priority?: string;
      projectId?: string;
      assigneeDid?: string;
    },
  ): Promise<Page<TaskRow>> {
    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('task')
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1);

    if (filters?.status) {
      query = query.where('status', '=', filters.status);
    }
    if (filters?.priority) {
      query = query.where('priority', '=', filters.priority);
    }
    if (filters?.projectId) {
      query = query.where('project_id', '=', filters.projectId);
    }
    if (filters?.assigneeDid) {
      query = query.where('assignee_dids', '@>', [filters.assigneeDid]);
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

  async deleteTask(id: string, cooperativeDid: string): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      // Delete checklist items first
      await trx
        .deleteFrom('task_checklist_item')
        .where('task_id', '=', id)
        .execute();

      // Then delete the task
      const result = await trx
        .deleteFrom('task')
        .where('id', '=', id)
        .where('cooperative_did', '=', cooperativeDid)
        .executeTakeFirst();

      if (result.numDeletedRows === 0n) {
        throw new NotFoundError('Task not found');
      }
    });
  }

  // ── Labels ─────────────────────────────────────

  async createLabel(
    cooperativeDid: string,
    data: { name: string; color: string },
  ): Promise<LabelRow> {
    const now = this.clock.now();

    try {
      const [row] = await this.db
        .insertInto('task_label')
        .values({
          cooperative_did: cooperativeDid,
          name: data.name,
          color: data.color,
          created_at: now,
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
        throw new ConflictError('A label with this name already exists for the cooperative');
      }
      throw err;
    }
  }

  async listLabels(cooperativeDid: string): Promise<LabelRow[]> {
    return await this.db
      .selectFrom('task_label')
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .orderBy('created_at', 'asc')
      .execute();
  }

  async deleteLabel(id: string, cooperativeDid: string): Promise<void> {
    const result = await this.db
      .deleteFrom('task_label')
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .executeTakeFirst();

    if (result.numDeletedRows === 0n) {
      throw new NotFoundError('Task label not found');
    }
  }

  // ── Checklist Items ────────────────────────────

  async addChecklistItem(
    taskId: string,
    cooperativeDid: string,
    data: { title: string; sortOrder?: number },
  ): Promise<ChecklistRow> {
    // Verify the task belongs to this cooperative
    const task = await this.db
      .selectFrom('task')
      .where('id', '=', taskId)
      .where('cooperative_did', '=', cooperativeDid)
      .select(['id'])
      .executeTakeFirst();

    if (!task) throw new NotFoundError('Task not found');

    const now = this.clock.now();

    // If no sort_order given, append at the end
    let sortOrder = data.sortOrder;
    if (sortOrder === undefined) {
      const last = await this.db
        .selectFrom('task_checklist_item')
        .where('task_id', '=', taskId)
        .select((eb) => eb.fn.max('sort_order').as('max_order'))
        .executeTakeFirst();
      sortOrder = (last?.max_order ?? -1) + 1;
    }

    const [row] = await this.db
      .insertInto('task_checklist_item')
      .values({
        task_id: taskId,
        title: data.title,
        completed: false,
        sort_order: sortOrder,
        created_at: now,
      })
      .returningAll()
      .execute();

    return row!;
  }

  async updateChecklistItem(
    id: string,
    cooperativeDid: string,
    data: {
      title?: string;
      completed?: boolean;
      sortOrder?: number;
    },
  ): Promise<ChecklistRow> {
    // Verify ownership: look up item, then verify its task belongs to this cooperative
    const item = await this.db
      .selectFrom('task_checklist_item')
      .where('id', '=', id)
      .select(['id', 'task_id'])
      .executeTakeFirst();
    if (!item) throw new NotFoundError('Checklist item not found');

    const task = await this.db
      .selectFrom('task')
      .where('id', '=', item.task_id)
      .where('cooperative_did', '=', cooperativeDid)
      .select(['id'])
      .executeTakeFirst();
    if (!task) throw new NotFoundError('Checklist item not found');

    const updates: Record<string, unknown> = {};

    if (data.title !== undefined) updates.title = data.title;
    if (data.completed !== undefined) updates.completed = data.completed;
    if (data.sortOrder !== undefined) updates.sort_order = data.sortOrder;

    const [row] = await this.db
      .updateTable('task_checklist_item')
      .set(updates)
      .where('id', '=', id)
      .returningAll()
      .execute();

    if (!row) throw new NotFoundError('Checklist item not found');
    return row;
  }

  async deleteChecklistItem(id: string, cooperativeDid: string): Promise<void> {
    // Verify ownership: look up item, then verify its task belongs to this cooperative
    const item = await this.db
      .selectFrom('task_checklist_item')
      .where('id', '=', id)
      .select(['id', 'task_id'])
      .executeTakeFirst();
    if (!item) throw new NotFoundError('Checklist item not found');

    const task = await this.db
      .selectFrom('task')
      .where('id', '=', item.task_id)
      .where('cooperative_did', '=', cooperativeDid)
      .select(['id'])
      .executeTakeFirst();
    if (!task) throw new NotFoundError('Checklist item not found');

    await this.db.deleteFrom('task_checklist_item').where('id', '=', id).execute();
  }

  // ── Queries ────────────────────────────────────

  async getTasksByAssignee(
    cooperativeDid: string,
    assigneeDid: string,
    params: PageParams,
  ): Promise<Page<TaskRow>> {
    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('task')
      .where('cooperative_did', '=', cooperativeDid)
      .where('assignee_dids', '@>', [assigneeDid])
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
