import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';

export interface MemberEngagement {
  votingParticipation: number;
  proposalCount: number;
  agreementCount: number;
  memberCount: number;
  activeMemberCount: number;
}

export interface FinancialSummary {
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  pendingExpenses: number;
  approvedExpenses: number;
}

export interface OperationalSummary {
  tasksCompleted: number;
  tasksInProgress: number;
  timeLogged: number;
  upcomingCompliance: number;
  activeAgreements: number;
}

export class DashboardService {
  constructor(
    private db: Kysely<Database>,
  ) {}

  async getMemberEngagement(
    cooperativeDid: string,
    startDate: string,
    endDate: string,
  ): Promise<MemberEngagement> {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const proposalCount = await this.db
      .selectFrom('proposal')
      .where('cooperative_did', '=', cooperativeDid)
      .where('created_at', '>=', start)
      .where('created_at', '<=', end)
      .select((eb) => eb.fn.count('id').as('count'))
      .executeTakeFirst();

    const voteCount = await this.db
      .selectFrom('vote')
      .innerJoin('proposal', 'proposal.id', 'vote.proposal_id')
      .where('proposal.cooperative_did', '=', cooperativeDid)
      .where('vote.created_at', '>=', start)
      .where('vote.created_at', '<=', end)
      .select((eb) => eb.fn.count('vote.id').as('count'))
      .executeTakeFirst();

    const agreementCount = await this.db
      .selectFrom('agreement')
      .where('project_uri', '=', cooperativeDid)
      .where('created_at', '>=', start)
      .where('created_at', '<=', end)
      .select((eb) => eb.fn.count('uri').as('count'))
      .executeTakeFirst();

    const memberCount = await this.db
      .selectFrom('membership')
      .where('cooperative_did', '=', cooperativeDid)
      .select((eb) => eb.fn.count('id').as('count'))
      .executeTakeFirst();

    const activeMemberCount = await this.db
      .selectFrom('membership')
      .where('cooperative_did', '=', cooperativeDid)
      .where('status', '=', 'active')
      .select((eb) => eb.fn.count('id').as('count'))
      .executeTakeFirst();

    const proposals = Number(proposalCount?.count ?? 0);
    const votes = Number(voteCount?.count ?? 0);
    // Voting participation: ratio of votes to proposals (0 if no proposals)
    const votingParticipation = proposals > 0 ? votes / proposals : 0;

    return {
      votingParticipation: Math.round(votingParticipation * 100) / 100,
      proposalCount: proposals,
      agreementCount: Number(agreementCount?.count ?? 0),
      memberCount: Number(memberCount?.count ?? 0),
      activeMemberCount: Number(activeMemberCount?.count ?? 0),
    };
  }

  async getFinancialSummary(
    cooperativeDid: string,
    startDate: string,
    endDate: string,
  ): Promise<FinancialSummary> {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const revenueResult = await this.db
      .selectFrom('revenue_entry')
      .where('cooperative_did', '=', cooperativeDid)
      .where('recorded_at', '>=', start)
      .where('recorded_at', '<=', end)
      .select((eb) => eb.fn.sum('amount').as('total'))
      .executeTakeFirst();

    const approvedExpenseResult = await this.db
      .selectFrom('expense')
      .where('cooperative_did', '=', cooperativeDid)
      .where('status', '=', 'approved')
      .where('created_at', '>=', start)
      .where('created_at', '<=', end)
      .select((eb) => eb.fn.sum('amount').as('total'))
      .executeTakeFirst();

    const pendingExpenseResult = await this.db
      .selectFrom('expense')
      .where('cooperative_did', '=', cooperativeDid)
      .where('status', '=', 'pending')
      .where('created_at', '>=', start)
      .where('created_at', '<=', end)
      .select((eb) => eb.fn.sum('amount').as('total'))
      .executeTakeFirst();

    const totalExpenseResult = await this.db
      .selectFrom('expense')
      .where('cooperative_did', '=', cooperativeDid)
      .where('status', 'in', ['approved', 'reimbursed'])
      .where('created_at', '>=', start)
      .where('created_at', '<=', end)
      .select((eb) => eb.fn.sum('amount').as('total'))
      .executeTakeFirst();

    const totalRevenue = Number(revenueResult?.total ?? 0);
    const totalExpenses = Number(totalExpenseResult?.total ?? 0);

    return {
      totalRevenue,
      totalExpenses,
      netIncome: Math.round((totalRevenue - totalExpenses) * 100) / 100,
      pendingExpenses: Number(pendingExpenseResult?.total ?? 0),
      approvedExpenses: Number(approvedExpenseResult?.total ?? 0),
    };
  }

  async getOperationalSummary(
    cooperativeDid: string,
    startDate: string,
    endDate: string,
  ): Promise<OperationalSummary> {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const tasksCompleted = await this.db
      .selectFrom('task')
      .where('cooperative_did', '=', cooperativeDid)
      .where('status', '=', 'done')
      .where('updated_at', '>=', start)
      .where('updated_at', '<=', end)
      .select((eb) => eb.fn.count('id').as('count'))
      .executeTakeFirst();

    const tasksInProgress = await this.db
      .selectFrom('task')
      .where('cooperative_did', '=', cooperativeDid)
      .where('status', '=', 'in_progress')
      .select((eb) => eb.fn.count('id').as('count'))
      .executeTakeFirst();

    const timeLogged = await this.db
      .selectFrom('time_entry')
      .where('cooperative_did', '=', cooperativeDid)
      .where('started_at', '>=', start)
      .where('started_at', '<=', end)
      .select((eb) => eb.fn.sum('duration_minutes').as('total'))
      .executeTakeFirst();

    const upcomingCompliance = await this.db
      .selectFrom('compliance_item')
      .where('cooperative_did', '=', cooperativeDid)
      .where('status', 'in', ['upcoming', 'due', 'overdue'])
      .select((eb) => eb.fn.count('id').as('count'))
      .executeTakeFirst();

    const activeAgreements = await this.db
      .selectFrom('agreement')
      .where('project_uri', '=', cooperativeDid)
      .where('status', '=', 'active')
      .select((eb) => eb.fn.count('uri').as('count'))
      .executeTakeFirst();

    return {
      tasksCompleted: Number(tasksCompleted?.count ?? 0),
      tasksInProgress: Number(tasksInProgress?.count ?? 0),
      timeLogged: Number(timeLogged?.total ?? 0),
      upcomingCompliance: Number(upcomingCompliance?.count ?? 0),
      activeAgreements: Number(activeAgreements?.count ?? 0),
    };
  }
}
