import type { DID } from '@coopsource/common';
import { spaceRefKey, type SpaceRef } from './types.js';

/**
 * The arbiter's authoritative member list for a space.
 *
 * Per ARCHITECTURE-V12.md §9 "Security requirements": records authored by
 * DIDs not on this list MUST be discarded. Cross-checking against this
 * interface is the load-bearing security boundary of the spaces consumer.
 *
 * Stage 2 (arbiter integration) provides the real XRPC-backed implementation.
 * Stage 1 ships sketch impls (DenyAll fail-closed default, Static for tests).
 */
export interface ArbiterMemberList {
  isMember(space: SpaceRef, did: DID): Promise<boolean>;
  /**
   * Returns the complete authoritative member list for the space.
   * Pagination is the responsibility of the caller (puller layer), not this interface.
   */
  list(space: SpaceRef): Promise<DID[]>;
}

/**
 * Fail-closed default. Denies every membership query and returns an empty
 * member list. Forces the developer to explicitly choose a member-list source
 * before any records are accepted. Mirrors the FailClosedEcmhVerifier pattern.
 */
export class DenyAllArbiterMemberList implements ArbiterMemberList {
  async isMember(_space: SpaceRef, _did: DID): Promise<boolean> { return false; }
  async list(_space: SpaceRef): Promise<DID[]> { return []; }
}

/**
 * Test/development sketch. Accepts an array of { space, members } entries
 * and computes keys internally.
 * Useful for fixtures and for dev setups where an arbiter XRPC client doesn't
 * exist yet.
 */
export class StaticArbiterMemberList implements ArbiterMemberList {
  private readonly map: Record<string, DID[]>;

  constructor(entries: ReadonlyArray<{ space: SpaceRef; members: DID[] }> = []) {
    this.map = {};
    for (const e of entries) {
      this.map[spaceRefKey(e.space)] = e.members;
    }
  }

  async isMember(space: SpaceRef, did: DID): Promise<boolean> {
    return (this.map[spaceRefKey(space)] ?? []).includes(did);
  }

  async list(space: SpaceRef): Promise<DID[]> {
    return [...(this.map[spaceRefKey(space)] ?? [])];
  }
}
