import type { Database } from '@coopsource/db';

/**
 * FederationDatabase — the complete DB type used by LocalPdsService.
 *
 * The main Database now includes all PDS, entity_key, and plc_operation
 * tables from migrations 001–009. This is just a re-export for clarity.
 */
export type FederationDatabase = Database;
