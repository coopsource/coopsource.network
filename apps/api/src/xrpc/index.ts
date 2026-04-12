import type { XrpcQueryHandler } from './dispatcher.js';
import type { Container } from '../container.js';
import { handleGetCooperative } from './handlers/get-cooperative.js';
import { handleListProposals } from './handlers/list-proposals.js';
import { handleGetProposal } from './handlers/get-proposal.js';
import { handleGetMembership } from './handlers/get-membership.js';
import { handleGetOfficers } from './handlers/get-officers.js';
import { handleQueryLabels } from './handlers/query-labels.js';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

/**
 * Build the XRPC handler map with all registered methods.
 * Includes governance AppView queries (V9.2) and the migrated label query.
 */
export function buildXrpcHandlers(
  container: Container,
): Map<string, XrpcQueryHandler> {
  const handlers = new Map<string, XrpcQueryHandler>();

  // --- Governance AppView queries (V9.2) ---

  handlers.set('network.coopsource.org.getCooperative', {
    auth: 'none',
    rateLimit: { windowMs: FIFTEEN_MINUTES, limit: 60 },
    handler: handleGetCooperative,
  });

  handlers.set('network.coopsource.governance.listProposals', {
    auth: 'none',
    rateLimit: { windowMs: FIFTEEN_MINUTES, limit: 60 },
    handler: handleListProposals,
  });

  handlers.set('network.coopsource.governance.getProposal', {
    auth: 'none',
    rateLimit: { windowMs: FIFTEEN_MINUTES, limit: 60 },
    handler: handleGetProposal,
  });

  handlers.set('network.coopsource.org.getMembership', {
    auth: 'viewer',
    rateLimit: { windowMs: FIFTEEN_MINUTES, limit: 200 },
    handler: handleGetMembership,
  });

  handlers.set('network.coopsource.admin.getOfficers', {
    auth: 'none',
    rateLimit: { windowMs: FIFTEEN_MINUTES, limit: 60 },
    handler: handleGetOfficers,
  });

  // --- Migrated from xrpc-labels.ts (review finding C1) ---

  handlers.set('com.atproto.label.queryLabels', {
    auth: 'none',
    rateLimit: { windowMs: FIFTEEN_MINUTES, limit: 60 },
    handler: handleQueryLabels(container.db),
  });

  return handlers;
}
