import { describe, it, expect } from 'vitest';
import {
  CreateCampaignSchema,
  UpdateCampaignSchema,
  UpdateCampaignStatusSchema,
  CampaignTier,
  CampaignType,
  CampaignStatus,
  FundingModel,
} from '../src/validation.js';

describe('CampaignTier', () => {
  it('accepts valid tiers', () => {
    expect(CampaignTier.safeParse('network').success).toBe(true);
    expect(CampaignTier.safeParse('cooperative').success).toBe(true);
    expect(CampaignTier.safeParse('project').success).toBe(true);
  });

  it('rejects invalid tier', () => {
    expect(CampaignTier.safeParse('global').success).toBe(false);
    expect(CampaignTier.safeParse('').success).toBe(false);
  });
});

describe('CampaignType', () => {
  it('accepts valid types', () => {
    expect(CampaignType.safeParse('rewards').success).toBe(true);
    expect(CampaignType.safeParse('patronage').success).toBe(true);
    expect(CampaignType.safeParse('donation').success).toBe(true);
    expect(CampaignType.safeParse('revenue_share').success).toBe(true);
  });

  it('rejects invalid type', () => {
    expect(CampaignType.safeParse('equity').success).toBe(false);
  });
});

describe('CampaignStatus', () => {
  it('accepts valid statuses', () => {
    expect(CampaignStatus.safeParse('draft').success).toBe(true);
    expect(CampaignStatus.safeParse('active').success).toBe(true);
    expect(CampaignStatus.safeParse('funded').success).toBe(true);
    expect(CampaignStatus.safeParse('completed').success).toBe(true);
    expect(CampaignStatus.safeParse('cancelled').success).toBe(true);
  });

  it('rejects invalid status', () => {
    expect(CampaignStatus.safeParse('paused').success).toBe(false);
  });
});

describe('FundingModel', () => {
  it('accepts valid models', () => {
    expect(FundingModel.safeParse('all_or_nothing').success).toBe(true);
    expect(FundingModel.safeParse('keep_it_all').success).toBe(true);
  });

  it('rejects invalid model', () => {
    expect(FundingModel.safeParse('flexible').success).toBe(false);
  });
});

describe('CreateCampaignSchema', () => {
  const validInput = {
    beneficiaryUri: 'network:coopsource',
    title: 'Fund Our Platform',
    tier: 'network',
    campaignType: 'donation',
    goalAmount: 100000,
  };

  it('validates a minimal valid campaign', () => {
    const result = CreateCampaignSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('Fund Our Platform');
      expect(result.data.goalAmount).toBe(100000);
      expect(result.data.goalCurrency).toBe('USD');
      expect(result.data.fundingModel).toBe('all_or_nothing');
    }
  });

  it('validates with all optional fields', () => {
    const result = CreateCampaignSchema.safeParse({
      ...validInput,
      description: 'A great campaign',
      goalCurrency: 'EUR',
      fundingModel: 'keep_it_all',
      startDate: '2026-03-01T00:00:00.000Z',
      endDate: '2026-06-01T00:00:00.000Z',
      metadata: { rewardTiers: [] },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.goalCurrency).toBe('EUR');
      expect(result.data.fundingModel).toBe('keep_it_all');
    }
  });

  it('rejects missing title', () => {
    const { title, ...noTitle } = validInput;
    expect(CreateCampaignSchema.safeParse(noTitle).success).toBe(false);
  });

  it('rejects empty title', () => {
    expect(CreateCampaignSchema.safeParse({ ...validInput, title: '' }).success).toBe(false);
  });

  it('rejects title exceeding max length', () => {
    expect(
      CreateCampaignSchema.safeParse({ ...validInput, title: 'a'.repeat(257) }).success,
    ).toBe(false);
  });

  it('rejects missing beneficiaryUri', () => {
    const { beneficiaryUri, ...noBeneficiary } = validInput;
    expect(CreateCampaignSchema.safeParse(noBeneficiary).success).toBe(false);
  });

  it('rejects invalid tier', () => {
    expect(
      CreateCampaignSchema.safeParse({ ...validInput, tier: 'global' }).success,
    ).toBe(false);
  });

  it('rejects invalid campaign type', () => {
    expect(
      CreateCampaignSchema.safeParse({ ...validInput, campaignType: 'equity' }).success,
    ).toBe(false);
  });

  it('rejects goal amount of 0', () => {
    expect(
      CreateCampaignSchema.safeParse({ ...validInput, goalAmount: 0 }).success,
    ).toBe(false);
  });

  it('rejects negative goal amount', () => {
    expect(
      CreateCampaignSchema.safeParse({ ...validInput, goalAmount: -500 }).success,
    ).toBe(false);
  });

  it('rejects non-integer goal amount', () => {
    expect(
      CreateCampaignSchema.safeParse({ ...validInput, goalAmount: 99.5 }).success,
    ).toBe(false);
  });

  it('rejects missing tier', () => {
    const { tier, ...noTier } = validInput;
    expect(CreateCampaignSchema.safeParse(noTier).success).toBe(false);
  });
});

describe('UpdateCampaignSchema', () => {
  it('validates partial update', () => {
    const result = UpdateCampaignSchema.safeParse({ title: 'Updated Title' });
    expect(result.success).toBe(true);
  });

  it('validates empty object (no changes)', () => {
    const result = UpdateCampaignSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('allows nullable metadata', () => {
    const result = UpdateCampaignSchema.safeParse({ metadata: null });
    expect(result.success).toBe(true);
  });

  it('rejects invalid funding model', () => {
    expect(
      UpdateCampaignSchema.safeParse({ fundingModel: 'flexible' }).success,
    ).toBe(false);
  });
});

describe('UpdateCampaignStatusSchema', () => {
  it('accepts valid status transitions', () => {
    expect(UpdateCampaignStatusSchema.safeParse({ status: 'active' }).success).toBe(true);
    expect(UpdateCampaignStatusSchema.safeParse({ status: 'funded' }).success).toBe(true);
    expect(UpdateCampaignStatusSchema.safeParse({ status: 'completed' }).success).toBe(true);
    expect(UpdateCampaignStatusSchema.safeParse({ status: 'cancelled' }).success).toBe(true);
  });

  it('rejects draft status (cannot transition back to draft)', () => {
    expect(UpdateCampaignStatusSchema.safeParse({ status: 'draft' }).success).toBe(false);
  });

  it('rejects invalid status', () => {
    expect(UpdateCampaignStatusSchema.safeParse({ status: 'paused' }).success).toBe(false);
  });

  it('rejects missing status', () => {
    expect(UpdateCampaignStatusSchema.safeParse({}).success).toBe(false);
  });
});
