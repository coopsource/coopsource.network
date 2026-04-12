import type { XrpcContext } from '../dispatcher.js';
import { assertOpenGovernance } from './open-governance-gate.js';

export async function handleGetOfficers(ctx: XrpcContext): Promise<unknown> {
  const cooperativeDid = ctx.params.cooperative as string;
  await assertOpenGovernance(ctx.container.db, cooperativeDid);

  const officers = await ctx.container.officerRecordService.getCurrent(cooperativeDid);

  // Batch look up display names from entity table
  const officerDids = officers.map((o) => o.officer_did);
  const entities =
    officerDids.length > 0
      ? await ctx.container.db
          .selectFrom('entity')
          .where('did', 'in', officerDids)
          .select(['did', 'display_name'])
          .execute()
      : [];
  const nameMap = new Map(entities.map((e) => [e.did, e.display_name]));

  return {
    officers: officers.map((o) => ({
      did: o.officer_did,
      displayName: nameMap.get(o.officer_did) ?? undefined,
      title: o.title,
      appointedAt:
        o.appointed_at instanceof Date
          ? o.appointed_at.toISOString()
          : o.appointed_at,
      termEndsAt: o.term_ends_at
        ? o.term_ends_at instanceof Date
          ? o.term_ends_at.toISOString()
          : o.term_ends_at
        : undefined,
    })),
  };
}
