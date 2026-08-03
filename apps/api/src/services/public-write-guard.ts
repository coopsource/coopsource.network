import { AppError, type DID } from '@coopsource/common';
import { isConfidentialCsnCollection } from '@coopsource/lexicons';
import type { IPdsService, RecordRef } from '@coopsource/federation';

/**
 * Last line of defence against publishing Tier 2 records (audit C-03).
 *
 * The placement port decides *where* a record belongs, but a writer that never
 * consults it cannot be caught by that decision — which is exactly how
 * stakeholder terms and funding pledges kept reaching public repos after C-03
 * was reported fixed. Their own containment test passed because it exercised
 * the port directly, and no writer called it.
 *
 * So the check lives at the boundary that actually performs a public write,
 * where a new caller inherits it by construction instead of having to remember
 * a port. Confidential collections are declared in the space-placement matrix,
 * not listed here, so the two cannot drift.
 */
export function assertPublicWriteAllowed(collection: string): void {
  if (!isConfidentialCsnCollection(collection)) return;

  throw new AppError(
    `'${collection}' is Tier 2 and has no permissioned write path yet; ` +
      'publishing it would put confidential data on the public firehose',
    501,
    'Tier2WriteUnavailable',
  );
}

/**
 * Wraps the public PDS port so every service that writes through it is covered
 * by {@link assertPublicWriteAllowed}, including services that never learned
 * about the placement port. Reads and deletes pass through untouched.
 */
export function guardPublicWrites(inner: IPdsService): IPdsService {
  const guarded: IPdsService = Object.create(inner) as IPdsService;

  guarded.createRecord = async (params: {
    did: DID;
    collection: string;
    record: Record<string, unknown>;
    rkey?: string;
  }): Promise<RecordRef> => {
    assertPublicWriteAllowed(params.collection);
    return inner.createRecord(params);
  };

  guarded.putRecord = async (params: {
    did: DID;
    collection: string;
    rkey: string;
    record: Record<string, unknown>;
  }): Promise<RecordRef> => {
    assertPublicWriteAllowed(params.collection);
    return inner.putRecord(params);
  };

  return guarded;
}
