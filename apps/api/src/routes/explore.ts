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
        .groupBy([
          'entity.did',
          'entity.handle',
          'entity.display_name',
          'entity.description',
          'entity.created_at',
          'cooperative_profile.cooperative_type',
          'cooperative_profile.website',
        ])
        .select([
          'entity.did',
          'entity.handle',
          'entity.display_name as displayName',
          'entity.description',
          'entity.created_at as createdAt',
          'cooperative_profile.cooperative_type as cooperativeType',
          'cooperative_profile.website',
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
          description: row.description,
          cooperativeType: row.cooperativeType,
          memberCount: row.memberCount,
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
        .where('entity.handle', '=', handle)
        .groupBy([
          'entity.did',
          'entity.handle',
          'entity.display_name',
          'entity.description',
          'cooperative_profile.cooperative_type',
          'cooperative_profile.website',
        ])
        .select([
          'entity.did',
          'entity.handle',
          'entity.display_name as displayName',
          'entity.description',
          'cooperative_profile.cooperative_type as cooperativeType',
          'cooperative_profile.website',
          sql<number>`count(membership.id)::int`.as('memberCount'),
        ])
        .executeTakeFirst();

      if (!row) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Cooperative not found' },
        });
        return;
      }

      // Fetch networks this cooperative belongs to
      const networks = await db
        .selectFrom('membership')
        .innerJoin('entity', 'entity.did', 'membership.cooperative_did')
        .innerJoin('cooperative_profile', 'cooperative_profile.entity_did', 'entity.did')
        .where('membership.member_did', '=', row.did)
        .where('membership.status', '=', 'active')
        .where('cooperative_profile.is_network', '=', true)
        .where('entity.status', '=', 'active')
        .select(['entity.did', 'entity.display_name as displayName'])
        .execute();

      res.json({
        did: row.did,
        handle: row.handle,
        displayName: row.displayName,
        description: row.description,
        cooperativeType: row.cooperativeType,
        memberCount: row.memberCount,
        website: row.website,
        networks: networks.map((n) => ({ did: n.did, displayName: n.displayName })),
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
        .groupBy([
          'entity.did',
          'entity.handle',
          'entity.display_name',
          'entity.description',
          'entity.created_at',
          'cooperative_profile.cooperative_type',
          'cooperative_profile.membership_policy',
          'cooperative_profile.website',
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
          description: row.description,
          cooperativeType: row.cooperativeType,
          membershipPolicy: row.membershipPolicy,
          memberCount: row.memberCount,
          website: row.website,
          createdAt: row.createdAt.toISOString(),
        })),
        cursor: nextCursor,
      });
    }),
  );

  return router;
}
