import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { IClock } from '@coopsource/federation';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
} from '@coopsource/common';

export class MemberClassService {
  constructor(
    private db: Kysely<Database>,
    private clock: IClock,
  ) {}

  async createClass(
    cooperativeDid: string,
    data: {
      name: string;
      description?: string;
      voteWeight?: number;
      quorumWeight?: number;
      boardSeats?: number;
    },
  ) {
    // Check uniqueness
    const existing = await this.db
      .selectFrom('member_class')
      .where('cooperative_did', '=', cooperativeDid)
      .where('name', '=', data.name)
      .select('id')
      .executeTakeFirst();

    if (existing) {
      throw new ConflictError(`Member class '${data.name}' already exists`);
    }

    const now = this.clock.now();
    const [row] = await this.db
      .insertInto('member_class')
      .values({
        cooperative_did: cooperativeDid,
        name: data.name,
        description: data.description ?? null,
        vote_weight: data.voteWeight ?? 1,
        quorum_weight: data.quorumWeight ?? 1,
        board_seats: data.boardSeats ?? 0,
        created_at: now,
        updated_at: now,
      })
      .returningAll()
      .execute();

    return row!;
  }

  async updateClass(
    cooperativeDid: string,
    classId: string,
    data: {
      name?: string;
      description?: string;
      voteWeight?: number;
      quorumWeight?: number;
      boardSeats?: number;
    },
  ) {
    const existing = await this.db
      .selectFrom('member_class')
      .where('id', '=', classId)
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .executeTakeFirst();

    if (!existing) {
      throw new NotFoundError('Member class not found');
    }

    // If renaming, check uniqueness
    if (data.name && data.name !== existing.name) {
      const dup = await this.db
        .selectFrom('member_class')
        .where('cooperative_did', '=', cooperativeDid)
        .where('name', '=', data.name)
        .select('id')
        .executeTakeFirst();

      if (dup) {
        throw new ConflictError(`Member class '${data.name}' already exists`);
      }
    }

    const now = this.clock.now();
    const [updated] = await this.db
      .updateTable('member_class')
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.voteWeight !== undefined ? { vote_weight: data.voteWeight } : {}),
        ...(data.quorumWeight !== undefined ? { quorum_weight: data.quorumWeight } : {}),
        ...(data.boardSeats !== undefined ? { board_seats: data.boardSeats } : {}),
        updated_at: now,
      })
      .where('id', '=', classId)
      .where('cooperative_did', '=', cooperativeDid)
      .returningAll()
      .execute();

    return updated!;
  }

  async deleteClass(cooperativeDid: string, classId: string) {
    const existing = await this.db
      .selectFrom('member_class')
      .where('id', '=', classId)
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .executeTakeFirst();

    if (!existing) {
      throw new NotFoundError('Member class not found');
    }

    // Block if members are assigned to this class
    const assignedCount = await this.db
      .selectFrom('membership')
      .where('cooperative_did', '=', cooperativeDid)
      .where('member_class', '=', existing.name)
      .where('status', '=', 'active')
      .where('invalidated_at', 'is', null)
      .select((eb) => [eb.fn.countAll<number>().as('count')])
      .executeTakeFirst();

    if (assignedCount && assignedCount.count > 0) {
      throw new ValidationError(
        'Cannot delete member class with assigned members. Remove members from this class first.',
      );
    }

    await this.db
      .deleteFrom('member_class')
      .where('id', '=', classId)
      .where('cooperative_did', '=', cooperativeDid)
      .execute();
  }

  async listClasses(cooperativeDid: string) {
    return this.db
      .selectFrom('member_class')
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .orderBy('name', 'asc')
      .execute();
  }

  async getClass(cooperativeDid: string, classId: string) {
    const row = await this.db
      .selectFrom('member_class')
      .where('id', '=', classId)
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .executeTakeFirst();

    if (!row) throw new NotFoundError('Member class not found');
    return row;
  }

  async assignMemberClass(
    cooperativeDid: string,
    memberDid: string,
    className: string,
  ) {
    // Validate class exists
    const memberClass = await this.db
      .selectFrom('member_class')
      .where('cooperative_did', '=', cooperativeDid)
      .where('name', '=', className)
      .select('id')
      .executeTakeFirst();

    if (!memberClass) {
      throw new NotFoundError(`Member class '${className}' not found`);
    }

    // Validate membership exists
    const membership = await this.db
      .selectFrom('membership')
      .where('cooperative_did', '=', cooperativeDid)
      .where('member_did', '=', memberDid)
      .where('status', '=', 'active')
      .where('invalidated_at', 'is', null)
      .select('id')
      .executeTakeFirst();

    if (!membership) {
      throw new NotFoundError('Active membership not found');
    }

    const [updated] = await this.db
      .updateTable('membership')
      .set({ member_class: className })
      .where('id', '=', membership.id)
      .returningAll()
      .execute();

    return updated!;
  }

  async removeMemberClass(cooperativeDid: string, memberDid: string) {
    const membership = await this.db
      .selectFrom('membership')
      .where('cooperative_did', '=', cooperativeDid)
      .where('member_did', '=', memberDid)
      .where('status', '=', 'active')
      .where('invalidated_at', 'is', null)
      .select('id')
      .executeTakeFirst();

    if (!membership) {
      throw new NotFoundError('Active membership not found');
    }

    const [updated] = await this.db
      .updateTable('membership')
      .set({ member_class: null })
      .where('id', '=', membership.id)
      .returningAll()
      .execute();

    return updated!;
  }

  async getMemberVoteWeight(
    cooperativeDid: string,
    memberDid: string,
  ): Promise<number> {
    const result = await this.db
      .selectFrom('membership')
      .leftJoin('member_class', (j) =>
        j
          .onRef('member_class.name', '=', 'membership.member_class')
          .onRef(
            'member_class.cooperative_did',
            '=',
            'membership.cooperative_did',
          ),
      )
      .where('membership.cooperative_did', '=', cooperativeDid)
      .where('membership.member_did', '=', memberDid)
      .where('membership.status', '=', 'active')
      .where('membership.invalidated_at', 'is', null)
      .select('member_class.vote_weight')
      .executeTakeFirst();

    return result?.vote_weight ?? 1;
  }
}
