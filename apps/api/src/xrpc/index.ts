import type { XrpcQueryHandler } from './dispatcher.js';
import type { Container } from '../container.js';
import { handleGetCooperative } from './handlers/get-cooperative.js';
import { handleListProposals } from './handlers/list-proposals.js';
import { handleGetProposal } from './handlers/get-proposal.js';
import { handleGetMembership } from './handlers/get-membership.js';
import { handleGetVoteEligibility } from './handlers/get-vote-eligibility.js';
import { handleListMembers } from './handlers/list-members.js';
import { handleGetOfficers } from './handlers/get-officers.js';
import { handleQueryLabels } from './handlers/query-labels.js';
import { handleInlayMembershipStatus } from './handlers/inlay-membership-status.js';
import { handleInlayOfficerList } from './handlers/inlay-officer-list.js';
import { handleInlayGovernanceFeed } from './handlers/inlay-governance-feed.js';
import { handleInlayVoteWidget } from './handlers/inlay-vote-widget.js';

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
    auth: 'optional',
    rateLimit: { windowMs: FIFTEEN_MINUTES, limit: 60 },
    handler: handleGetCooperative,
  });

  handlers.set('network.coopsource.governance.listProposals', {
    auth: 'optional',
    rateLimit: { windowMs: FIFTEEN_MINUTES, limit: 60 },
    handler: handleListProposals,
  });

  handlers.set('network.coopsource.governance.getProposal', {
    auth: 'optional',
    rateLimit: { windowMs: FIFTEEN_MINUTES, limit: 60 },
    handler: handleGetProposal,
  });

  handlers.set('network.coopsource.governance.getVoteEligibility', {
    auth: 'viewer',
    rateLimit: { windowMs: FIFTEEN_MINUTES, limit: 200 },
    handler: handleGetVoteEligibility,
  });

  handlers.set('network.coopsource.org.getMembership', {
    auth: 'viewer',
    rateLimit: { windowMs: FIFTEEN_MINUTES, limit: 200 },
    handler: handleGetMembership,
  });

  handlers.set('network.coopsource.org.listMembers', {
    auth: 'optional',
    rateLimit: { windowMs: FIFTEEN_MINUTES, limit: 60 },
    handler: handleListMembers,
  });

  handlers.set('network.coopsource.admin.getOfficers', {
    auth: 'optional',
    rateLimit: { windowMs: FIFTEEN_MINUTES, limit: 60 },
    handler: handleGetOfficers,
  });

  // --- Inlay external components (V9.3) ---

  handlers.set('network.coopsource.inlay.MembershipStatus', {
    method: 'procedure',
    auth: 'inlay-viewer',
    rateLimit: { windowMs: FIFTEEN_MINUTES, limit: 200 },
    handler: handleInlayMembershipStatus,
  });

  handlers.set('network.coopsource.inlay.OfficerList', {
    method: 'procedure',
    auth: 'none',
    rateLimit: { windowMs: FIFTEEN_MINUTES, limit: 60 },
    handler: handleInlayOfficerList,
  });

  handlers.set('network.coopsource.inlay.GovernanceFeed', {
    method: 'procedure',
    auth: 'none',
    rateLimit: { windowMs: FIFTEEN_MINUTES, limit: 60 },
    handler: handleInlayGovernanceFeed,
  });

  handlers.set('network.coopsource.inlay.VoteWidget', {
    method: 'procedure',
    auth: 'inlay-viewer',
    rateLimit: { windowMs: FIFTEEN_MINUTES, limit: 200 },
    handler: handleInlayVoteWidget,
  });

  // --- Migrated from xrpc-labels.ts (review finding C1) ---

  handlers.set('com.atproto.label.queryLabels', {
    auth: 'none',
    rateLimit: { windowMs: FIFTEEN_MINUTES, limit: 60 },
    handler: handleQueryLabels(container.db),
  });

  return handlers;
}
