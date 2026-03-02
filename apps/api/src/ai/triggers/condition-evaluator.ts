import type { TriggerCondition } from './types.js';

/**
 * Resolve a dotted field path (e.g. "proposal.status") from a nested object.
 */
function resolveField(data: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = data;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Evaluate a single condition against the data.
 */
function evaluateOne(condition: TriggerCondition, data: Record<string, unknown>): boolean {
  const actual = resolveField(data, condition.field);
  const expected = condition.value;

  switch (condition.operator) {
    case 'eq':
      return actual === expected;

    case 'neq':
      return actual !== expected;

    case 'contains': {
      if (typeof actual === 'string' && typeof expected === 'string') {
        return actual.includes(expected);
      }
      if (Array.isArray(actual)) {
        return actual.includes(expected);
      }
      return false;
    }

    case 'gt': {
      if (typeof actual === 'number' && typeof expected === 'number') {
        return actual > expected;
      }
      return false;
    }

    case 'lt': {
      if (typeof actual === 'number' && typeof expected === 'number') {
        return actual < expected;
      }
      return false;
    }

    default:
      return false;
  }
}

/**
 * Evaluate all conditions against event data (AND logic).
 * Empty/undefined conditions → true (backward compat).
 */
export function evaluateConditions(
  conditions: TriggerCondition[] | undefined,
  data: Record<string, unknown>,
): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((c) => evaluateOne(c, data));
}
