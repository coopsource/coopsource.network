import type {
  JsonObject,
  JsonValue,
  PatronageAllocatorPlugin,
} from '@coopsource/governance-view';

export interface CoopPatronageMetric {
  readonly memberDid: string;
  readonly metricValue: number;
  readonly stakeholderClass?: string | null;
}

export interface CoopPatronageAllocation {
  readonly memberDid: string;
  readonly stakeholderClass: string | null;
  readonly metricValue: number;
  readonly patronageRatio: number;
  readonly totalAllocation: number;
  readonly cashAmount: number;
  readonly retainedAmount: number;
}

export class CoopPatronageAllocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoopPatronageAllocationError';
  }
}

export class CoopPatronageAllocatorPlugin
  implements PatronageAllocatorPlugin
{
  async allocate(
    input: Parameters<PatronageAllocatorPlugin['allocate']>[0],
  ): ReturnType<PatronageAllocatorPlugin['allocate']> {
    return {
      allocations: calculateCoopPatronageAllocations({
        surplus: input.surplus,
        metrics: parseCoopPatronageMetrics(input.metrics),
        cashPayoutPct: parseCashPayoutPct(input.policy),
      }).map(coopPatronageAllocationToJson),
    };
  }
}

export function createCoopPatronageAllocatorPlugin(): PatronageAllocatorPlugin {
  return new CoopPatronageAllocatorPlugin();
}

export function calculateCoopPatronageAllocations(input: {
  readonly surplus: number;
  readonly metrics: readonly CoopPatronageMetric[];
  readonly cashPayoutPct?: number;
}): readonly CoopPatronageAllocation[] {
  const totalMetrics = input.metrics.reduce(
    (sum, metric) => sum + metric.metricValue,
    0,
  );
  if (totalMetrics === 0) {
    throw new CoopPatronageAllocationError(
      'Total metric values cannot be zero',
    );
  }

  const cashPayoutPct = input.cashPayoutPct ?? 20;
  return input.metrics.map((metric) => {
    const ratio = metric.metricValue / totalMetrics;
    const totalAllocation = roundCurrency(input.surplus * ratio);
    const cashAmount = roundCurrency(
      totalAllocation * (cashPayoutPct / 100),
    );
    const retainedAmount = roundCurrency(totalAllocation - cashAmount);

    return {
      memberDid: metric.memberDid,
      stakeholderClass: metric.stakeholderClass ?? null,
      metricValue: metric.metricValue,
      patronageRatio: ratio,
      totalAllocation,
      cashAmount,
      retainedAmount,
    };
  });
}

export function parseCoopPatronageMetrics(
  values: readonly JsonValue[],
): readonly CoopPatronageMetric[] {
  return values.map((value) => {
    const record = requireJsonObject(value, 'Patronage metric');
    const memberDid = record['memberDid'];
    const metricValue = record['metricValue'];
    const stakeholderClass = record['stakeholderClass'];

    if (typeof memberDid !== 'string' || memberDid.length === 0) {
      throw new CoopPatronageAllocationError(
        'Patronage metric memberDid must be a non-empty string',
      );
    }
    if (typeof metricValue !== 'number' || !Number.isFinite(metricValue)) {
      throw new CoopPatronageAllocationError(
        `Patronage metric value must be finite for ${memberDid}`,
      );
    }
    if (
      stakeholderClass !== undefined &&
      stakeholderClass !== null &&
      typeof stakeholderClass !== 'string'
    ) {
      throw new CoopPatronageAllocationError(
        `Patronage stakeholderClass must be a string or null for ${memberDid}`,
      );
    }

    return {
      memberDid,
      metricValue,
      stakeholderClass: stakeholderClass ?? null,
    };
  });
}

export function parseCoopPatronageAllocations(
  values: readonly JsonValue[],
): readonly CoopPatronageAllocation[] {
  return values.map((value) => {
    const record = requireJsonObject(value, 'Patronage allocation');
    const memberDid = record['memberDid'];
    const stakeholderClass = record['stakeholderClass'];
    const metricValue = record['metricValue'];
    const patronageRatio = record['patronageRatio'];
    const totalAllocation = record['totalAllocation'];
    const cashAmount = record['cashAmount'];
    const retainedAmount = record['retainedAmount'];

    if (typeof memberDid !== 'string' || memberDid.length === 0) {
      throw new CoopPatronageAllocationError(
        'Patronage allocation memberDid must be a non-empty string',
      );
    }
    if (
      stakeholderClass !== null &&
      stakeholderClass !== undefined &&
      typeof stakeholderClass !== 'string'
    ) {
      throw new CoopPatronageAllocationError(
        `Patronage allocation stakeholderClass must be a string or null for ${memberDid}`,
      );
    }

    return {
      memberDid,
      stakeholderClass: stakeholderClass ?? null,
      metricValue: requireFiniteNumber(metricValue, 'metricValue', memberDid),
      patronageRatio: requireFiniteNumber(
        patronageRatio,
        'patronageRatio',
        memberDid,
      ),
      totalAllocation: requireFiniteNumber(
        totalAllocation,
        'totalAllocation',
        memberDid,
      ),
      cashAmount: requireFiniteNumber(cashAmount, 'cashAmount', memberDid),
      retainedAmount: requireFiniteNumber(
        retainedAmount,
        'retainedAmount',
        memberDid,
      ),
    };
  });
}

function coopPatronageAllocationToJson(
  allocation: CoopPatronageAllocation,
): JsonObject {
  return {
    memberDid: allocation.memberDid,
    stakeholderClass: allocation.stakeholderClass,
    metricValue: allocation.metricValue,
    patronageRatio: allocation.patronageRatio,
    totalAllocation: allocation.totalAllocation,
    cashAmount: allocation.cashAmount,
    retainedAmount: allocation.retainedAmount,
  };
}

function parseCashPayoutPct(policy: JsonValue | undefined): number | undefined {
  if (policy === undefined || policy === null) return undefined;
  const record = requireJsonObject(policy, 'Patronage policy');
  const cashPayoutPct = record['cashPayoutPct'];
  if (cashPayoutPct === undefined || cashPayoutPct === null) {
    return undefined;
  }
  if (typeof cashPayoutPct !== 'number' || !Number.isFinite(cashPayoutPct)) {
    throw new CoopPatronageAllocationError(
      'Patronage policy cashPayoutPct must be finite',
    );
  }
  return cashPayoutPct;
}

function requireJsonObject(value: JsonValue, label: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CoopPatronageAllocationError(`${label} must be an object`);
  }
  return value as JsonObject;
}

function requireFiniteNumber(
  value: JsonValue | undefined,
  field: string,
  memberDid: string,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new CoopPatronageAllocationError(
      `Patronage allocation ${field} must be finite for ${memberDid}`,
    );
  }
  return value;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}
