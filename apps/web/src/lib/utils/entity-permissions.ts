import type { Proposal, Agreement, Campaign, Task, Expense, Officer, ComplianceItem, FiscalPeriod, CommerceListing, CommerceNeed, Post } from '$lib/api/types.js';

/** Proposal: editable only in draft by the author */
export function canEditProposal(p: Proposal, userDid?: string): boolean {
  return p.status === 'draft' && !!userDid && p.authorDid === userDid;
}

/** Agreement: editable only in draft by the author */
export function canEditAgreement(a: Agreement, userDid?: string): boolean {
  return a.status === 'draft' && !!userDid && a.authorDid === userDid;
}

/** Campaign: editable in draft or active (cooperative-scoped, no author check) */
export function canEditCampaign(c: Campaign): boolean {
  return c.status === 'draft' || c.status === 'active';
}

/** Task: editable unless done or cancelled (cooperative-scoped) */
export function canEditTask(t: Task): boolean {
  return t.status !== 'done' && t.status !== 'cancelled';
}

/** Expense: editable in submitted/draft by the owning member */
export function canEditExpense(e: Expense, userDid?: string): boolean {
  return (e.status === 'submitted' || e.status === 'draft') && !!userDid && e.memberDid === userDid;
}

/** Officer: editable only while active */
export function canEditOfficer(o: Officer): boolean {
  return o.status === 'active';
}

/** Compliance item: editable while pending or overdue */
export function canEditComplianceItem(c: ComplianceItem): boolean {
  return c.status === 'pending' || c.status === 'overdue';
}

/** Fiscal period: editable only while open */
export function canEditFiscalPeriod(f: FiscalPeriod): boolean {
  return f.status === 'open';
}

/** Commerce listing: editable while active or paused */
export function canEditCommerceListing(l: CommerceListing): boolean {
  return l.status === 'active' || l.status === 'paused';
}

/** Commerce need: editable while open or matched */
export function canEditCommerceNeed(n: CommerceNeed): boolean {
  return n.status === 'open' || n.status === 'matched';
}

// ─── canDelete helpers ──────────────────────────────────────────────

/** Proposal: deletable only in draft by the author */
export function canDeleteProposal(p: Proposal, userDid?: string): boolean {
  return p.status === 'draft' && !!userDid && p.authorDid === userDid;
}

/** Agreement: deletable only in draft by the author */
export function canDeleteAgreement(a: Agreement, userDid?: string): boolean {
  return a.status === 'draft' && !!userDid && a.authorDid === userDid;
}

/** Campaign: deletable only in draft (cooperative-scoped, no author check) */
export function canDeleteCampaign(c: Campaign): boolean {
  return c.status === 'draft';
}

/** Task: deletable unless done or cancelled */
export function canDeleteTask(t: Task): boolean {
  return t.status !== 'done' && t.status !== 'cancelled';
}

/** Expense: deletable only in draft by the owning member */
export function canDeleteExpense(e: Expense, userDid?: string): boolean {
  return e.status === 'draft' && !!userDid && e.memberDid === userDid;
}

/** Commerce listing: deletable (archived) while active or paused */
export function canDeleteCommerceListing(l: CommerceListing): boolean {
  return l.status === 'active' || l.status === 'paused';
}

/** Commerce need: deletable (cancelled) while open or matched */
export function canDeleteCommerceNeed(n: CommerceNeed): boolean {
  return n.status === 'open' || n.status === 'matched';
}

/** Post: deletable by the author regardless of status */
export function canDeletePost(p: Post, userDid?: string): boolean {
  return !!userDid && p.authorDid === userDid;
}
