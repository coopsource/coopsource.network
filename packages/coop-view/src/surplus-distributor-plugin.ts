import type {
  JsonObject,
  JsonValue,
  SurplusDistributorPlugin,
} from '@coopsource/governance-view';

export interface CoopSurplusAllocation {
  readonly patronageRecordId: string;
  readonly memberDid: string;
  readonly retainedAmount: number;
}

export interface CoopSurplusDistribution {
  readonly patronageRecordId: string;
  readonly memberDid: string;
  readonly transactionType: 'patronage_allocation';
  readonly amount: number;
  readonly description: string;
}

export class CoopSurplusDistributionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoopSurplusDistributionError';
  }
}

export class CoopSurplusDistributorPlugin implements SurplusDistributorPlugin {
  async distribute(
    input: Parameters<SurplusDistributorPlugin['distribute']>[0],
  ): ReturnType<SurplusDistributorPlugin['distribute']> {
    return {
      distributions: planCoopSurplusDistributions({
        fiscalPeriodId: input.period.id,
        allocations: parseCoopSurplusAllocations(input.allocations),
      }).map(coopSurplusDistributionToJson),
    };
  }
}

export function createCoopSurplusDistributorPlugin(): SurplusDistributorPlugin {
  return new CoopSurplusDistributorPlugin();
}

export function planCoopSurplusDistributions(input: {
  readonly fiscalPeriodId: string;
  readonly allocations: readonly CoopSurplusAllocation[];
}): readonly CoopSurplusDistribution[] {
  return input.allocations
    .filter((allocation) => allocation.retainedAmount > 0)
    .map((allocation) => ({
      patronageRecordId: allocation.patronageRecordId,
      memberDid: allocation.memberDid,
      transactionType: 'patronage_allocation' as const,
      amount: allocation.retainedAmount,
      description: `Patronage allocation for fiscal period ${input.fiscalPeriodId}`,
    }));
}

export function parseCoopSurplusAllocations(
  values: readonly JsonValue[],
): readonly CoopSurplusAllocation[] {
  return values.map((value) => {
    const record = requireJsonObject(value, 'Surplus allocation');
    const patronageRecordId = record['patronageRecordId'];
    const memberDid = record['memberDid'];
    const retainedAmount = record['retainedAmount'];

    if (
      typeof patronageRecordId !== 'string' ||
      patronageRecordId.length === 0
    ) {
      throw new CoopSurplusDistributionError(
        'Surplus allocation patronageRecordId must be a non-empty string',
      );
    }
    if (typeof memberDid !== 'string' || memberDid.length === 0) {
      throw new CoopSurplusDistributionError(
        'Surplus allocation memberDid must be a non-empty string',
      );
    }
    if (
      typeof retainedAmount !== 'number' ||
      !Number.isFinite(retainedAmount)
    ) {
      throw new CoopSurplusDistributionError(
        `Surplus allocation retainedAmount must be finite for ${memberDid}`,
      );
    }
    if (retainedAmount < 0) {
      throw new CoopSurplusDistributionError(
        `Surplus allocation retainedAmount must be non-negative for ${memberDid}`,
      );
    }

    return { patronageRecordId, memberDid, retainedAmount };
  });
}

export function parseCoopSurplusDistributions(
  values: readonly JsonValue[],
): readonly CoopSurplusDistribution[] {
  return values.map((value) => {
    const record = requireJsonObject(value, 'Surplus distribution');
    const patronageRecordId = record['patronageRecordId'];
    const memberDid = record['memberDid'];
    const transactionType = record['transactionType'];
    const amount = record['amount'];
    const description = record['description'];

    if (
      typeof patronageRecordId !== 'string' ||
      patronageRecordId.length === 0
    ) {
      throw new CoopSurplusDistributionError(
        'Surplus distribution patronageRecordId must be a non-empty string',
      );
    }
    if (typeof memberDid !== 'string' || memberDid.length === 0) {
      throw new CoopSurplusDistributionError(
        'Surplus distribution memberDid must be a non-empty string',
      );
    }
    if (transactionType !== 'patronage_allocation') {
      throw new CoopSurplusDistributionError(
        `Unsupported surplus distribution transaction type for ${memberDid}`,
      );
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      throw new CoopSurplusDistributionError(
        `Surplus distribution amount must be finite for ${memberDid}`,
      );
    }
    if (amount <= 0) {
      throw new CoopSurplusDistributionError(
        `Surplus distribution amount must be positive for ${memberDid}`,
      );
    }
    if (typeof description !== 'string' || description.length === 0) {
      throw new CoopSurplusDistributionError(
        `Surplus distribution description must be a non-empty string for ${memberDid}`,
      );
    }

    return {
      patronageRecordId,
      memberDid,
      transactionType,
      amount,
      description,
    };
  });
}

function coopSurplusDistributionToJson(
  distribution: CoopSurplusDistribution,
): JsonObject {
  return {
    patronageRecordId: distribution.patronageRecordId,
    memberDid: distribution.memberDid,
    transactionType: distribution.transactionType,
    amount: distribution.amount,
    description: distribution.description,
  };
}

function requireJsonObject(value: JsonValue, label: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CoopSurplusDistributionError(`${label} must be an object`);
  }
  return value as JsonObject;
}
