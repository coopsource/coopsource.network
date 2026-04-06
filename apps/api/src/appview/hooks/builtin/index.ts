import type { HookRegistration } from '../types.js';
import type { HookRegistry } from '../registry.js';

// ─── Existing indexer imports ────────────────────────────────────────────

import {
  indexMembership,
  indexMemberApproval,
} from '../../indexers/membership-indexer.js';
import { indexProposal, indexVote } from '../../indexers/proposal-indexer.js';
import {
  indexAgreement,
  indexSignature,
} from '../../indexers/agreement-indexer.js';
import {
  indexInterest,
  indexOutcome,
  indexInterestMap,
} from '../../indexers/alignment-indexer.js';
import { indexCalendarEvent, indexCalendarRsvp } from '../../indexers/calendar-indexer.js';
import { indexFrontpagePost } from '../../indexers/frontpage-indexer.js';
import { indexLegalDocument, indexMeetingRecord } from '../../indexers/legal-indexer.js';
import { indexOfficer, indexComplianceItem, indexMemberNotice, indexFiscalPeriod } from '../../indexers/admin-indexer.js';

// ─── Hook definitions ────────────────────────────────────────────────────

const builtinHooks: HookRegistration[] = [
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

  // ── Alignment ────────────────────────────────────────────────────────
  {
    id: 'builtin:alignment.interest',
    name: 'Interest indexer',
    phase: 'post-storage',
    source: 'builtin',
    collections: ['network.coopsource.alignment.interest'],
    priority: 10,
    postHandler: async (ctx) => { await indexInterest(ctx.db, ctx.event); },
  },
  {
    id: 'builtin:alignment.outcome',
    name: 'Outcome indexer',
    phase: 'post-storage',
    source: 'builtin',
    collections: ['network.coopsource.alignment.outcome'],
    priority: 10,
    postHandler: async (ctx) => { await indexOutcome(ctx.db, ctx.event); },
  },
  {
    id: 'builtin:alignment.interestMap',
    name: 'Interest map indexer',
    phase: 'post-storage',
    source: 'builtin',
    collections: ['network.coopsource.alignment.interestMap'],
    priority: 10,
    postHandler: async (ctx) => { await indexInterestMap(ctx.db, ctx.event); },
  },

  // ── Calendar (external) ──────────────────────────────────────────────
  {
    id: 'builtin:calendar.event',
    name: 'Calendar event indexer',
    phase: 'post-storage',
    source: 'builtin',
    collections: ['community.lexicon.calendar.event'],
    priority: 10,
    postHandler: async (ctx) => { await indexCalendarEvent(ctx.db, ctx.event); },
  },
  {
    id: 'builtin:calendar.rsvp',
    name: 'Calendar RSVP indexer',
    phase: 'post-storage',
    source: 'builtin',
    collections: ['community.lexicon.calendar.rsvp'],
    priority: 10,
    postHandler: async (ctx) => { await indexCalendarRsvp(ctx.db, ctx.event); },
  },

  // ── Frontpage (external) ─────────────────────────────────────────────
  {
    id: 'builtin:frontpage.post',
    name: 'Frontpage post indexer',
    phase: 'post-storage',
    source: 'builtin',
    collections: ['fyi.unravel.frontpage.post'],
    priority: 10,
    postHandler: async (ctx) => { await indexFrontpagePost(ctx.db, ctx.event); },
  },

  // ── Legal ────────────────────────────────────────────────────────────
  {
    id: 'builtin:legal.document',
    name: 'Legal document indexer',
    phase: 'post-storage',
    source: 'builtin',
    collections: ['network.coopsource.legal.document'],
    priority: 10,
    postHandler: async (ctx) => { await indexLegalDocument(ctx.db, ctx.event); },
  },
  {
    id: 'builtin:legal.meetingRecord',
    name: 'Meeting record indexer',
    phase: 'post-storage',
    source: 'builtin',
    collections: ['network.coopsource.legal.meetingRecord'],
    priority: 10,
    postHandler: async (ctx) => { await indexMeetingRecord(ctx.db, ctx.event); },
  },

  // ── Admin ────────────────────────────────────────────────────────────
  {
    id: 'builtin:admin.officer',
    name: 'Officer indexer',
    phase: 'post-storage',
    source: 'builtin',
    collections: ['network.coopsource.admin.officer'],
    priority: 10,
    postHandler: async (ctx) => { await indexOfficer(ctx.db, ctx.event); },
  },
  {
    id: 'builtin:admin.complianceItem',
    name: 'Compliance item indexer',
    phase: 'post-storage',
    source: 'builtin',
    collections: ['network.coopsource.admin.complianceItem'],
    priority: 10,
    postHandler: async (ctx) => { await indexComplianceItem(ctx.db, ctx.event); },
  },
  {
    id: 'builtin:admin.memberNotice',
    name: 'Member notice indexer',
    phase: 'post-storage',
    source: 'builtin',
    collections: ['network.coopsource.admin.memberNotice'],
    priority: 10,
    postHandler: async (ctx) => { await indexMemberNotice(ctx.db, ctx.event); },
  },
  {
    id: 'builtin:admin.fiscalPeriod',
    name: 'Fiscal period indexer',
    phase: 'post-storage',
    source: 'builtin',
    collections: ['network.coopsource.admin.fiscalPeriod'],
    priority: 10,
    postHandler: async (ctx) => { await indexFiscalPeriod(ctx.db, ctx.event); },
  },
];

// ─── Registration ────────────────────────────────────────────────────────

/**
 * Register all built-in indexers as post-storage hooks.
 * Called once at startup from container setup.
 */
export function registerBuiltinHooks(registry: HookRegistry): void {
  for (const hook of builtinHooks) {
    registry.register(hook);
  }
}
