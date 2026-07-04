import type { DID } from '@coopsource/common';
import { spaceRefKey, type PulledRecord, type SpaceRef } from './types.js';

export interface PullRequest {
  readonly space: SpaceRef;
  readonly memberDid: DID;
  /** Internal Stage 1 cursor. Use '' to pull from the beginning of the sketch store. */
  readonly since: string;
}

/**
 * Pulls a member's records from their permissioned repo for a given space,
 * since a cursor. Real implementations wrap @atproto/sync against the
 * member's PDS; Stage 1 ships an in-memory sketch.
 *
 * Cursor semantics: `since` is a rev string; results include records with
 * `rev > since` (strict inequality). TID-format revs are lexicographically
 * ordered, so string comparison is correct.
 */
export interface RepoPuller {
  pull(req: PullRequest): Promise<PulledRecord[]>;
}

/**
 * Sketch — pulls from an in-memory record store. Useful for tests and dev
 * fixtures. Stage 2's real RepoPuller will require the permissioned-data
 * wire format to be stable upstream.
 *
 * @internal
 */
export class InMemoryRepoPuller implements RepoPuller {
  constructor(private readonly records: ReadonlyArray<PulledRecord>) {}

  async pull(req: PullRequest): Promise<PulledRecord[]> {
    return this.records
      .filter(
        (r) =>
          spaceRefKey(r.location.space) === spaceRefKey(req.space) &&
          r.location.authorDid === req.memberDid &&
          r.sourceRevision > req.since,
      )
      .sort((a, b) => a.sourceRevision.localeCompare(b.sourceRevision));
  }
}
