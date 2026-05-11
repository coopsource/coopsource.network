import type { DID } from '@coopsource/common';
import type { SpaceRef } from './types.js';

/**
 * Persistence interface for per-(space, member) pull cursors.
 * Returns '' (empty string) when no cursor has been stored yet.
 */
export interface CursorStore {
  get(space: SpaceRef, memberDid: DID): Promise<string>;
  set(space: SpaceRef, memberDid: DID, value: string): Promise<void>;
}
