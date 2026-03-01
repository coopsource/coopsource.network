import type { Kysely, Selectable } from 'kysely';
import type {
  Database,
  StakeholderInterestTable,
  DesiredOutcomeTable,
  InterestMapTable,
} from '@coopsource/db';
import type { DID } from '@coopsource/common';
import {
  NotFoundError,
  ValidationError,
} from '@coopsource/common';
import type {
  CreateInterestInput,
  UpdateInterestInput,
  CreateOutcomeInput,
} from '@coopsource/common';
import type { IPdsService, IFederationClient, IClock } from '@coopsource/federation';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';
import { emitAppEvent } from '../appview/sse.js';

type InterestRow = Selectable<StakeholderInterestTable>;
type OutcomeRow = Selectable<DesiredOutcomeTable>;
type MapRow = Selectable<InterestMapTable>;

export class AlignmentService {
  constructor(
    private db: Kysely<Database>,
    private pdsService: IPdsService,
    private federationClient: IFederationClient,
    private clock: IClock,
  ) {}

  // ─── Interests ──────────────────────────────────────────────────────────

  async submitInterests(
    did: string,
    cooperativeDid: string,
    data: CreateInterestInput,
  ): Promise<InterestRow> {
    const now = this.clock.now();

    // Check if already submitted
    const existing = await this.db
      .selectFrom('stakeholder_interest')
      .where('did', '=', did)
      .where('project_uri', '=', cooperativeDid)
      .selectAll()
      .executeTakeFirst();

    if (existing) {
      throw new ValidationError('Interests already submitted. Use update instead.');
    }

    const ref = await this.pdsService.createRecord({
      did: did as DID,
      collection: 'network.coopsource.alignment.interest',
      record: {
        projectUri: cooperativeDid,
        interests: data.interests,
        contributions: data.contributions ?? [],
        constraints: data.constraints ?? [],
        redLines: data.redLines ?? [],
        preferences: data.preferences ?? {},
        createdAt: now.toISOString(),
      },
    });

    const rkey = ref.uri.split('/').pop()!;
    const [row] = await this.db
      .insertInto('stakeholder_interest')
      .values({
        uri: ref.uri,
        did,
        rkey,
        project_uri: cooperativeDid,
        interests: JSON.stringify(data.interests),
        contributions: JSON.stringify(data.contributions ?? []),
        constraints: JSON.stringify(data.constraints ?? []),
        red_lines: JSON.stringify(data.redLines ?? []),
        preferences: JSON.stringify(data.preferences ?? {}),
        created_at: now,
        updated_at: now,
        indexed_at: now,
      })
      .returningAll()
      .execute();

    emitAppEvent({
      type: 'alignment.interest.submitted',
      data: { did, uri: row!.uri },
      cooperativeDid,
    });

    await this.federationClient.notifyHub({
      type: 'alignment.interest.submitted',
      sourceDid: cooperativeDid,
      data: { uri: row!.uri },
      timestamp: now.toISOString(),
    });

    return row!;
  }

  async getInterests(cooperativeDid: string): Promise<InterestRow[]> {
    return this.db
      .selectFrom('stakeholder_interest')
      .where('project_uri', '=', cooperativeDid)
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();
  }

  async getMyInterests(
    did: string,
    cooperativeDid: string,
  ): Promise<InterestRow | null> {
    const row = await this.db
      .selectFrom('stakeholder_interest')
      .where('did', '=', did)
      .where('project_uri', '=', cooperativeDid)
      .selectAll()
      .executeTakeFirst();

    return row ?? null;
  }

  async updateInterests(
    did: string,
    cooperativeDid: string,
    data: UpdateInterestInput,
  ): Promise<InterestRow> {
    const existing = await this.db
      .selectFrom('stakeholder_interest')
      .where('did', '=', did)
      .where('project_uri', '=', cooperativeDid)
      .selectAll()
      .executeTakeFirst();

    if (!existing) {
      throw new NotFoundError('No interests found to update');
    }

    const now = this.clock.now();

    // Update PDS record
    await this.pdsService.putRecord({
      did: did as DID,
      collection: 'network.coopsource.alignment.interest',
      rkey: existing.rkey,
      record: {
        projectUri: cooperativeDid,
        interests: data.interests ?? existing.interests,
        contributions: data.contributions ?? existing.contributions,
        constraints: data.constraints ?? existing.constraints,
        redLines: data.redLines ?? existing.red_lines,
        preferences: data.preferences ?? existing.preferences,
        createdAt: existing.created_at.toISOString(),
        updatedAt: now.toISOString(),
      },
    });

    const updates: Record<string, unknown> = {
      updated_at: now,
      indexed_at: now,
    };
    if (data.interests !== undefined) updates.interests = JSON.stringify(data.interests);
    if (data.contributions !== undefined) updates.contributions = JSON.stringify(data.contributions);
    if (data.constraints !== undefined) updates.constraints = JSON.stringify(data.constraints);
    if (data.redLines !== undefined) updates.red_lines = JSON.stringify(data.redLines);
    if (data.preferences !== undefined) updates.preferences = JSON.stringify(data.preferences);

    const [row] = await this.db
      .updateTable('stakeholder_interest')
      .set(updates)
      .where('uri', '=', existing.uri)
      .returningAll()
      .execute();

    emitAppEvent({
      type: 'alignment.interest.updated',
      data: { did, uri: row!.uri },
      cooperativeDid,
    });

    return row!;
  }

  // ─── Outcomes ───────────────────────────────────────────────────────────

  async createOutcome(
    did: string,
    cooperativeDid: string,
    data: CreateOutcomeInput,
  ): Promise<OutcomeRow> {
    const now = this.clock.now();

    const ref = await this.pdsService.createRecord({
      did: did as DID,
      collection: 'network.coopsource.alignment.outcome',
      record: {
        projectUri: cooperativeDid,
        title: data.title,
        description: data.description ?? '',
        category: data.category,
        successCriteria: data.successCriteria ?? [],
        stakeholderSupport: [],
        status: 'proposed',
        createdAt: now.toISOString(),
      },
    });

    const rkey = ref.uri.split('/').pop()!;
    const [row] = await this.db
      .insertInto('desired_outcome')
      .values({
        uri: ref.uri,
        did,
        rkey,
        project_uri: cooperativeDid,
        title: data.title,
        description: data.description ?? null,
        category: data.category,
        success_criteria: JSON.stringify(data.successCriteria ?? []),
        stakeholder_support: JSON.stringify([]),
        status: 'proposed',
        created_at: now,
        indexed_at: now,
      })
      .returningAll()
      .execute();

    emitAppEvent({
      type: 'alignment.outcome.created',
      data: { did, uri: row!.uri, title: data.title },
      cooperativeDid,
    });

    await this.federationClient.notifyHub({
      type: 'alignment.outcome.created',
      sourceDid: cooperativeDid,
      data: { uri: row!.uri },
      timestamp: now.toISOString(),
    });

    return row!;
  }

  async listOutcomes(
    cooperativeDid: string,
    params: PageParams & { status?: string },
  ): Promise<Page<OutcomeRow>> {
    const limit = params.limit ?? 50;
    let query = this.db
      .selectFrom('desired_outcome')
      .where('project_uri', '=', cooperativeDid)
      .selectAll()
      .orderBy('created_at', 'desc')
      .orderBy('uri', 'desc')
      .limit(limit + 1);

    if (params.status) {
      query = query.where('status', '=', params.status);
    }

    if (params.cursor) {
      const { t, i } = decodeCursor(params.cursor);
      query = query.where((eb) =>
        eb.or([
          eb('created_at', '<', new Date(t)),
          eb.and([
            eb('created_at', '=', new Date(t)),
            eb('uri', '<', i),
          ]),
        ]),
      );
    }

    const rows = await query.execute();
    const slice = rows.slice(0, limit);
    const cursor =
      rows.length > limit
        ? encodeCursor(
            slice[slice.length - 1]!.created_at,
            slice[slice.length - 1]!.uri,
          )
        : undefined;

    return { items: slice, cursor };
  }

  async getOutcome(uri: string): Promise<OutcomeRow> {
    const row = await this.db
      .selectFrom('desired_outcome')
      .where('uri', '=', uri)
      .selectAll()
      .executeTakeFirst();

    if (!row) throw new NotFoundError('Outcome not found');
    return row;
  }

  async supportOutcome(
    did: string,
    outcomeUri: string,
    level: string,
    conditions?: string,
  ): Promise<OutcomeRow> {
    const outcome = await this.getOutcome(outcomeUri);
    const now = this.clock.now();

    const support = outcome.stakeholder_support as unknown[];
    const existing = support as Array<{
      stakeholderDid: string;
      supportLevel: string;
      conditions?: string;
    }>;

    // Replace or add support entry
    const filtered = existing.filter((s) => s.stakeholderDid !== did);
    filtered.push({
      stakeholderDid: did,
      supportLevel: level,
      ...(conditions ? { conditions } : {}),
    });

    const [row] = await this.db
      .updateTable('desired_outcome')
      .set({
        stakeholder_support: JSON.stringify(filtered),
        indexed_at: now,
      })
      .where('uri', '=', outcomeUri)
      .returningAll()
      .execute();

    emitAppEvent({
      type: 'alignment.outcome.supported',
      data: { did, outcomeUri, level },
      cooperativeDid: outcome.project_uri,
    });

    await this.federationClient.notifyHub({
      type: 'alignment.outcome.supported',
      sourceDid: outcome.project_uri,
      data: { uri: outcomeUri },
      timestamp: now.toISOString(),
    });

    return row!;
  }

  async updateOutcomeStatus(
    outcomeUri: string,
    actorDid: string,
    newStatus: string,
  ): Promise<OutcomeRow> {
    const outcome = await this.getOutcome(outcomeUri);

    // Validate status transitions
    const allowed: Record<string, string[]> = {
      proposed: ['endorsed', 'abandoned'],
      endorsed: ['active', 'abandoned'],
      active: ['achieved', 'abandoned'],
    };

    const validTransitions = allowed[outcome.status] ?? [];
    if (!validTransitions.includes(newStatus)) {
      throw new ValidationError(
        `Cannot transition from '${outcome.status}' to '${newStatus}'`,
      );
    }

    const now = this.clock.now();
    const [row] = await this.db
      .updateTable('desired_outcome')
      .set({ status: newStatus, indexed_at: now })
      .where('uri', '=', outcomeUri)
      .returningAll()
      .execute();

    return row!;
  }

  // ─── Interest Map ───────────────────────────────────────────────────────

  async generateMap(
    cooperativeDid: string,
    actorDid: string,
  ): Promise<MapRow> {
    const now = this.clock.now();

    // Aggregate all interests for this cooperative
    const allInterests = await this.getInterests(cooperativeDid);

    // Compute alignment zones: find shared interest categories
    const alignmentZones = this.computeAlignmentZones(allInterests);

    // Compute conflict zones: find red line / constraint conflicts
    const conflictZones = this.computeConflictZones(allInterests);

    // Create PDS record first (before deleting anything) to avoid data loss on crash
    const ref = await this.pdsService.createRecord({
      did: actorDid as DID,
      collection: 'network.coopsource.alignment.interestMap',
      record: {
        projectUri: cooperativeDid,
        alignmentZones,
        conflictZones,
        createdAt: now.toISOString(),
      },
    });

    const rkey = ref.uri.split('/').pop()!;

    // Wrap delete + insert in a transaction to prevent data loss
    const row = await this.db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom('interest_map')
        .where('project_uri', '=', cooperativeDid)
        .execute();

      const [inserted] = await trx
        .insertInto('interest_map')
        .values({
          uri: ref.uri,
          did: cooperativeDid,
          rkey,
          project_uri: cooperativeDid,
          alignment_zones: JSON.stringify(alignmentZones),
          conflict_zones: JSON.stringify(conflictZones),
          ai_analysis: null,
          created_at: now,
          indexed_at: now,
        })
        .returningAll()
        .execute();

      return inserted!;
    });

    await this.federationClient.notifyHub({
      type: 'alignment.map.generated',
      sourceDid: cooperativeDid,
      data: { uri: row.uri },
      timestamp: now.toISOString(),
    });

    return row;
  }

  async getMap(cooperativeDid: string): Promise<MapRow | null> {
    const row = await this.db
      .selectFrom('interest_map')
      .where('project_uri', '=', cooperativeDid)
      .selectAll()
      .orderBy('created_at', 'desc')
      .executeTakeFirst();

    return row ?? null;
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  private computeAlignmentZones(
    allInterests: InterestRow[],
  ): Array<{
    participants: string[];
    description: string;
    strength: number;
    interestsInvolved: string[];
  }> {
    if (allInterests.length < 2) return [];

    // Group interests by category across stakeholders
    const categoryMap = new Map<string, { dids: Set<string>; descriptions: string[] }>();

    for (const si of allInterests) {
      const interests = si.interests as Array<{
        category: string;
        description: string;
        priority: number;
      }>;

      for (const interest of interests) {
        const key = interest.category.toLowerCase();
        if (!categoryMap.has(key)) {
          categoryMap.set(key, { dids: new Set(), descriptions: [] });
        }
        const entry = categoryMap.get(key)!;
        entry.dids.add(si.did);
        entry.descriptions.push(interest.description);
      }
    }

    // Alignment zones are categories shared by 2+ stakeholders
    const zones: Array<{
      participants: string[];
      description: string;
      strength: number;
      interestsInvolved: string[];
    }> = [];

    for (const [category, { dids, descriptions }] of categoryMap) {
      if (dids.size >= 2) {
        zones.push({
          participants: [...dids],
          description: `Shared interest in "${category}"`,
          strength: Math.round((dids.size / allInterests.length) * 100),
          interestsInvolved: descriptions.slice(0, 5),
        });
      }
    }

    return zones;
  }

  private computeConflictZones(
    allInterests: InterestRow[],
  ): Array<{
    stakeholders: string[];
    description: string;
    severity: string;
    potentialSolutions: string[];
  }> {
    if (allInterests.length < 2) return [];

    const conflicts: Array<{
      stakeholders: string[];
      description: string;
      severity: string;
      potentialSolutions: string[];
    }> = [];

    // Compare red lines of each stakeholder against interests of others
    for (let i = 0; i < allInterests.length; i++) {
      const siA = allInterests[i]!;
      const redLinesA = siA.red_lines as Array<{
        description: string;
        reason?: string;
      }>;

      for (let j = i + 1; j < allInterests.length; j++) {
        const siB = allInterests[j]!;
        const interestsB = siB.interests as Array<{
          category: string;
          description: string;
        }>;

        // Simple heuristic: if any red line description contains keywords
        // that overlap with another stakeholder's interest descriptions
        for (const redLine of redLinesA) {
          const rlWords = new Set(
            redLine.description.toLowerCase().split(/\s+/).filter((w) => w.length > 3),
          );

          for (const interest of interestsB) {
            const intWords = interest.description
              .toLowerCase()
              .split(/\s+/)
              .filter((w) => w.length > 3);
            const overlap = intWords.filter((w) => rlWords.has(w));

            if (overlap.length >= 2) {
              conflicts.push({
                stakeholders: [siA.did, siB.did],
                description: `Potential conflict: "${redLine.description}" vs interest "${interest.description}"`,
                severity: 'medium',
                potentialSolutions: [
                  'Facilitate a discussion between stakeholders',
                  'Consider compromise options',
                ],
              });
            }
          }
        }
      }
    }

    return conflicts;
  }
}
