import type { Kysely, Selectable } from 'kysely';
import type {
  Database,
  ConnectorConfigTable,
  ConnectorFieldMappingTable,
  ConnectorSyncLogTable,
} from '@coopsource/db';
import { NotFoundError, ConflictError } from '@coopsource/common';
import type { IClock } from '@coopsource/federation';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

type ConfigRow = Selectable<ConnectorConfigTable>;
type FieldMappingRow = Selectable<ConnectorFieldMappingTable>;
type SyncLogRow = Selectable<ConnectorSyncLogTable>;

export class ConnectorRegistryService {
  constructor(
    private db: Kysely<Database>,
    private clock: IClock,
  ) {}

  // ─── Connector config CRUD ──────────────────────────────────────────

  async createConfig(
    cooperativeDid: string,
    data: {
      connectorType: string;
      displayName: string;
      config?: Record<string, unknown>;
      enabled?: boolean;
    },
  ): Promise<ConfigRow> {
    const now = this.clock.now();

    try {
      const [row] = await this.db
        .insertInto('connector_config')
        .values({
          cooperative_did: cooperativeDid,
          connector_type: data.connectorType,
          display_name: data.displayName,
          config: data.config ? JSON.stringify(data.config) : '{}',
          enabled: data.enabled ?? true,
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
        throw new ConflictError('Connector config already exists for this type');
      }
      throw err;
    }
  }

  async updateConfig(
    id: string,
    cooperativeDid: string,
    data: {
      displayName?: string;
      config?: Record<string, unknown>;
      enabled?: boolean;
    },
  ): Promise<ConfigRow> {
    const now = this.clock.now();
    const updates: Record<string, unknown> = { updated_at: now };

    if (data.displayName !== undefined) updates.display_name = data.displayName;
    if (data.config !== undefined) updates.config = JSON.stringify(data.config);
    if (data.enabled !== undefined) updates.enabled = data.enabled;

    const [row] = await this.db
      .updateTable('connector_config')
      .set(updates)
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .returningAll()
      .execute();

    if (!row) throw new NotFoundError('Connector config not found');
    return row;
  }

  async getConfig(id: string, cooperativeDid: string): Promise<ConfigRow> {
    const row = await this.db
      .selectFrom('connector_config')
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .executeTakeFirst();

    if (!row) throw new NotFoundError('Connector config not found');
    return row;
  }

  async listConfigs(cooperativeDid: string): Promise<ConfigRow[]> {
    return await this.db
      .selectFrom('connector_config')
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .orderBy('created_at', 'asc')
      .execute();
  }

  async deleteConfig(id: string, cooperativeDid: string): Promise<void> {
    // Delete associated field mappings first
    await this.db
      .deleteFrom('connector_field_mapping')
      .where('connector_config_id', '=', id)
      .execute();

    const result = await this.db
      .deleteFrom('connector_config')
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .executeTakeFirst();

    if (result.numDeletedRows === 0n) {
      throw new NotFoundError('Connector config not found');
    }
  }

  // ─── Field mappings ─────────────────────────────────────────────────

  async addFieldMapping(
    connectorConfigId: string,
    data: {
      localField: string;
      remoteField: string;
      transform?: string;
    },
  ): Promise<FieldMappingRow> {
    const now = this.clock.now();

    try {
      const [row] = await this.db
        .insertInto('connector_field_mapping')
        .values({
          connector_config_id: connectorConfigId,
          local_field: data.localField,
          remote_field: data.remoteField,
          transform: data.transform ?? null,
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
        throw new ConflictError('Field mapping already exists for this local field');
      }
      throw err;
    }
  }

  async listFieldMappings(connectorConfigId: string): Promise<FieldMappingRow[]> {
    return await this.db
      .selectFrom('connector_field_mapping')
      .where('connector_config_id', '=', connectorConfigId)
      .selectAll()
      .orderBy('created_at', 'asc')
      .execute();
  }

  async deleteFieldMapping(id: string): Promise<void> {
    const result = await this.db
      .deleteFrom('connector_field_mapping')
      .where('id', '=', id)
      .executeTakeFirst();

    if (result.numDeletedRows === 0n) {
      throw new NotFoundError('Field mapping not found');
    }
  }

  // ─── Sync logs ──────────────────────────────────────────────────────

  async recordSyncStart(
    connectorConfigId: string,
    direction: string,
  ): Promise<SyncLogRow> {
    const now = this.clock.now();

    const [row] = await this.db
      .insertInto('connector_sync_log')
      .values({
        connector_config_id: connectorConfigId,
        direction,
        status: 'running',
        started_at: now,
      })
      .returningAll()
      .execute();

    return row!;
  }

  async recordSyncComplete(
    syncLogId: string,
    data: {
      recordsSynced: number;
      recordsFailed: number;
      errorDetails?: string;
    },
  ): Promise<SyncLogRow> {
    const now = this.clock.now();
    const status = data.recordsFailed > 0 && data.recordsSynced === 0
      ? 'failed'
      : 'completed';

    const [row] = await this.db
      .updateTable('connector_sync_log')
      .set({
        records_synced: data.recordsSynced,
        records_failed: data.recordsFailed,
        error_details: data.errorDetails ?? null,
        completed_at: now,
        status,
      })
      .where('id', '=', syncLogId)
      .returningAll()
      .execute();

    if (!row) throw new NotFoundError('Sync log entry not found');
    return row;
  }

  async getSyncLogs(
    connectorConfigId: string,
    params: PageParams,
  ): Promise<Page<SyncLogRow>> {
    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('connector_sync_log')
      .where('connector_config_id', '=', connectorConfigId)
      .selectAll()
      .orderBy('started_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1);

    if (params.cursor) {
      const { t, i } = decodeCursor(params.cursor);
      query = query.where((eb) =>
        eb.or([
          eb('started_at', '<', new Date(t)),
          eb.and([
            eb('started_at', '=', new Date(t)),
            eb('id', '<', i),
          ]),
        ]),
      );
    }

    const rows = await query.execute();
    const slice = rows.slice(0, limit);
    const cursor =
      rows.length > limit
        ? encodeCursor(slice[slice.length - 1]!.started_at, slice[slice.length - 1]!.id)
        : undefined;

    return { items: slice, cursor };
  }
}
