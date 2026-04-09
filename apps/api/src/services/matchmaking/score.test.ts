import { describe, it, expect } from 'vitest';
import { scoreCandidate, SCORING_VERSION, type ScoreInput } from './score.js';

/**
 * V8.8 — Pure scoring tests. No DB, no service, no clock.
 *
 * The function under test is deterministic and synchronous. Every test
 * passes a fixed `now` and constructs candidate/ctx fixtures inline so
 * the math stays auditable.
 */

const NOW = new Date('2026-04-08T00:00:00Z');
const ONE_WEEK_AGO = new Date('2026-04-01T00:00:00Z');
const ONE_YEAR_AGO = new Date('2025-04-08T00:00:00Z');

// ScoreInput.candidate is a discriminated union on `type`. The factories
// below return the narrowed variant so tests can spread overrides safely.
type CoopCandidate = Extract<ScoreInput['candidate'], { type: 'cooperative' }>;
type PersonCandidate = Extract<ScoreInput['candidate'], { type: 'person' }>;

function coopCandidate(overrides: Partial<Omit<CoopCandidate, 'type'>> = {}): CoopCandidate {
  return {
    did: 'did:web:coop.example',
    type: 'cooperative',
    cooperativeType: 'worker',
    createdAt: ONE_WEEK_AGO,
    interestPriorityByCategory: new Map<string, number>(),
    sharedCoopCount: 0,
    ...overrides,
  };
}

function personCandidate(
  overrides: Partial<Omit<PersonCandidate, 'type' | 'cooperativeType'>> = {},
): PersonCandidate {
  return {
    did: 'did:web:person.example',
    type: 'person',
    cooperativeType: null,
    createdAt: ONE_WEEK_AGO,
    interestPriorityByCategory: new Map<string, number>(),
    sharedCoopCount: 0,
    ...overrides,
  };
}

function ctx(overrides: Partial<ScoreInput['ctx']> = {}): ScoreInput['ctx'] {
  return {
    userCoopTypes: new Set<string>(),
    userInterestPriorityByCategory: new Map<string, number>(),
    ...overrides,
  };
}

describe('SCORING_VERSION', () => {
  it('is 2 for V8.8', () => {
    expect(SCORING_VERSION).toBe(2);
  });
});

describe('scoreCandidate', () => {
  it('is deterministic for identical inputs', () => {
    const input: ScoreInput = {
      candidate: coopCandidate({
        interestPriorityByCategory: new Map([
          ['climate', 4],
          ['housing', 3],
        ]),
      }),
      ctx: ctx({
        userInterestPriorityByCategory: new Map([
          ['climate', 5],
          ['food', 2],
        ]),
      }),
      now: NOW,
    };
    const a = scoreCandidate(input);
    const b = scoreCandidate(input);
    expect(a).toEqual(b);
  });

  // ─── Fallback (v1 backward compat) ───────────────────────────────────

  it('empty user interests + empty candidate interests falls back to recency * diversity', () => {
    // Coop candidate so diversity is meaningful. User has no coop of this
    // type, so diversity = 1.0. recency(7 days) = e^(-7/30).
    const result = scoreCandidate({
      candidate: coopCandidate({ cooperativeType: 'worker' }),
      ctx: ctx({ userCoopTypes: new Set(['consumer']) }),
      now: NOW,
    });
    const expectedRecency = Math.exp(-7 / 30);
    expect(result.signals.alignment).toBe(0);
    expect(result.signals.recency).toBeCloseTo(expectedRecency, 10);
    expect(result.signals.diversity).toBe(1.0);
    expect(result.score).toBeCloseTo(expectedRecency * 1.0, 10);
  });

  it('empty alignment + matching coop type halves the fallback via diversity', () => {
    const result = scoreCandidate({
      candidate: coopCandidate({ cooperativeType: 'worker' }),
      ctx: ctx({ userCoopTypes: new Set(['worker']) }),
      now: NOW,
    });
    expect(result.signals.alignment).toBe(0);
    expect(result.signals.diversity).toBe(0.5);
    expect(result.score).toBeCloseTo(Math.exp(-7 / 30) * 0.5, 10);
  });

  // ─── Alignment dominates ─────────────────────────────────────────────

  it('high alignment + low recency beats low alignment + high recency', () => {
    const userCtx = ctx({
      userInterestPriorityByCategory: new Map([
        ['climate', 5],
        ['housing', 5],
      ]),
    });

    // High alignment (identical maps), but created a year ago → low recency.
    const oldHighAlign = scoreCandidate({
      candidate: coopCandidate({
        createdAt: ONE_YEAR_AGO,
        interestPriorityByCategory: new Map([
          ['climate', 5],
          ['housing', 5],
        ]),
      }),
      ctx: userCtx,
      now: NOW,
    });

    // Low alignment (one overlapping cat with tiny weight, drowned out by
    // several non-overlapping categories), but freshly created so recency=1.
    // User = {climate:5, housing:5}, Cand = {climate:1, food:5, transport:5}
    //   intersection = min(5,1) = 1
    //   union        = max(5,1) + 5 (housing user-only) + 5 (food cand-only) + 5 (transport cand-only) = 20
    //   alignment    = 0.05
    // Composition (coop): 0.6*0.05 + 0.3*1 + 0.1*1 = 0.43
    // oldHighAlign composition: 0.6*1 + 0.3*(≈0) + 0.1*1 ≈ 0.7
    const freshLowAlign = scoreCandidate({
      candidate: coopCandidate({
        createdAt: NOW,
        interestPriorityByCategory: new Map([
          ['climate', 1],
          ['food', 5],
          ['transport', 5],
        ]),
      }),
      ctx: userCtx,
      now: NOW,
    });

    expect(oldHighAlign.signals.alignment).toBeGreaterThan(freshLowAlign.signals.alignment);
    expect(oldHighAlign.score).toBeGreaterThan(freshLowAlign.score);
  });

  // ─── Three-branch fallback ──────────────────────────────────────────

  it('user has alignment data but candidate has none → score is 0 (suppressed)', () => {
    // User has interests; candidate has none. The alignment-less candidate
    // must NOT outrank any candidate with actual alignment, so score = 0.
    const result = scoreCandidate({
      candidate: coopCandidate({
        createdAt: NOW, // max recency, would otherwise dominate
        interestPriorityByCategory: new Map<string, number>(),
      }),
      ctx: ctx({
        userInterestPriorityByCategory: new Map([['climate', 5]]),
      }),
      now: NOW,
    });
    expect(result.signals.alignment).toBe(0);
    expect(result.signals.recency).toBeCloseTo(1.0, 10);
    expect(result.signals.diversity).toBe(1.0);
    expect(result.score).toBe(0);
  });

  it('user has no alignment data + candidate has none → V8.7 fallback (recency * diversity)', () => {
    // Newly-registered user (no alignment) sees cooperative-type-diversity
    // suggestions instead of an empty feed.
    const result = scoreCandidate({
      candidate: coopCandidate({
        cooperativeType: 'worker',
        interestPriorityByCategory: new Map<string, number>(),
      }),
      ctx: ctx({
        userCoopTypes: new Set(['consumer']),
        userInterestPriorityByCategory: new Map<string, number>(),
      }),
      now: NOW,
    });
    const expectedRecency = Math.exp(-7 / 30);
    expect(result.signals.alignment).toBe(0);
    expect(result.score).toBeCloseTo(expectedRecency * 1.0, 10);
    expect(result.score).toBeGreaterThan(0);
  });

  it('user has alignment data: alignment-having candidate ranks above no-alignment candidate', () => {
    // Regression guard for the ranking inversion the three-branch fallback
    // fixes. With the old `recency * diversity` fallback, a brand-new coop
    // with no alignment could outrank an older coop that shares interests.
    const userCtx = ctx({
      userInterestPriorityByCategory: new Map([['climate', 5]]),
    });

    const oldAlignedCoop = scoreCandidate({
      candidate: coopCandidate({
        createdAt: ONE_YEAR_AGO, // low recency
        interestPriorityByCategory: new Map([['climate', 3]]),
      }),
      ctx: userCtx,
      now: NOW,
    });

    const freshNoAlignCoop = scoreCandidate({
      candidate: coopCandidate({
        createdAt: NOW, // max recency — would be 1.0 under old fallback
        interestPriorityByCategory: new Map<string, number>(),
      }),
      ctx: userCtx,
      now: NOW,
    });

    expect(oldAlignedCoop.signals.alignment).toBeGreaterThan(0);
    expect(freshNoAlignCoop.signals.alignment).toBe(0);
    expect(freshNoAlignCoop.score).toBe(0);
    expect(oldAlignedCoop.score).toBeGreaterThan(freshNoAlignCoop.score);
  });

  // ─── Person candidates ──────────────────────────────────────────────

  it('person candidate: diversity is always 1.0 regardless of userCoopTypes', () => {
    const result = scoreCandidate({
      candidate: personCandidate(),
      ctx: ctx({ userCoopTypes: new Set(['worker', 'consumer', 'housing']) }),
      now: NOW,
    });
    expect(result.signals.diversity).toBe(1.0);
  });

  it('person candidate: composition uses 0.7*alignment + 0.3*recency (no diversity term)', () => {
    // Identical category/priority maps → alignment = 1.0.
    // createdAt 7 days ago → recency = e^(-7/30).
    const result = scoreCandidate({
      candidate: personCandidate({
        interestPriorityByCategory: new Map([['climate', 4]]),
      }),
      ctx: ctx({
        userInterestPriorityByCategory: new Map([['climate', 4]]),
      }),
      now: NOW,
    });
    const expectedRecency = Math.exp(-7 / 30);
    const expected = 0.7 * 1.0 + 0.3 * expectedRecency;
    expect(result.signals.alignment).toBeCloseTo(1.0, 10);
    expect(result.signals.recency).toBeCloseTo(expectedRecency, 10);
    expect(result.score).toBeCloseTo(expected, 10);
  });

  it('person candidate: sharedCoopCount is propagated into signals even when alignment is 0', () => {
    const result = scoreCandidate({
      candidate: personCandidate({ sharedCoopCount: 3 }),
      ctx: ctx(),
      now: NOW,
    });
    expect(result.signals.alignment).toBe(0);
    expect(result.signals.sharedCoopCount).toBe(3);
  });

  it('person candidate: sharedCoopCount is propagated when alignment is positive', () => {
    const result = scoreCandidate({
      candidate: personCandidate({
        sharedCoopCount: 2,
        interestPriorityByCategory: new Map([['climate', 5]]),
      }),
      ctx: ctx({
        userInterestPriorityByCategory: new Map([['climate', 5]]),
      }),
      now: NOW,
    });
    expect(result.signals.alignment).toBeGreaterThan(0);
    expect(result.signals.sharedCoopCount).toBe(2);
  });
});

describe('weightedJaccard (via scoreCandidate signals.alignment)', () => {
  // Helper that isolates the alignment signal by using a freshly-created
  // candidate (recency=1) and fixed diversity. We read alignment directly
  // from signals so the composition formula doesn't interfere.
  function alignment(
    userMap: Map<string, number>,
    candMap: Map<string, number>,
  ): number {
    return scoreCandidate({
      candidate: coopCandidate({
        createdAt: NOW,
        interestPriorityByCategory: candMap,
      }),
      ctx: ctx({
        userInterestPriorityByCategory: userMap,
      }),
      now: NOW,
    }).signals.alignment;
  }

  function sharedCount(
    userMap: Map<string, number>,
    candMap: Map<string, number>,
  ): number {
    return scoreCandidate({
      candidate: coopCandidate({
        createdAt: NOW,
        interestPriorityByCategory: candMap,
      }),
      ctx: ctx({
        userInterestPriorityByCategory: userMap,
      }),
      now: NOW,
    }).signals.sharedCategoryCount;
  }

  it('identical sets yield 1.0', () => {
    const m = new Map([
      ['climate', 5],
      ['housing', 3],
    ]);
    expect(alignment(m, new Map(m))).toBeCloseTo(1.0, 10);
  });

  it('disjoint sets yield 0.0', () => {
    expect(
      alignment(new Map([['climate', 5]]), new Map([['housing', 5]])),
    ).toBe(0);
  });

  it('subset yields value strictly between 0 and 1', () => {
    // User = {climate: 5}, Cand = {climate: 5, housing: 5}
    // intersection = min(5,5) + min(0,5) = 5
    // union        = max(5,5) + max(0,5) = 10
    // J = 0.5
    const result = alignment(
      new Map([['climate', 5]]),
      new Map([
        ['climate', 5],
        ['housing', 5],
      ]),
    );
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(1);
    expect(result).toBeCloseTo(0.5, 10);
  });

  it('empty user map yields 0', () => {
    expect(alignment(new Map(), new Map([['climate', 5]]))).toBe(0);
  });

  it('empty candidate map yields 0', () => {
    expect(alignment(new Map([['climate', 5]]), new Map())).toBe(0);
  });

  it('asymmetric sets: intersection is sum of mins, union is sum of maxes', () => {
    // User = {climate: 5, food: 2}
    // Cand = {climate: 3, housing: 4}
    // Shared key: climate. min(5,3)=3, max(5,3)=5.
    // User-only food: min(2,0)=0, max(2,0)=2.
    // Cand-only housing: min(0,4)=0, max(0,4)=4.
    // intersection = 3, union = 5 + 2 + 4 = 11 → 3/11
    const user = new Map([
      ['climate', 5],
      ['food', 2],
    ]);
    const cand = new Map([
      ['climate', 3],
      ['housing', 4],
    ]);
    expect(alignment(user, cand)).toBeCloseTo(3 / 11, 10);
  });

  it('sharedCount counts only categories with positive weight on BOTH sides', () => {
    const user = new Map([
      ['climate', 5],
      ['housing', 3],
      ['food', 4],
    ]);
    const cand = new Map([
      ['climate', 2], // shared
      ['housing', 5], // shared
      ['transport', 4], // candidate-only
    ]);
    expect(sharedCount(user, cand)).toBe(2);
  });

  it('sharedCount = 0 when sets are disjoint', () => {
    expect(
      sharedCount(new Map([['a', 1]]), new Map([['b', 1]])),
    ).toBe(0);
  });
});
