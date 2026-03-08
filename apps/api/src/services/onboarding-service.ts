import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { IClock } from '@coopsource/federation';
import { NotFoundError, ValidationError } from '@coopsource/common';
import type {
  CreateOnboardingConfigInput,
  UpdateOnboardingConfigInput,
  StartOnboardingInput,
  CreateOnboardingReviewInput,
} from '@coopsource/common';
import type { PageParams, Page } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

export class OnboardingService {
  constructor(
    private db: Kysely<Database>,
    private clock: IClock,
  ) {}

  async createConfig(cooperativeDid: string, data: CreateOnboardingConfigInput) {
    const now = this.clock.now();
    const [row] = await this.db
      .insertInto('onboarding_config')
      .values({
        cooperative_did: cooperativeDid,
        probation_duration_days: data.probationDurationDays,
        require_training: data.requireTraining,
        require_buy_in: data.requireBuyIn,
        buy_in_amount: data.buyInAmount,
        buddy_system_enabled: data.buddySystemEnabled,
        milestones: JSON.stringify(data.milestones),
        created_at: now,
        updated_at: now,
      })
      .returningAll()
      .execute();
    return row!;
  }

  async getConfig(cooperativeDid: string) {
    return this.db
      .selectFrom('onboarding_config')
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .executeTakeFirst();
  }

  async updateConfig(cooperativeDid: string, data: UpdateOnboardingConfigInput) {
    const existing = await this.getConfig(cooperativeDid);
    if (!existing) throw new NotFoundError('Onboarding config not found');

    const now = this.clock.now();
    const updates: Record<string, unknown> = { updated_at: now };
    if (data.probationDurationDays !== undefined)
      updates.probation_duration_days = data.probationDurationDays;
    if (data.requireTraining !== undefined)
      updates.require_training = data.requireTraining;
    if (data.requireBuyIn !== undefined)
      updates.require_buy_in = data.requireBuyIn;
    if (data.buyInAmount !== undefined) updates.buy_in_amount = data.buyInAmount;
    if (data.buddySystemEnabled !== undefined)
      updates.buddy_system_enabled = data.buddySystemEnabled;
    if (data.milestones !== undefined)
      updates.milestones = JSON.stringify(data.milestones);

    const [row] = await this.db
      .updateTable('onboarding_config')
      .set(updates)
      .where('cooperative_did', '=', cooperativeDid)
      .returningAll()
      .execute();
    return row!;
  }

  async startOnboarding(cooperativeDid: string, data: StartOnboardingInput) {
    const config = await this.getConfig(cooperativeDid);
    if (!config) {
      throw new ValidationError(
        'Onboarding config must be created before starting onboarding',
      );
    }

    const now = this.clock.now();
    const probationEnds = new Date(now.getTime());
    probationEnds.setDate(
      probationEnds.getDate() + config.probation_duration_days,
    );

    const [row] = await this.db
      .insertInto('onboarding_progress')
      .values({
        cooperative_did: cooperativeDid,
        member_did: data.memberDid,
        status: 'in_progress',
        probation_starts_at: now,
        probation_ends_at: probationEnds,
        buddy_did: data.buddyDid ?? null,
        created_at: now,
        updated_at: now,
      })
      .returningAll()
      .execute();
    return row!;
  }

  async getProgress(cooperativeDid: string, memberDid: string) {
    return this.db
      .selectFrom('onboarding_progress')
      .where('cooperative_did', '=', cooperativeDid)
      .where('member_did', '=', memberDid)
      .selectAll()
      .executeTakeFirst();
  }

  async listProgress(
    cooperativeDid: string,
    params: PageParams & { status?: string },
  ): Promise<Page<Record<string, unknown>>> {
    const limit = params.limit ?? 50;
    let query = this.db
      .selectFrom('onboarding_progress')
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
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
            eb('id', '<', i),
          ]),
        ]),
      );
    }

    const rows = await query.execute();
    const slice = rows.slice(0, limit);
    const cursor =
      rows.length > limit
        ? encodeCursor(
            slice[slice.length - 1]!.created_at as Date,
            slice[slice.length - 1]!.id as string,
          )
        : undefined;

    return { items: slice as Record<string, unknown>[], cursor };
  }

  async completeTraining(cooperativeDid: string, memberDid: string) {
    const progress = await this.getProgress(cooperativeDid, memberDid);
    if (!progress) throw new NotFoundError('Onboarding progress not found');
    if (progress.status !== 'in_progress') {
      throw new ValidationError('Onboarding is not in progress');
    }

    const now = this.clock.now();
    await this.db
      .updateTable('onboarding_progress')
      .set({
        training_completed: true,
        training_completed_at: now,
        updated_at: now,
      })
      .where('cooperative_did', '=', cooperativeDid)
      .where('member_did', '=', memberDid)
      .execute();

    await this.checkAutoCompletion(cooperativeDid, memberDid);
    // Re-read after potential auto-completion to return fresh state
    return (await this.getProgress(cooperativeDid, memberDid))!;
  }

  async completeBuyIn(cooperativeDid: string, memberDid: string) {
    const progress = await this.getProgress(cooperativeDid, memberDid);
    if (!progress) throw new NotFoundError('Onboarding progress not found');
    if (progress.status !== 'in_progress') {
      throw new ValidationError('Onboarding is not in progress');
    }

    const now = this.clock.now();
    await this.db
      .updateTable('onboarding_progress')
      .set({
        buy_in_completed: true,
        buy_in_completed_at: now,
        updated_at: now,
      })
      .where('cooperative_did', '=', cooperativeDid)
      .where('member_did', '=', memberDid)
      .execute();

    await this.checkAutoCompletion(cooperativeDid, memberDid);
    return (await this.getProgress(cooperativeDid, memberDid))!;
  }

  async completeMilestone(
    cooperativeDid: string,
    memberDid: string,
    milestoneName: string,
  ) {
    const config = await this.getConfig(cooperativeDid);
    if (!config) throw new NotFoundError('Onboarding config not found');

    const milestones = config.milestones as Array<{ name: string }>;
    const milestoneExists = milestones.some((m) => m.name === milestoneName);
    if (!milestoneExists) {
      throw new ValidationError(`Milestone "${milestoneName}" not found in config`);
    }

    const progress = await this.getProgress(cooperativeDid, memberDid);
    if (!progress) throw new NotFoundError('Onboarding progress not found');
    if (progress.status !== 'in_progress') {
      throw new ValidationError('Onboarding is not in progress');
    }

    const completed = (progress.milestones_completed as string[]) ?? [];
    if (completed.includes(milestoneName)) {
      throw new ValidationError(`Milestone "${milestoneName}" already completed`);
    }

    const now = this.clock.now();
    await this.db
      .updateTable('onboarding_progress')
      .set({
        milestones_completed: JSON.stringify([...completed, milestoneName]),
        updated_at: now,
      })
      .where('cooperative_did', '=', cooperativeDid)
      .where('member_did', '=', memberDid)
      .execute();

    await this.checkAutoCompletion(cooperativeDid, memberDid);
    return (await this.getProgress(cooperativeDid, memberDid))!;
  }

  async assignBuddy(
    cooperativeDid: string,
    memberDid: string,
    buddyDid: string,
  ) {
    const progress = await this.getProgress(cooperativeDid, memberDid);
    if (!progress) throw new NotFoundError('Onboarding progress not found');

    const now = this.clock.now();
    const [row] = await this.db
      .updateTable('onboarding_progress')
      .set({ buddy_did: buddyDid, updated_at: now })
      .where('cooperative_did', '=', cooperativeDid)
      .where('member_did', '=', memberDid)
      .returningAll()
      .execute();
    return row!;
  }

  async createReview(
    cooperativeDid: string,
    reviewerDid: string,
    data: CreateOnboardingReviewInput,
  ) {
    const progress = await this.getProgress(cooperativeDid, data.memberDid);
    if (!progress) throw new NotFoundError('Onboarding progress not found');

    const [row] = await this.db
      .insertInto('onboarding_review')
      .values({
        cooperative_did: cooperativeDid,
        member_did: data.memberDid,
        reviewer_did: reviewerDid,
        review_type: data.reviewType,
        outcome: data.outcome,
        comments: data.comments ?? null,
        milestone_name: data.milestoneName ?? null,
        created_at: this.clock.now(),
      })
      .returningAll()
      .execute();
    return row!;
  }

  async listReviews(cooperativeDid: string, memberDid: string) {
    return this.db
      .selectFrom('onboarding_review')
      .where('cooperative_did', '=', cooperativeDid)
      .where('member_did', '=', memberDid)
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();
  }

  async completeOnboarding(cooperativeDid: string, memberDid: string) {
    const config = await this.getConfig(cooperativeDid);
    if (!config) throw new NotFoundError('Onboarding config not found');

    const progress = await this.getProgress(cooperativeDid, memberDid);
    if (!progress) throw new NotFoundError('Onboarding progress not found');
    if (progress.status !== 'in_progress') {
      throw new ValidationError('Onboarding is not in progress');
    }

    // Verify all requirements are met
    if (config.require_training && !progress.training_completed) {
      throw new ValidationError('Training must be completed before finishing onboarding');
    }
    if (config.require_buy_in && !progress.buy_in_completed) {
      throw new ValidationError('Buy-in must be completed before finishing onboarding');
    }

    const milestones = config.milestones as Array<{ name: string }>;
    if (milestones.length > 0) {
      const completed = (progress.milestones_completed as string[]) ?? [];
      const missing = milestones.filter((m) => !completed.includes(m.name));
      if (missing.length > 0) {
        throw new ValidationError(
          `Milestones not completed: ${missing.map((m) => m.name).join(', ')}`,
        );
      }
    }

    const now = this.clock.now();

    // Atomically mark onboarding completed + transition membership
    const row = await this.db.transaction().execute(async (trx) => {
      const [progressRow] = await trx
        .updateTable('onboarding_progress')
        .set({
          status: 'completed',
          completed_at: now,
          updated_at: now,
        })
        .where('cooperative_did', '=', cooperativeDid)
        .where('member_did', '=', memberDid)
        .returningAll()
        .execute();

      // Transition membership to 'active' if currently probationary
      await trx
        .updateTable('membership')
        .set({ status: 'active', indexed_at: now })
        .where('cooperative_did', '=', cooperativeDid)
        .where('member_did', '=', memberDid)
        .where('status', '=', 'probationary')
        .execute();

      return progressRow!;
    });

    return row;
  }

  async checkAutoCompletion(cooperativeDid: string, memberDid: string) {
    const config = await this.getConfig(cooperativeDid);
    if (!config) return;

    const progress = await this.getProgress(cooperativeDid, memberDid);
    if (!progress || progress.status !== 'in_progress') return;

    // Check training requirement
    if (config.require_training && !progress.training_completed) return;
    // Check buy-in requirement
    if (config.require_buy_in && !progress.buy_in_completed) return;

    // Check milestones
    const milestones = config.milestones as Array<{ name: string }>;
    if (milestones.length > 0) {
      const completed = (progress.milestones_completed as string[]) ?? [];
      const allDone = milestones.every((m) => completed.includes(m.name));
      if (!allDone) return;
    }

    // All requirements met — auto-complete
    await this.completeOnboarding(cooperativeDid, memberDid);
  }
}
