import { describe, it, expect } from 'vitest';
import type { Proposal, Agreement, Campaign, Task, Expense, Officer, ComplianceItem, FiscalPeriod } from '$lib/api/types.js';
import {
  canEditProposal,
  canEditAgreement,
  canEditCampaign,
  canEditTask,
  canEditExpense,
  canEditOfficer,
  canEditComplianceItem,
  canEditFiscalPeriod,
} from './entity-permissions.js';

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return { status: 'draft', authorDid: 'did:plc:alice', ...overrides } as Proposal;
}

function makeAgreement(overrides: Partial<Agreement> = {}): Agreement {
  return { status: 'draft', authorDid: 'did:plc:alice', ...overrides } as Agreement;
}

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return { status: 'draft', ...overrides } as Campaign;
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return { status: 'backlog', ...overrides } as Task;
}

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return { status: 'submitted', memberDid: 'did:plc:alice', ...overrides } as Expense;
}

describe('canEditProposal', () => {
  it('returns true for draft + matching authorDid', () => {
    expect(canEditProposal(makeProposal(), 'did:plc:alice')).toBe(true);
  });

  it('returns false for non-draft', () => {
    expect(canEditProposal(makeProposal({ status: 'open' }), 'did:plc:alice')).toBe(false);
    expect(canEditProposal(makeProposal({ status: 'closed' }), 'did:plc:alice')).toBe(false);
    expect(canEditProposal(makeProposal({ status: 'resolved' }), 'did:plc:alice')).toBe(false);
  });

  it('returns false for different authorDid', () => {
    expect(canEditProposal(makeProposal(), 'did:plc:bob')).toBe(false);
  });

  it('returns false for undefined userDid', () => {
    expect(canEditProposal(makeProposal())).toBe(false);
    expect(canEditProposal(makeProposal(), undefined)).toBe(false);
  });
});

describe('canEditAgreement', () => {
  it('returns true for draft + matching authorDid', () => {
    expect(canEditAgreement(makeAgreement(), 'did:plc:alice')).toBe(true);
  });

  it('returns false for non-draft', () => {
    expect(canEditAgreement(makeAgreement({ status: 'open' }), 'did:plc:alice')).toBe(false);
    expect(canEditAgreement(makeAgreement({ status: 'active' }), 'did:plc:alice')).toBe(false);
    expect(canEditAgreement(makeAgreement({ status: 'terminated' }), 'did:plc:alice')).toBe(false);
  });

  it('returns false for different authorDid', () => {
    expect(canEditAgreement(makeAgreement(), 'did:plc:bob')).toBe(false);
  });
});

describe('canEditCampaign', () => {
  it('returns true for draft', () => {
    expect(canEditCampaign(makeCampaign({ status: 'draft' }))).toBe(true);
  });

  it('returns true for active', () => {
    expect(canEditCampaign(makeCampaign({ status: 'active' }))).toBe(true);
  });

  it('returns false for funded/completed/cancelled', () => {
    expect(canEditCampaign(makeCampaign({ status: 'funded' }))).toBe(false);
    expect(canEditCampaign(makeCampaign({ status: 'completed' }))).toBe(false);
    expect(canEditCampaign(makeCampaign({ status: 'cancelled' }))).toBe(false);
  });
});

describe('canEditTask', () => {
  it('returns true for backlog, todo, in_progress, in_review', () => {
    expect(canEditTask(makeTask({ status: 'backlog' }))).toBe(true);
    expect(canEditTask(makeTask({ status: 'todo' }))).toBe(true);
    expect(canEditTask(makeTask({ status: 'in_progress' }))).toBe(true);
    expect(canEditTask(makeTask({ status: 'in_review' }))).toBe(true);
  });

  it('returns false for done, cancelled', () => {
    expect(canEditTask(makeTask({ status: 'done' }))).toBe(false);
    expect(canEditTask(makeTask({ status: 'cancelled' }))).toBe(false);
  });
});

describe('canEditExpense', () => {
  it('returns true for submitted + matching memberDid', () => {
    expect(canEditExpense(makeExpense(), 'did:plc:alice')).toBe(true);
  });

  it('returns false for approved/rejected/reimbursed', () => {
    expect(canEditExpense(makeExpense({ status: 'approved' }), 'did:plc:alice')).toBe(false);
    expect(canEditExpense(makeExpense({ status: 'rejected' }), 'did:plc:alice')).toBe(false);
    expect(canEditExpense(makeExpense({ status: 'reimbursed' }), 'did:plc:alice')).toBe(false);
  });

  it('returns false for different memberDid', () => {
    expect(canEditExpense(makeExpense(), 'did:plc:bob')).toBe(false);
  });
});

describe('canEditOfficer', () => {
  it('returns true for active', () => {
    expect(canEditOfficer({ status: 'active' } as Officer)).toBe(true);
  });

  it('returns false for ended', () => {
    expect(canEditOfficer({ status: 'ended' } as Officer)).toBe(false);
  });
});

describe('canEditComplianceItem', () => {
  it('returns true for pending', () => {
    expect(canEditComplianceItem({ status: 'pending' } as ComplianceItem)).toBe(true);
  });

  it('returns true for overdue', () => {
    expect(canEditComplianceItem({ status: 'overdue' } as ComplianceItem)).toBe(true);
  });

  it('returns false for completed', () => {
    expect(canEditComplianceItem({ status: 'completed' } as ComplianceItem)).toBe(false);
  });
});

describe('canEditFiscalPeriod', () => {
  it('returns true for open', () => {
    expect(canEditFiscalPeriod({ status: 'open' } as FiscalPeriod)).toBe(true);
  });

  it('returns false for closed', () => {
    expect(canEditFiscalPeriod({ status: 'closed' } as FiscalPeriod)).toBe(false);
  });
});
