import type { HookRegistration } from '../types.js';
import type { HookRegistry } from '../registry.js';
import { declarativeConfigs, createDeclarativeHandler } from '../declarative/index.js';

// ─── Complex indexer imports (kept as hand-written TypeScript) ──────────

import {
  indexMembership,
  indexMemberApproval,
} from '../../indexers/membership-indexer.js';
import { indexProposal, indexVote } from '../../indexers/proposal-indexer.js';
import {
  indexAgreement,
  indexSignature,
} from '../../indexers/agreement-indexer.js';

// ─── Complex builtin hooks (bilateral state machines, counters) ────────

const complexHooks: HookRegistration[] = [
  // ── Membership (bilateral state machine) ─────────────────────────────
  {
    id: 'builtin:org.membership',
    name: 'Membership indexer',
    phase: 'post-storage',
    source: 'builtin',
    collections: ['network.coopsource.org.membership'],
    priority: 10,
    postHandler: async (ctx) => { await indexMembership(ctx.db, ctx.event); },
  },
  {
    id: 'builtin:org.memberApproval',
    name: 'Member approval indexer',
    phase: 'post-storage',
    source: 'builtin',
    collections: ['network.coopsource.org.memberApproval'],
    priority: 10,
    postHandler: async (ctx) => { await indexMemberApproval(ctx.db, ctx.event); },
  },

  // ── Governance (proposals + votes) ───────────────────────────────────
  {
    id: 'builtin:governance.proposal',
    name: 'Proposal indexer',
    phase: 'post-storage',
    source: 'builtin',
    collections: ['network.coopsource.governance.proposal'],
    priority: 10,
    postHandler: async (ctx) => { await indexProposal(ctx.db, ctx.event); },
  },
  {
    id: 'builtin:governance.vote',
    name: 'Vote indexer',
    phase: 'post-storage',
    source: 'builtin',
    collections: ['network.coopsource.governance.vote'],
    priority: 10,
    postHandler: async (ctx) => { await indexVote(ctx.db, ctx.event); },
  },

  // ── Agreements (signatures) ──────────────────────────────────────────
  {
    id: 'builtin:agreement.master',
    name: 'Agreement indexer',
    phase: 'post-storage',
    source: 'builtin',
    collections: ['network.coopsource.agreement.master'],
    priority: 10,
    postHandler: async (ctx) => { await indexAgreement(ctx.db, ctx.event); },
  },
  {
    id: 'builtin:agreement.signature',
    name: 'Signature indexer',
    phase: 'post-storage',
    source: 'builtin',
    collections: ['network.coopsource.agreement.signature'],
    priority: 10,
    postHandler: async (ctx) => { await indexSignature(ctx.db, ctx.event); },
  },
];

// ─── Declarative hooks (generated from configs) ────────────────────────

function buildDeclarativeHooks(): HookRegistration[] {
  return declarativeConfigs.map((config) => ({
    id: `declarative:${config.collection}`,
    name: `Declarative indexer for ${config.collection}`,
    phase: 'post-storage' as const,
    source: 'declarative' as const,
    collections: [config.collection],
    priority: 100,
    postHandler: createDeclarativeHandler(config),
  }));
}

// ─── Registration ────────────────────────────────────────────────────────

/**
 * Register all built-in hooks:
 * - 6 complex hand-written indexers (membership, proposal, agreement)
 * - 12 declarative indexers (admin, legal, alignment, external)
 *
 * Called once at startup from container setup.
 */
export function registerBuiltinHooks(registry: HookRegistry): void {
  for (const hook of complexHooks) {
    registry.register(hook);
  }
  for (const hook of buildDeclarativeHooks()) {
    registry.register(hook);
  }
}
