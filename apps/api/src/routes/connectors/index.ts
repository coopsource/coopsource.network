import { Router } from 'express';
import type { Selectable } from 'kysely';
import type {
  ConnectorConfigTable,
  ConnectorFieldMappingTable,
  ConnectorSyncLogTable,
} from '@coopsource/db';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';
import { parsePagination } from '../../lib/pagination.js';
import {
  CreateConnectorConfigSchema,
  UpdateConnectorConfigSchema,
  CreateFieldMappingSchema,
} from '@coopsource/common';

function formatConfig(row: Selectable<ConnectorConfigTable>) {
  return {
    id: row.id,
    cooperativeDid: row.cooperative_did,
    connectorType: row.connector_type,
    displayName: row.display_name,
    config: row.config,
    enabled: row.enabled,
    lastSyncAt: row.last_sync_at instanceof Date ? row.last_sync_at.toISOString() : row.last_sync_at,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

function formatFieldMapping(row: Selectable<ConnectorFieldMappingTable>) {
  return {
    id: row.id,
    connectorConfigId: row.connector_config_id,
    localField: row.local_field,
    remoteField: row.remote_field,
    transform: row.transform,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

function formatSyncLog(row: Selectable<ConnectorSyncLogTable>) {
  return {
    id: row.id,
    connectorConfigId: row.connector_config_id,
    direction: row.direction,
    recordsSynced: Number(row.records_synced),
    recordsFailed: Number(row.records_failed),
    errorDetails: row.error_details,
    startedAt: row.started_at instanceof Date ? row.started_at.toISOString() : row.started_at,
    completedAt: row.completed_at instanceof Date ? row.completed_at.toISOString() : row.completed_at,
    status: row.status,
  };
}

export function createConnectorRoutes(container: Container): Router {
  const router = Router();

  // Create connector config
  router.post(
    '/api/v1/connectors/configs',
    requireAuth,
    requirePermission('connector.manage'),
    asyncHandler(async (req, res) => {
      const data = CreateConnectorConfigSchema.parse(req.body);
      const config = await container.connectorRegistryService.createConfig(
        req.actor!.cooperativeDid,
        data,
      );
      res.status(201).json(formatConfig(config));
    }),
  );

  // List connector configs
  router.get(
    '/api/v1/connectors/configs',
    requireAuth,
    asyncHandler(async (req, res) => {
      const configs = await container.connectorRegistryService.listConfigs(
        req.actor!.cooperativeDid,
      );
      res.json({ configs: configs.map(formatConfig) });
    }),
  );

  // Get connector config
  router.get(
    '/api/v1/connectors/configs/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const config = await container.connectorRegistryService.getConfig(
        String(req.params.id),
        req.actor!.cooperativeDid,
      );
      res.json(formatConfig(config));
    }),
  );

  // Update connector config
  router.put(
    '/api/v1/connectors/configs/:id',
    requireAuth,
    requirePermission('connector.manage'),
    asyncHandler(async (req, res) => {
      const data = UpdateConnectorConfigSchema.parse(req.body);
      const config = await container.connectorRegistryService.updateConfig(
        String(req.params.id),
        req.actor!.cooperativeDid,
        data,
      );
      res.json(formatConfig(config));
    }),
  );

  // Delete connector config
  router.delete(
    '/api/v1/connectors/configs/:id',
    requireAuth,
    requirePermission('connector.manage'),
    asyncHandler(async (req, res) => {
      await container.connectorRegistryService.deleteConfig(
        String(req.params.id),
        req.actor!.cooperativeDid,
      );
      res.status(204).end();
    }),
  );

  // Add field mapping
  router.post(
    '/api/v1/connectors/configs/:id/mappings',
    requireAuth,
    requirePermission('connector.manage'),
    asyncHandler(async (req, res) => {
      const data = CreateFieldMappingSchema.parse(req.body);
      const mapping = await container.connectorRegistryService.addFieldMapping(
        String(req.params.id),
        data,
      );
      res.status(201).json(formatFieldMapping(mapping));
    }),
  );

  // List field mappings
  router.get(
    '/api/v1/connectors/configs/:id/mappings',
    requireAuth,
    asyncHandler(async (req, res) => {
      const mappings = await container.connectorRegistryService.listFieldMappings(
        String(req.params.id),
      );
      res.json({ mappings: mappings.map(formatFieldMapping) });
    }),
  );

  // Delete field mapping
  router.delete(
    '/api/v1/connectors/mappings/:id',
    requireAuth,
    requirePermission('connector.manage'),
    asyncHandler(async (req, res) => {
      await container.connectorRegistryService.deleteFieldMapping(
        String(req.params.id),
      );
      res.status(204).end();
    }),
  );

  // List sync logs
  router.get(
    '/api/v1/connectors/configs/:id/sync-logs',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const page = await container.connectorRegistryService.getSyncLogs(
        String(req.params.id),
        params,
      );
      res.json({ syncLogs: page.items.map(formatSyncLog), cursor: page.cursor ?? null });
    }),
  );

  // Trigger sync (start sync log)
  router.post(
    '/api/v1/connectors/configs/:id/sync',
    requireAuth,
    requirePermission('connector.manage'),
    asyncHandler(async (req, res) => {
      const direction = String(req.body?.direction ?? 'outbound');
      const syncLog = await container.connectorRegistryService.recordSyncStart(
        String(req.params.id),
        direction,
      );
      res.status(201).json(formatSyncLog(syncLog));
    }),
  );

  return router;
}
