import type { Kysely, Selectable } from 'kysely';
import type {
  Database,
  FundingCampaignTable,
  FundingPledgeTable,
} from '@coopsource/db';
import type { DID } from '@coopsource/common';
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@coopsource/common';
import type { CreateCampaignInput, UpdateCampaignInput, CreatePledgeInput } from '@coopsource/common';
import type { IPdsService, IClock } from '@coopsource/federation';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

type CampaignRow = Selectable<FundingCampaignTable>;
type PledgeRow = Selectable<FundingPledgeTable>;

export class FundingService {
  constructor(
    private db: Kysely<Database>,
    private pdsService: IPdsService,
    private clock: IClock,
  ) {}

  // ─── Campaigns ─────────────────────────────────────────────────────────

  async createCampaign(
    authorDid: string,
    cooperativeDid: string,
    data: CreateCampaignInput,
  ): Promise<CampaignRow> {
    const now = this.clock.now();

    const ref = await this.pdsService.createRecord({
      did: authorDid as DID,
      collection: 'network.coopsource.funding.campaign',
      record: {
        beneficiaryUri: data.beneficiaryUri,
        title: data.title,
        description: data.description,
        tier: data.tier,
        campaignType: data.campaignType,
        goalAmount: data.goalAmount,
        goalCurrency: data.goalCurrency,
        fundingModel: data.fundingModel,
        status: 'draft',
        createdAt: now.toISOString(),
      },
    });

    const rkey = ref.uri.split('/').pop()!;
    const [row] = await this.db
      .insertInto('funding_campaign')
      .values({
        uri: ref.uri,
        did: cooperativeDid,
        rkey,
        beneficiary_uri: data.beneficiaryUri,
        title: data.title,
        description: data.description ?? null,
        tier: data.tier,
        campaign_type: data.campaignType,
        goal_amount: data.goalAmount,
        goal_currency: data.goalCurrency,
        amount_raised: 0,
        backer_count: 0,
        funding_model: data.fundingModel,
        status: 'draft',
        start_date: data.startDate ? new Date(data.startDate) : null,
        end_date: data.endDate ? new Date(data.endDate) : null,
        metadata: data.metadata ?? null,
        created_at: now,
        indexed_at: now,
      })
      .returningAll()
      .execute();

    return row!;
  }

  async getCampaign(uri: string): Promise<CampaignRow> {
    const row = await this.db
      .selectFrom('funding_campaign')
      .where('uri', '=', uri)
      .selectAll()
      .executeTakeFirst();

    if (!row) throw new NotFoundError('Campaign not found');
    return row;
  }

  async listCampaigns(
    cooperativeDid: string,
    params: PageParams & { status?: string },
  ): Promise<Page<CampaignRow>> {
    const limit = params.limit ?? 50;
    let query = this.db
      .selectFrom('funding_campaign')
      .where('did', '=', cooperativeDid)
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

  async updateCampaign(
    uri: string,
    actorDid: string,
    data: UpdateCampaignInput,
  ): Promise<CampaignRow> {
    const campaign = await this.getCampaign(uri);
    if (campaign.status !== 'draft') {
      throw new ValidationError('Can only update draft campaigns');
    }

    const now = this.clock.now();
    const updates: Record<string, unknown> = { indexed_at: now };
    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) updates.description = data.description;
    if (data.goalAmount !== undefined) updates.goal_amount = data.goalAmount;
    if (data.goalCurrency !== undefined) updates.goal_currency = data.goalCurrency;
    if (data.fundingModel !== undefined) updates.funding_model = data.fundingModel;
    if (data.startDate !== undefined) updates.start_date = data.startDate ? new Date(data.startDate) : null;
    if (data.endDate !== undefined) updates.end_date = data.endDate ? new Date(data.endDate) : null;
    if (data.metadata !== undefined) updates.metadata = data.metadata;

    const [row] = await this.db
      .updateTable('funding_campaign')
      .set(updates)
      .where('uri', '=', uri)
      .returningAll()
      .execute();

    return row!;
  }

  async updateCampaignStatus(
    uri: string,
    actorDid: string,
    newStatus: string,
  ): Promise<CampaignRow> {
    const campaign = await this.getCampaign(uri);

    // Validate status transitions
    const allowed: Record<string, string[]> = {
      draft: ['active', 'cancelled'],
      active: ['funded', 'cancelled'],
      funded: ['completed'],
    };

    const validTransitions = allowed[campaign.status] ?? [];
    if (!validTransitions.includes(newStatus)) {
      throw new ValidationError(
        `Cannot transition from '${campaign.status}' to '${newStatus}'`,
      );
    }

    const now = this.clock.now();
    const [row] = await this.db
      .updateTable('funding_campaign')
      .set({ status: newStatus, indexed_at: now })
      .where('uri', '=', uri)
      .returningAll()
      .execute();

    return row!;
  }

  // ─── Pledges ───────────────────────────────────────────────────────────

  async createPledge(
    backerDid: string,
    data: CreatePledgeInput,
  ): Promise<PledgeRow> {
    const campaign = await this.getCampaign(data.campaignUri);
    if (campaign.status !== 'active') {
      throw new ValidationError('Can only pledge to active campaigns');
    }

    const now = this.clock.now();

    const ref = await this.pdsService.createRecord({
      did: backerDid as DID,
      collection: 'network.coopsource.funding.pledge',
      record: {
        campaignUri: data.campaignUri,
        backerDid,
        amount: data.amount,
        currency: data.currency,
        paymentStatus: 'pending',
        createdAt: now.toISOString(),
      },
    });

    const rkey = ref.uri.split('/').pop()!;
    const [row] = await this.db
      .insertInto('funding_pledge')
      .values({
        uri: ref.uri,
        did: backerDid,
        rkey,
        campaign_uri: data.campaignUri,
        backer_did: backerDid,
        amount: data.amount,
        currency: data.currency,
        payment_status: 'pending',
        stripe_checkout_session_id: null,
        metadata: data.metadata ?? null,
        created_at: now,
        indexed_at: now,
      })
      .returningAll()
      .execute();

    return row!;
  }

  async listPledges(
    campaignUri: string,
    params: PageParams,
  ): Promise<Page<PledgeRow>> {
    const limit = params.limit ?? 50;
    let query = this.db
      .selectFrom('funding_pledge')
      .where('campaign_uri', '=', campaignUri)
      .selectAll()
      .orderBy('created_at', 'desc')
      .orderBy('uri', 'desc')
      .limit(limit + 1);

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

  async updatePledgeStatus(
    pledgeUri: string,
    status: string,
    stripeSessionId?: string,
  ): Promise<PledgeRow> {
    const pledge = await this.db
      .selectFrom('funding_pledge')
      .where('uri', '=', pledgeUri)
      .selectAll()
      .executeTakeFirst();

    if (!pledge) throw new NotFoundError('Pledge not found');

    const now = this.clock.now();
    const updates: Record<string, unknown> = {
      payment_status: status,
      indexed_at: now,
    };
    if (stripeSessionId) {
      updates.stripe_checkout_session_id = stripeSessionId;
    }

    const [row] = await this.db
      .updateTable('funding_pledge')
      .set(updates)
      .where('uri', '=', pledgeUri)
      .returningAll()
      .execute();

    // If payment completed, increment campaign totals
    if (status === 'completed' && pledge.payment_status !== 'completed') {
      await this.db
        .updateTable('funding_campaign')
        .set((eb) => ({
          amount_raised: eb('amount_raised', '+', pledge.amount),
          backer_count: eb('backer_count', '+', 1),
          indexed_at: now,
        }))
        .where('uri', '=', pledge.campaign_uri)
        .execute();
    }

    return row!;
  }

  /** Find pledge by Stripe checkout session ID */
  async findPledgeByStripeSession(sessionId: string): Promise<PledgeRow | null> {
    const row = await this.db
      .selectFrom('funding_pledge')
      .where('stripe_checkout_session_id', '=', sessionId)
      .selectAll()
      .executeTakeFirst();

    return row ?? null;
  }
}
