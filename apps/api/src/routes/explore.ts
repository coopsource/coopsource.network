import { Router } from 'express';
import { sql } from 'kysely';
import type { Container } from '../container.js';
import { asyncHandler } from '../lib/async-handler.js';
import { parsePagination, encodeCursor, decodeCursor } from '../lib/pagination.js';

export function createExploreRoutes(container: Container): Router {
  const router = Router();
  const { db } = container;

  // GET /api/v1/explore/cooperatives — list active cooperatives (public)
  router.get(
    '/api/v1/explore/cooperatives',
    asyncHandler(async (req, res) => {
      const { limit, cursor } = parsePagination(req.query as Record<string, unknown>);

      let query = db
        .selectFrom('entity')
        .innerJoin('cooperative_profile', 'cooperative_profile.entity_did', 'entity.did')
        .leftJoin('membership', (join) =>
          join
            .onRef('membership.cooperative_did', '=', 'entity.did')
            .on('membership.status', '=', 'active'),
        )
        .where('entity.type', '=', 'cooperative')
        .where('entity.status', '=', 'active')
        .where('cooperative_profile.is_network', '=', false)
        .where('cooperative_profile.anon_discoverable', '=', true) // V8.1: opt-in public discoverability
        .groupBy([
          'entity.did',
          'entity.handle',
          'entity.display_name',
          'entity.description',
          'entity.created_at',
          'cooperative_profile.cooperative_type',
          'cooperative_profile.website',
          'cooperative_profile.public_description',
          'cooperative_profile.public_members',
        ])
        .select([
          'entity.did',
          'entity.handle',
          'entity.display_name as displayName',
          'entity.description',
          'entity.created_at as createdAt',
          'cooperative_profile.cooperative_type as cooperativeType',
          'cooperative_profile.website',
          'cooperative_profile.public_description as publicDescription',
          'cooperative_profile.public_members as publicMembers',
          sql<number>`count(membership.id)::int`.as('memberCount'),
        ])
        .orderBy('entity.created_at', 'desc')
        .orderBy('entity.did', 'desc');

      if (cursor) {
        const { t, i } = decodeCursor(cursor);
        query = query.where((eb) =>
          eb.or([
            eb('entity.created_at', '<', new Date(t)),
            eb.and([
              eb('entity.created_at', '=', new Date(t)),
              eb('entity.did', '<', i),
            ]),
          ]),
        );
      }

      const rows = await query.limit((limit ?? 50) + 1).execute();

      const hasMore = rows.length > (limit ?? 50);
      const items = hasMore ? rows.slice(0, limit ?? 50) : rows;

      const nextCursor =
        hasMore && items.length > 0
          ? encodeCursor(items[items.length - 1].createdAt, items[items.length - 1].did)
          : null;

      res.json({
        cooperatives: items.map((row) => ({
          did: row.did,
          handle: row.handle,
          displayName: row.displayName,
          description: row.publicDescription ? row.description : null,
          cooperativeType: row.cooperativeType,
          memberCount: row.publicMembers ? row.memberCount : null,
          website: row.website,
        })),
        cursor: nextCursor,
      });
    }),
  );

  // GET /api/v1/explore/cooperatives/:handle — single cooperative profile (public)
  router.get(
    '/api/v1/explore/cooperatives/:handle',
    asyncHandler(async (req, res) => {
      const { handle } = req.params;

      const row = await db
        .selectFrom('entity')
        .innerJoin('cooperative_profile', 'cooperative_profile.entity_did', 'entity.did')
        .leftJoin('membership', (join) =>
          join
            .onRef('membership.cooperative_did', '=', 'entity.did')
            .on('membership.status', '=', 'active'),
        )
        .where('entity.type', '=', 'cooperative')
        .where('entity.status', '=', 'active')
        .where('cooperative_profile.is_network', '=', false)
        .where('cooperative_profile.anon_discoverable', '=', true) // V8.1: opt-in public discoverability
        .where('entity.handle', '=', handle)
        .groupBy([
          'entity.did',
          'entity.handle',
          'entity.display_name',
          'entity.description',
          'cooperative_profile.cooperative_type',
          'cooperative_profile.website',
          'cooperative_profile.public_description',
          'cooperative_profile.public_members',
          'cooperative_profile.public_activity',
          'cooperative_profile.public_agreements',
          'cooperative_profile.public_campaigns',
        ])
        .select([
          'entity.did',
          'entity.handle',
          'entity.display_name as displayName',
          'entity.description',
          'cooperative_profile.cooperative_type as cooperativeType',
          'cooperative_profile.website',
          'cooperative_profile.public_description as publicDescription',
          'cooperative_profile.public_members as publicMembers',
          'cooperative_profile.public_activity as publicActivity',
          'cooperative_profile.public_agreements as publicAgreements',
          'cooperative_profile.public_campaigns as publicCampaigns',
          sql<number>`count(membership.id)::int`.as('memberCount'),
        ])
        .executeTakeFirst();

      if (!row) {
        res.status(404).json({
          error: 'NOT_FOUND', message: 'Cooperative not found',
        });
        return;
      }

      // Fetch networks this cooperative belongs to (gated by public_activity)
      let networks: Array<{ did: string; displayName: string }> = [];
      if (row.publicActivity) {
        const networkRows = await db
          .selectFrom('membership')
          .innerJoin('entity', 'entity.did', 'membership.cooperative_did')
          .innerJoin('cooperative_profile', 'cooperative_profile.entity_did', 'entity.did')
          .where('membership.member_did', '=', row.did)
          .where('membership.status', '=', 'active')
          .where('cooperative_profile.is_network', '=', true)
          .where('entity.status', '=', 'active')
          .select(['entity.did', 'entity.display_name as displayName'])
          .execute();

        networks = networkRows.map((n) => ({ did: n.did, displayName: n.displayName }));
      }

      // V8.5 — fetch public-safe proposals/agreements/campaigns in parallel,
      // gated on each section's visibility flag.
      const [proposalRows, agreementRows, campaignRows] = await Promise.all([
        row.publicActivity
          ? container.proposalService.listPublicProposals(row.did, 5)
          : Promise.resolve([]),
        row.publicAgreements
          ? container.agreementService.listPublicAgreements(row.did, 5)
          : Promise.resolve([]),
        row.publicCampaigns
          ? container.fundingService.listPublicCampaigns(row.did, 5)
          : Promise.resolve([]),
      ]);

      const proposals = proposalRows.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        createdAt: p.created_at.toISOString(),
        resolvedAt: p.resolved_at ? p.resolved_at.toISOString() : null,
      }));

      const agreements = agreementRows.map((a) => ({
        uri: a.uri,
        title: a.title,
        status: a.status,
        agreementType: a.agreement_type,
        effectiveDate: a.effective_date ? a.effective_date.toISOString() : null,
        createdAt: a.created_at.toISOString(),
      }));

      const campaigns = campaignRows.map((c) => ({
        uri: c.uri,
        title: c.title,
        status: c.status,
        goalAmount: c.goal_amount,
        goalCurrency: c.goal_currency,
        amountRaised: c.amount_raised,
        endDate: c.end_date ? c.end_date.toISOString() : null,
        createdAt: c.created_at.toISOString(),
      }));

      res.json({
        did: row.did,
        handle: row.handle,
        displayName: row.displayName,
        description: row.publicDescription ? row.description : null,
        cooperativeType: row.cooperativeType,
        memberCount: row.publicMembers ? row.memberCount : null,
        website: row.website,
        networks,
        proposals,
        agreements,
        campaigns,
      });
    }),
  );

  // GET /api/v1/explore/networks — list networks (public)
  router.get(
    '/api/v1/explore/networks',
    asyncHandler(async (req, res) => {
      const { limit, cursor } = parsePagination(req.query as Record<string, unknown>);

      let query = db
        .selectFrom('entity')
        .innerJoin('cooperative_profile', 'cooperative_profile.entity_did', 'entity.did')
        .leftJoin('membership', (join) =>
          join
            .onRef('membership.cooperative_did', '=', 'entity.did')
            .on('membership.status', '=', 'active'),
        )
        .where('entity.type', '=', 'cooperative')
        .where('entity.status', '=', 'active')
        .where('cooperative_profile.is_network', '=', true)
        .where('cooperative_profile.anon_discoverable', '=', true) // V8.1: opt-in public discoverability
        .groupBy([
          'entity.did',
          'entity.handle',
          'entity.display_name',
          'entity.description',
          'entity.created_at',
          'cooperative_profile.cooperative_type',
          'cooperative_profile.membership_policy',
          'cooperative_profile.website',
          'cooperative_profile.public_description',
          'cooperative_profile.public_members',
        ])
        .select([
          'entity.did',
          'entity.handle',
          'entity.display_name as displayName',
          'entity.description',
          'entity.created_at as createdAt',
          'cooperative_profile.cooperative_type as cooperativeType',
          'cooperative_profile.membership_policy as membershipPolicy',
          'cooperative_profile.website',
          'cooperative_profile.public_description as publicDescription',
          'cooperative_profile.public_members as publicMembers',
          sql<number>`count(membership.id)::int`.as('memberCount'),
        ])
        .orderBy('entity.created_at', 'desc')
        .orderBy('entity.did', 'desc');

      if (cursor) {
        const { t, i } = decodeCursor(cursor);
        query = query.where((eb) =>
          eb.or([
            eb('entity.created_at', '<', new Date(t)),
            eb.and([
              eb('entity.created_at', '=', new Date(t)),
              eb('entity.did', '<', i),
            ]),
          ]),
        );
      }

      const rows = await query.limit((limit ?? 50) + 1).execute();

      const hasMore = rows.length > (limit ?? 50);
      const items = hasMore ? rows.slice(0, limit ?? 50) : rows;

      const nextCursor =
        hasMore && items.length > 0
          ? encodeCursor(items[items.length - 1].createdAt, items[items.length - 1].did)
          : null;

      res.json({
        networks: items.map((row) => ({
          did: row.did,
          handle: row.handle,
          displayName: row.displayName,
          description: row.publicDescription ? row.description : null,
          cooperativeType: row.cooperativeType,
          membershipPolicy: row.membershipPolicy,
          memberCount: row.publicMembers ? row.memberCount : null,
          website: row.website,
          createdAt: row.createdAt.toISOString(),
        })),
        cursor: nextCursor,
      });
    }),
  );

  return router;
}
