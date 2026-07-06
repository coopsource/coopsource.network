import type { DID } from '@coopsource/common';
import type { Database } from '@coopsource/db';
import type { Kysely } from 'kysely';

export interface DidEquivalencePort {
  areEquivalent(leftDid: DID, rightDid: DID): Promise<boolean>;
}

export class RawDidEquivalencePort implements DidEquivalencePort {
  async areEquivalent(leftDid: DID, rightDid: DID): Promise<boolean> {
    return leftDid === rightDid;
  }
}

export interface KyselyDidEquivalencePortOptions {
  readonly maxDepth?: number;
}

export class KyselyDidEquivalencePort implements DidEquivalencePort {
  private readonly maxDepth: number;

  constructor(
    private readonly db: Kysely<Database>,
    options: KyselyDidEquivalencePortOptions = {},
  ) {
    this.maxDepth = options.maxDepth ?? 32;
  }

  async areEquivalent(leftDid: DID, rightDid: DID): Promise<boolean> {
    if (leftDid === rightDid) return true;
    const [leftCurrent, rightCurrent] = await Promise.all([
      this.resolveCurrentDid(leftDid),
      this.resolveCurrentDid(rightDid),
    ]);
    return leftCurrent === rightCurrent;
  }

  private async resolveCurrentDid(did: DID): Promise<DID> {
    let currentDid = did as string;
    const seen = new Set<string>();

    for (let depth = 0; depth < this.maxDepth; depth += 1) {
      if (seen.has(currentDid)) {
        throw new Error(
          `DID rotation history contains a cycle at ${currentDid}`,
        );
      }
      seen.add(currentDid);

      const row = await this.db
        .selectFrom('did_rotation_history')
        .where('prior_did', '=', currentDid)
        .select('current_did')
        .orderBy('rotated_at', 'desc')
        .orderBy('recorded_at', 'desc')
        .executeTakeFirst();

      if (!row) return currentDid as DID;
      currentDid = row.current_did;
    }

    throw new Error(
      `DID rotation history exceeded max depth ${this.maxDepth} for ${did}`,
    );
  }
}
