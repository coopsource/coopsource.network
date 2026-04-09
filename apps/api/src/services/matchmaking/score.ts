/**
 * V8.8 — Pure scoring module for the Match Service.
 *
 * Extracted from MatchmakingService so tests can call it directly without
 * any DB or service setup. The function is pure: no Date.now(), no
 * Math.random(), no I/O. Caller passes `now`. Two calls with identical
 * inputs MUST yield identical outputs.
 *
 * V8.7 shipped a stub (recency × cooperative-type-diversity). V8.8 swaps
 * in alignment-driven scoring backed by the user's and candidate's
 * aggregated alignment interest categories with mean priority weighting,
 * combined via a weighted Jaccard coefficient.
 *
 * Composition:
 *   - When any alignment signal is present (the weighted Jaccard is > 0),
 *     alignment dominates:
 *       cooperative candidate: 0.6 * alignment + 0.3 * recency + 0.1 * diversity
 *       person      candidate: 0.7 * alignment + 0.3 * recency
 *   - When alignment is 0 (one side has no interests, or the sets are
 *     disjoint), the score falls back to `recency * diversity` — the
 *     exact v1 formula. This preserves the V8.7 behavior that
 *     newly-registered users (without any alignment data yet) still see
 *     cooperative-type-diversity suggestions instead of an empty feed.
 *
 * SCORING_VERSION is bumped to 2 for this release so callers can
 * distinguish v1 rows from v2 rows in the database.
 */

export const SCORING_VERSION = 2;

export interface ScoreInput {
  candidate: {
    did: string;
    type: 'cooperative' | 'person';
    /** null for person candidates. */
    cooperativeType: string | null;
    createdAt: Date;
    /** Lowercased categories aggregated for this candidate. Empty = no alignment data. */
    interestCategories: Set<string>;
    /** Mean priority [1,5] per category. Same keys as interestCategories. */
    interestPriorityByCategory: Map<string, number>;
    /**
     * Coops this person also belongs to that the user is also a member of.
     * 0 for cooperative candidates.
     */
    sharedCoopCount: number;
  };
  ctx: {
    userCoopTypes: Set<string>;
    userInterestCategories: Set<string>;
    userInterestPriorityByCategory: Map<string, number>;
  };
  now: Date;
}

export interface ScoreSignals {
  /** Weighted Jaccard on interest priorities, in [0, 1]. */
  alignment: number;
  /** Recency factor in (0, 1]: e^(-ageDays/30). Newer = higher. */
  recency: number;
  /** Diversity bonus: always 1.0 for persons. For coops: 1.0 if user has
   *  no coop of this type, else 0.5. */
  diversity: number;
  /** Days between candidate.createdAt and `now`. Negative if candidate is in the future. */
  ageDays: number;
  /** Count of categories present on BOTH sides with positive weight. Diagnostic. */
  sharedCategoryCount: number;
  /** Passed through from candidate.sharedCoopCount. 0 for coop candidates. */
  sharedCoopCount: number;
}

export interface ScoreOutput {
  /** Final score in [0, 1]. */
  score: number;
  signals: ScoreSignals;
}

const MS_PER_DAY = 86_400_000;

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Weighted Jaccard coefficient over category→priority maps.
 *
 *   J(a, b) = sum_k min(a_k, b_k) / sum_k max(a_k, b_k)
 *
 * A missing key is treated as weight 0 on that side. Returns 0 when
 * either side is empty (no alignment data) or the union is 0.
 *
 * Also counts the number of categories present with positive weight on
 * BOTH sides — useful as a diagnostic and as an input to the service
 * layer's additional heuristics.
 */
function weightedJaccard(
  a: Map<string, number>,
  b: Map<string, number>,
): { score: number; sharedCount: number } {
  if (a.size === 0 || b.size === 0) return { score: 0, sharedCount: 0 };
  let intersection = 0;
  let union = 0;
  let sharedCount = 0;
  const seen = new Set<string>();
  for (const [cat, wa] of a) {
    seen.add(cat);
    const wb = b.get(cat) ?? 0;
    intersection += Math.min(wa, wb);
    union += Math.max(wa, wb);
    if (wb > 0) sharedCount += 1;
  }
  for (const [cat, wb] of b) {
    if (seen.has(cat)) continue;
    // wa is 0 here, so min=0 (no intersection contribution), max=wb.
    union += wb;
  }
  return {
    score: union > 0 ? intersection / union : 0,
    sharedCount,
  };
}

export function scoreCandidate(input: ScoreInput): ScoreOutput {
  const { candidate, ctx, now } = input;

  const ageDays = (now.getTime() - candidate.createdAt.getTime()) / MS_PER_DAY;
  // 30-day half-life-ish recency curve. Stays positive for negative ageDays
  // (future-dated candidates) but caps at 1 via clamp.
  const recency = clamp01(Math.exp(-Math.max(0, ageDays) / 30));

  const diversity =
    candidate.type === 'person'
      ? 1.0
      : ctx.userCoopTypes.has(candidate.cooperativeType ?? '')
        ? 0.5
        : 1.0;

  const { score: alignment, sharedCount } = weightedJaccard(
    ctx.userInterestPriorityByCategory,
    candidate.interestPriorityByCategory,
  );

  // Composition: alignment dominates when present; recency * diversity is a
  // fallback floor so newly-registered users still see matches (the v1
  // behavior V8.7 deliberately preserved).
  let score: number;
  if (alignment > 0) {
    score =
      candidate.type === 'cooperative'
        ? clamp01(0.6 * alignment + 0.3 * recency + 0.1 * diversity)
        : clamp01(0.7 * alignment + 0.3 * recency);
  } else {
    score = clamp01(recency * diversity);
  }

  return {
    score,
    signals: {
      alignment,
      recency,
      diversity,
      ageDays,
      sharedCategoryCount: sharedCount,
      sharedCoopCount: candidate.sharedCoopCount,
    },
  };
}
