import { describe, it, expect } from 'vitest';
import type { Proposal, Agreement, Campaign, Task, Expense, Officer, ComplianceItem, FiscalPeriod, CommerceListing, CommerceNeed, Post } from '$lib/api/types.js';
import {
  canEditProposal,
  canEditAgreement,
  canEditCampaign,
  canEditTask,
  canEditExpense,
  canEditOfficer,
  canEditComplianceItem,
  canEditFiscalPeriod,
  canEditCommerceListing,
  canEditCommerceNeed,
  canDeleteProposal,
  canDeleteAgreement,
  canDeleteCampaign,
  canDeleteTask,
  canDeleteExpense,
  canDeleteCommerceListing,
  canDeleteCommerceNeed,
  canDeletePost,
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

describe('canEditCommerceListing', () => {
  it('returns true for active', () => {
    expect(canEditCommerceListing({ status: 'active' } as CommerceListing)).toBe(true);
  });

  it('returns true for paused', () => {
    expect(canEditCommerceListing({ status: 'paused' } as CommerceListing)).toBe(true);
  });

  it('returns false for archived', () => {
    expect(canEditCommerceListing({ status: 'archived' } as CommerceListing)).toBe(false);
  });
});

describe('canEditCommerceNeed', () => {
  it('returns true for open', () => {
    expect(canEditCommerceNeed({ status: 'open' } as CommerceNeed)).toBe(true);
  });

  it('returns true for matched', () => {
    expect(canEditCommerceNeed({ status: 'matched' } as CommerceNeed)).toBe(true);
  });

  it('returns false for fulfilled', () => {
    expect(canEditCommerceNeed({ status: 'fulfilled' } as CommerceNeed)).toBe(false);
  });

  it('returns false for cancelled', () => {
    expect(canEditCommerceNeed({ status: 'cancelled' } as CommerceNeed)).toBe(false);
  });
});

// ─── canDelete helpers ──────────────────────────────────────────────

function makePost(overrides: Partial<Post> = {}): Post {
  return { authorDid: 'did:plc:alice', status: 'active', ...overrides } as Post;
}

describe('canDeleteProposal', () => {
  it('returns true for draft + matching authorDid', () => {
    expect(canDeleteProposal(makeProposal(), 'did:plc:alice')).toBe(true);
  });

  it('returns false for non-draft', () => {
    expect(canDeleteProposal(makeProposal({ status: 'open' }), 'did:plc:alice')).toBe(false);
    expect(canDeleteProposal(makeProposal({ status: 'closed' }), 'did:plc:alice')).toBe(false);
    expect(canDeleteProposal(makeProposal({ status: 'resolved' }), 'did:plc:alice')).toBe(false);
  });

  it('returns false for different authorDid', () => {
    expect(canDeleteProposal(makeProposal(), 'did:plc:bob')).toBe(false);
  });

  it('returns false for undefined userDid', () => {
    expect(canDeleteProposal(makeProposal())).toBe(false);
  });
});

describe('canDeleteAgreement', () => {
  it('returns true for draft + matching authorDid', () => {
    expect(canDeleteAgreement(makeAgreement(), 'did:plc:alice')).toBe(true);
  });

  it('returns false for non-draft', () => {
    expect(canDeleteAgreement(makeAgreement({ status: 'open' }), 'did:plc:alice')).toBe(false);
    expect(canDeleteAgreement(makeAgreement({ status: 'active' }), 'did:plc:alice')).toBe(false);
    expect(canDeleteAgreement(makeAgreement({ status: 'terminated' }), 'did:plc:alice')).toBe(false);
  });

  it('returns false for different authorDid', () => {
    expect(canDeleteAgreement(makeAgreement(), 'did:plc:bob')).toBe(false);
  });
});

describe('canDeleteCampaign', () => {
  it('returns true for draft', () => {
    expect(canDeleteCampaign(makeCampaign({ status: 'draft' }))).toBe(true);
  });

  it('returns false for active/funded/completed/cancelled', () => {
    expect(canDeleteCampaign(makeCampaign({ status: 'active' }))).toBe(false);
    expect(canDeleteCampaign(makeCampaign({ status: 'funded' }))).toBe(false);
    expect(canDeleteCampaign(makeCampaign({ status: 'completed' }))).toBe(false);
    expect(canDeleteCampaign(makeCampaign({ status: 'cancelled' }))).toBe(false);
  });
});

describe('canDeleteTask', () => {
  it('returns true for backlog, todo, in_progress, in_review', () => {
    expect(canDeleteTask(makeTask({ status: 'backlog' }))).toBe(true);
    expect(canDeleteTask(makeTask({ status: 'todo' }))).toBe(true);
    expect(canDeleteTask(makeTask({ status: 'in_progress' }))).toBe(true);
    expect(canDeleteTask(makeTask({ status: 'in_review' }))).toBe(true);
  });

  it('returns false for done, cancelled', () => {
    expect(canDeleteTask(makeTask({ status: 'done' }))).toBe(false);
    expect(canDeleteTask(makeTask({ status: 'cancelled' }))).toBe(false);
  });
});

describe('canDeleteExpense', () => {
  it('returns true for draft + matching memberDid', () => {
    expect(canDeleteExpense(makeExpense({ status: 'draft' }), 'did:plc:alice')).toBe(true);
  });

  it('returns false for submitted (backend rejects)', () => {
    expect(canDeleteExpense(makeExpense({ status: 'submitted' }), 'did:plc:alice')).toBe(false);
  });

  it('returns false for approved/rejected/reimbursed', () => {
    expect(canDeleteExpense(makeExpense({ status: 'approved' }), 'did:plc:alice')).toBe(false);
    expect(canDeleteExpense(makeExpense({ status: 'rejected' }), 'did:plc:alice')).toBe(false);
    expect(canDeleteExpense(makeExpense({ status: 'reimbursed' }), 'did:plc:alice')).toBe(false);
  });

  it('returns false for different memberDid', () => {
    expect(canDeleteExpense(makeExpense({ status: 'draft' }), 'did:plc:bob')).toBe(false);
  });

  it('returns false for undefined userDid', () => {
    expect(canDeleteExpense(makeExpense({ status: 'draft' }))).toBe(false);
  });
});

describe('canDeleteCommerceListing', () => {
  it('returns true for active', () => {
    expect(canDeleteCommerceListing({ status: 'active' } as CommerceListing)).toBe(true);
  });

  it('returns true for paused', () => {
    expect(canDeleteCommerceListing({ status: 'paused' } as CommerceListing)).toBe(true);
  });

  it('returns false for archived', () => {
    expect(canDeleteCommerceListing({ status: 'archived' } as CommerceListing)).toBe(false);
  });
});

describe('canDeleteCommerceNeed', () => {
  it('returns true for open', () => {
    expect(canDeleteCommerceNeed({ status: 'open' } as CommerceNeed)).toBe(true);
  });

  it('returns true for matched', () => {
    expect(canDeleteCommerceNeed({ status: 'matched' } as CommerceNeed)).toBe(true);
  });

  it('returns false for fulfilled', () => {
    expect(canDeleteCommerceNeed({ status: 'fulfilled' } as CommerceNeed)).toBe(false);
  });

  it('returns false for cancelled', () => {
    expect(canDeleteCommerceNeed({ status: 'cancelled' } as CommerceNeed)).toBe(false);
  });
});

describe('canDeletePost', () => {
  it('returns true for matching authorDid', () => {
    expect(canDeletePost(makePost(), 'did:plc:alice')).toBe(true);
  });

  it('returns true regardless of status', () => {
    expect(canDeletePost(makePost({ status: 'active' }), 'did:plc:alice')).toBe(true);
    expect(canDeletePost(makePost({ status: 'archived' }), 'did:plc:alice')).toBe(true);
  });

  it('returns false for different authorDid', () => {
    expect(canDeletePost(makePost(), 'did:plc:bob')).toBe(false);
  });

  it('returns false for undefined userDid', () => {
    expect(canDeletePost(makePost())).toBe(false);
  });
});
