/**
 * V8.7 — Pure scoring module for the Match Service.
 *
 * Extracted from MatchmakingService so tests can call it directly without
 * any DB or service setup. The function is pure: no Date.now(), no
 * Math.random(), no I/O. Caller passes `now`. Two calls with identical
 * inputs MUST yield identical outputs.
 *
 * V8.7 is a deliberate stub: recency × cooperative-type-diversity. V8.8
 * will rewrite this module with alignment-based scoring (interest overlap,
 * outcome alignment, geographic proximity, mutual connections). When that
 * happens, bump SCORING_VERSION so callers can distinguish v1 rows from
 * v2 rows in the database.
 */

export interface ScoreInput {
  candidate: {
    did: string;
    cooperativeType: string;
    createdAt: Date;
  };
  ctx: {
    /** Cooperative types the user is already a member of. */
    userCoopTypes: Set<string>;
  };
  now: Date;
}

export interface ScoreSignals {
  /** Recency factor in (0, 1]: e^(-ageDays/30). Newer = higher. */
  recency: number;
  /** Diversity bonus: 1.0 if user has no coop of this type, else 0.5. */
  diversity: number;
  /** Days between candidate.createdAt and `now`. Negative if candidate is in the future. */
  ageDays: number;
}

export interface ScoreOutput {
  /** Final score in [0, 1]. */
  score: number;
  signals: ScoreSignals;
}

/**
 * Bumped whenever the scoring algorithm changes shape. The service
 * stamps this into `match_suggestion.reason.version` for every row it
 * inserts. Future readers can use it to distinguish historical rows
 * from current rows when the algorithm has changed.
 */
export const SCORING_VERSION = 1;

const MS_PER_DAY = 86_400_000;

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function scoreCandidate(input: ScoreInput): ScoreOutput {
  const { candidate, ctx, now } = input;

  const ageDays = (now.getTime() - candidate.createdAt.getTime()) / MS_PER_DAY;
  // 30-day half-life-ish recency curve. Stays positive for negative ageDays
  // (future-dated candidates) but caps at 1 via clamp.
  const recency = clamp01(Math.exp(-Math.max(0, ageDays) / 30));

  const diversity = ctx.userCoopTypes.has(candidate.cooperativeType) ? 0.5 : 1.0;

  const score = clamp01(recency * diversity);

  return {
    score,
    signals: { recency, diversity, ageDays },
  };
}
