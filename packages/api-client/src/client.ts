import { encodeAtUri } from '@coopsource/common';
import { ApiError } from './errors.js';
import type {
  User,
  Cooperative,
  Project,
  Interest,
  InterestMap,
  Outcome,
  Proposal,
  Vote,
  VoteResults,
  VoteListResponse,
  Delegation,
  DelegationListResponse,
  PaginatedResult,
  PaginationParams,
  ListProjectsParams,
  CreateCooperativeInput,
  UpdateCooperativeInput,
  CreateProjectInput,
  UpdateProjectInput,
  SubmitInterestsInput,
  UpdateInterestsInput,
  CreateOutcomeInput,
  CreateProposalInput,
  UpdateProposalStatusInput,
  CastVoteInput,
  CreateDelegationInput,
  Membership,
  CreateMembershipInput,
  ListMembersParams,
  ConnectionBinding,
  MasterAgreement,
  CreateAgreementInput,
  UpdateAgreementInput,
  StakeholderTerms,
  CreateTermsInput,
  AgreementSignature,
  SignatureStatusResponse,
  Amendment,
  CreateAmendmentInput,
  VersionHistory,
  VersionComparison,
  AgreementTemplate,
  Connection,
  AuthorizeUrlResponse,
  BindResourceInput,
  Campaign,
  CreateCampaignInput,
  UpdateCampaignInput,
  UpdateCampaignStatusInput,
  ListCampaignsParams,
  DiscoverCampaignsParams,
  Pledge,
  CreatePledgeInput,
  ListPledgesParams,
  Backer,
  Workflow,
  CreateWorkflowInput,
  UpdateWorkflowInput,
  WorkflowExecution,
  Trigger,
  CreateTriggerInput,
  UpdateTriggerInput,
  EventLogEntry,
  WorkflowTemplate,
  AgentConfig,
  CreateAgentConfigInput,
  UpdateAgentConfigInput,
  CreateFromTemplateInput,
  SendMessageInput,
  AgentChatResponse,
  AgentSession,
  AgentMessage,
  AgentUsage,
  ProjectAgentUsage,
  AgentTemplate,
  AgentTool,
  AgentModel,
  OidcClient,
  RegisterOidcClientInput,
  CliLoginInitResponse,
  CliLoginStatusResponse,
} from './types.js';

export interface ClientOptions {
  cookie?: string;
}

export class CoopSourceClient {
  private baseUrl: string;
  private cookie: string | undefined;

  constructor(baseUrl: string, options?: ClientOptions) {
    // Remove trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.cookie = options?.cookie;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ data: T; headers: Headers }> {
    const headers: Record<string, string> = {};

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    if (this.cookie) {
      headers['Cookie'] = this.cookie;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      let errorBody: { error?: string; message?: string } = {};
      try {
        errorBody = (await response.json()) as { error?: string; message?: string };
      } catch {
        // response may not be JSON
      }
      throw new ApiError(
        response.status,
        errorBody.error ?? 'UnknownError',
        errorBody.message ?? `HTTP ${response.status}`,
      );
    }

    const data = (await response.json()) as T;
    return { data, headers: response.headers };
  }

  private async requestVoid(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<void> {
    const headers: Record<string, string> = {};

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    if (this.cookie) {
      headers['Cookie'] = this.cookie;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      let errorBody: { error?: string; message?: string } = {};
      try {
        errorBody = (await response.json()) as { error?: string; message?: string };
      } catch {
        // response may not be JSON
      }
      throw new ApiError(
        response.status,
        errorBody.error ?? 'UnknownError',
        errorBody.message ?? `HTTP ${response.status}`,
      );
    }
  }

  private async requestPaginated<T>(
    method: string,
    path: string,
    dataKey: string,
  ): Promise<PaginatedResult<T>> {
    const { data: raw } = await this.request<Record<string, unknown>>(method, path);
    return {
      data: (raw[dataKey] ?? []) as T[],
      cursor: (raw.cursor as string) ?? null,
    };
  }

  private buildQuery(params: Record<string, string | number | boolean | undefined>): string {
    const entries = Object.entries(params).filter(
      (entry): entry is [string, string | number | boolean] => entry[1] !== undefined,
    );
    if (entries.length === 0) return '';
    return '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)] as [string, string])).toString();
  }

  // =====================================================================
  // Auth
  // =====================================================================

  async getMe(): Promise<User> {
    const { data } = await this.request<User>('GET', '/auth/me');
    return data;
  }

  async logout(): Promise<void> {
    await this.requestVoid('POST', '/auth/logout');
  }

  // =====================================================================
  // Cooperatives
  // =====================================================================

  async listCooperatives(
    params?: PaginationParams,
  ): Promise<PaginatedResult<Cooperative>> {
    const query = this.buildQuery({
      limit: params?.limit,
      cursor: params?.cursor,
    });
    return this.requestPaginated<Cooperative>(
      'GET',
      `/api/cooperatives${query}`,
      'cooperatives',
    );
  }

  async createCooperative(
    input: CreateCooperativeInput,
  ): Promise<Cooperative> {
    const { data } = await this.request<Cooperative>(
      'POST',
      '/api/cooperatives',
      input,
    );
    return data;
  }

  async getCooperative(cooperativeUri: string): Promise<Cooperative> {
    const encoded = encodeAtUri(cooperativeUri);
    const { data } = await this.request<Cooperative>(
      'GET',
      `/api/cooperatives/${encoded}`,
    );
    return data;
  }

  async updateCooperative(
    cooperativeUri: string,
    input: UpdateCooperativeInput,
  ): Promise<Cooperative> {
    const encoded = encodeAtUri(cooperativeUri);
    const { data } = await this.request<Cooperative>(
      'PUT',
      `/api/cooperatives/${encoded}`,
      input,
    );
    return data;
  }

  // =====================================================================
  // Projects
  // =====================================================================

  async listProjects(
    params?: ListProjectsParams,
  ): Promise<PaginatedResult<Project>> {
    const query = this.buildQuery({
      limit: params?.limit,
      cursor: params?.cursor,
      cooperativeUri: params?.cooperativeUri,
    });
    return this.requestPaginated<Project>(
      'GET',
      `/api/projects${query}`,
      'projects',
    );
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const { data } = await this.request<Project>(
      'POST',
      '/api/projects',
      input,
    );
    return data;
  }

  async getProject(projectUri: string): Promise<Project> {
    const encoded = encodeAtUri(projectUri);
    const { data } = await this.request<Project>(
      'GET',
      `/api/projects/${encoded}`,
    );
    return data;
  }

  async updateProject(
    projectUri: string,
    input: UpdateProjectInput,
  ): Promise<Project> {
    const encoded = encodeAtUri(projectUri);
    const { data } = await this.request<Project>(
      'PUT',
      `/api/projects/${encoded}`,
      input,
    );
    return data;
  }

  async getConnectedResources(
    projectUri: string,
  ): Promise<{ bindings: ConnectionBinding[] }> {
    const encoded = encodeAtUri(projectUri);
    const { data } = await this.request<{ bindings: ConnectionBinding[] }>(
      'GET',
      `/api/projects/${encoded}/connected-resources`,
    );
    return data;
  }

  // =====================================================================
  // Memberships
  // =====================================================================

  async createMembership(input: CreateMembershipInput): Promise<Membership> {
    const { data } = await this.request<Membership>(
      'POST',
      '/api/memberships',
      input,
    );
    return data;
  }

  async listMembers(
    params: ListMembersParams,
  ): Promise<PaginatedResult<Membership>> {
    const query = this.buildQuery({
      entityUri: params.entityUri,
      limit: params.limit,
      cursor: params.cursor,
    });
    return this.requestPaginated<Membership>(
      'GET',
      `/api/memberships${query}`,
      'members',
    );
  }

  async removeMember(membershipUri: string): Promise<void> {
    const encoded = encodeAtUri(membershipUri);
    await this.requestVoid('DELETE', `/api/memberships/${encoded}`);
  }

  // =====================================================================
  // Alignment
  // =====================================================================

  async listInterests(
    projectUri: string,
    params?: PaginationParams,
  ): Promise<PaginatedResult<Interest>> {
    const encoded = encodeAtUri(projectUri);
    const query = this.buildQuery({
      limit: params?.limit,
      cursor: params?.cursor,
    });
    return this.requestPaginated<Interest>(
      'GET',
      `/api/projects/${encoded}/interests${query}`,
      'interests',
    );
  }

  async submitInterests(
    projectUri: string,
    input: SubmitInterestsInput,
  ): Promise<Interest> {
    const encoded = encodeAtUri(projectUri);
    const { data } = await this.request<Interest>(
      'POST',
      `/api/projects/${encoded}/interests`,
      input,
    );
    return data;
  }

  async updateInterests(
    projectUri: string,
    interestUri: string,
    input: UpdateInterestsInput,
  ): Promise<Interest> {
    const encodedProject = encodeAtUri(projectUri);
    const encodedInterest = encodeAtUri(interestUri);
    const { data } = await this.request<Interest>(
      'PUT',
      `/api/projects/${encodedProject}/interests/${encodedInterest}`,
      input,
    );
    return data;
  }

  async getMyInterests(projectUri: string): Promise<Interest | null> {
    const encoded = encodeAtUri(projectUri);
    try {
      const { data } = await this.request<Interest | null>(
        'GET',
        `/api/projects/${encoded}/interests/mine`,
      );
      return data;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  async getInterestMap(projectUri: string): Promise<InterestMap | null> {
    const encoded = encodeAtUri(projectUri);
    const { data } = await this.request<InterestMap | null>(
      'GET',
      `/api/projects/${encoded}/interest-map`,
    );
    return data;
  }

  async generateInterestMap(projectUri: string): Promise<InterestMap> {
    const encoded = encodeAtUri(projectUri);
    const { data } = await this.request<InterestMap>(
      'POST',
      `/api/projects/${encoded}/interest-map/generate`,
    );
    return data;
  }

  async createOutcome(
    projectUri: string,
    input: CreateOutcomeInput,
  ): Promise<Outcome> {
    const encoded = encodeAtUri(projectUri);
    const { data } = await this.request<Outcome>(
      'POST',
      `/api/projects/${encoded}/outcomes`,
      input,
    );
    return data;
  }

  async listOutcomes(
    projectUri: string,
    params?: PaginationParams,
  ): Promise<PaginatedResult<Outcome>> {
    const encoded = encodeAtUri(projectUri);
    const query = this.buildQuery({
      limit: params?.limit,
      cursor: params?.cursor,
    });
    return this.requestPaginated<Outcome>(
      'GET',
      `/api/projects/${encoded}/outcomes${query}`,
      'outcomes',
    );
  }

  // =====================================================================
  // Agreements
  // =====================================================================

  async createAgreement(
    projectUri: string,
    input: CreateAgreementInput,
  ): Promise<MasterAgreement> {
    const encoded = encodeAtUri(projectUri);
    const { data } = await this.request<MasterAgreement>(
      'POST',
      `/api/projects/${encoded}/agreements`,
      input,
    );
    return data;
  }

  async listAgreements(
    projectUri: string,
    params?: PaginationParams,
  ): Promise<PaginatedResult<MasterAgreement>> {
    const encoded = encodeAtUri(projectUri);
    const query = this.buildQuery({
      limit: params?.limit,
      cursor: params?.cursor,
    });
    return this.requestPaginated<MasterAgreement>(
      'GET',
      `/api/projects/${encoded}/agreements${query}`,
      'agreements',
    );
  }

  async getAgreement(agreementUri: string): Promise<MasterAgreement> {
    const encoded = encodeAtUri(agreementUri);
    const { data } = await this.request<MasterAgreement>(
      'GET',
      `/api/agreements/${encoded}`,
    );
    return data;
  }

  async updateAgreement(
    agreementUri: string,
    input: UpdateAgreementInput,
  ): Promise<MasterAgreement> {
    const encoded = encodeAtUri(agreementUri);
    const { data } = await this.request<MasterAgreement>(
      'PUT',
      `/api/agreements/${encoded}`,
      input,
    );
    return data;
  }

  async addStakeholderTerms(
    agreementUri: string,
    input: CreateTermsInput,
  ): Promise<StakeholderTerms> {
    const encoded = encodeAtUri(agreementUri);
    const { data } = await this.request<StakeholderTerms>(
      'POST',
      `/api/agreements/${encoded}/terms`,
      input,
    );
    return data;
  }

  async signAgreement(
    agreementUri: string,
    input?: { signerRole?: string; signatureType?: string },
  ): Promise<AgreementSignature> {
    const encoded = encodeAtUri(agreementUri);
    const { data } = await this.request<AgreementSignature>(
      'POST',
      `/api/agreements/${encoded}/sign`,
      input,
    );
    return data;
  }

  async getSignatureStatus(
    agreementUri: string,
  ): Promise<SignatureStatusResponse> {
    const encoded = encodeAtUri(agreementUri);
    const { data } = await this.request<SignatureStatusResponse>(
      'GET',
      `/api/agreements/${encoded}/signatures`,
    );
    return data;
  }

  async proposeAmendment(
    agreementUri: string,
    input: CreateAmendmentInput,
  ): Promise<Amendment> {
    const encoded = encodeAtUri(agreementUri);
    const { data } = await this.request<Amendment>(
      'POST',
      `/api/agreements/${encoded}/amendments`,
      input,
    );
    return data;
  }

  async listAmendments(
    agreementUri: string,
    params?: PaginationParams,
  ): Promise<PaginatedResult<Amendment>> {
    const encoded = encodeAtUri(agreementUri);
    const query = this.buildQuery({
      limit: params?.limit,
      cursor: params?.cursor,
    });
    return this.requestPaginated<Amendment>(
      'GET',
      `/api/agreements/${encoded}/amendments${query}`,
      'amendments',
    );
  }

  async getAmendment(amendmentUri: string): Promise<Amendment> {
    const encoded = encodeAtUri(amendmentUri);
    const { data } = await this.request<Amendment>(
      'GET',
      `/api/amendments/${encoded}`,
    );
    return data;
  }

  async applyAmendment(amendmentUri: string): Promise<Amendment> {
    const encoded = encodeAtUri(amendmentUri);
    const { data } = await this.request<Amendment>(
      'POST',
      `/api/amendments/${encoded}/apply`,
    );
    return data;
  }

  async getVersionHistory(agreementUri: string): Promise<VersionHistory> {
    const encoded = encodeAtUri(agreementUri);
    const { data } = await this.request<VersionHistory>(
      'GET',
      `/api/agreements/${encoded}/versions`,
    );
    return data;
  }

  async compareVersions(
    agreementUri: string,
    versionA: number,
    versionB: number,
  ): Promise<VersionComparison> {
    const encoded = encodeAtUri(agreementUri);
    const query = this.buildQuery({ versionA, versionB });
    const { data } = await this.request<VersionComparison>(
      'GET',
      `/api/agreements/${encoded}/versions/compare${query}`,
    );
    return data;
  }

  async listAgreementTemplates(): Promise<AgreementTemplate[]> {
    const { data } = await this.request<{ templates: AgreementTemplate[] }>(
      'GET',
      '/api/agreement-templates',
    );
    return data.templates;
  }

  async getAgreementTemplate(templateId: string): Promise<AgreementTemplate> {
    const { data } = await this.request<AgreementTemplate>(
      'GET',
      `/api/agreement-templates/${templateId}`,
    );
    return data;
  }

  // =====================================================================
  // Governance
  // =====================================================================

  async listProposals(
    projectUri: string,
    params?: PaginationParams & { status?: string },
  ): Promise<PaginatedResult<Proposal>> {
    const encoded = encodeAtUri(projectUri);
    const query = this.buildQuery({
      limit: params?.limit,
      cursor: params?.cursor,
      status: params?.status,
    });
    return this.requestPaginated<Proposal>(
      'GET',
      `/api/projects/${encoded}/proposals${query}`,
      'proposals',
    );
  }

  async createProposal(
    projectUri: string,
    input: CreateProposalInput,
  ): Promise<Proposal> {
    const encoded = encodeAtUri(projectUri);
    const { data } = await this.request<Proposal>(
      'POST',
      `/api/projects/${encoded}/proposals`,
      input,
    );
    return data;
  }

  async getProposal(proposalUri: string): Promise<Proposal> {
    const encoded = encodeAtUri(proposalUri);
    const { data } = await this.request<Proposal>(
      'GET',
      `/api/proposals/${encoded}`,
    );
    return data;
  }

  async updateProposalStatus(
    proposalUri: string,
    input: UpdateProposalStatusInput,
  ): Promise<Proposal> {
    const encoded = encodeAtUri(proposalUri);
    const { data } = await this.request<Proposal>(
      'PUT',
      `/api/proposals/${encoded}/status`,
      input,
    );
    return data;
  }

  async castVote(
    proposalUri: string,
    input: CastVoteInput,
  ): Promise<Vote> {
    const encoded = encodeAtUri(proposalUri);
    const { data } = await this.request<Vote>(
      'POST',
      `/api/proposals/${encoded}/votes`,
      input,
    );
    return data;
  }

  async listVotes(proposalUri: string): Promise<VoteListResponse> {
    const encoded = encodeAtUri(proposalUri);
    const { data } = await this.request<VoteListResponse>(
      'GET',
      `/api/proposals/${encoded}/votes`,
    );
    return data;
  }

  async getMyVote(proposalUri: string): Promise<Vote | null> {
    const encoded = encodeAtUri(proposalUri);
    try {
      const { data } = await this.request<Vote>(
        'GET',
        `/api/proposals/${encoded}/votes/me`,
      );
      return data;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  async getVoteResults(proposalUri: string): Promise<VoteResults> {
    const encoded = encodeAtUri(proposalUri);
    const { data } = await this.request<VoteResults>(
      'GET',
      `/api/proposals/${encoded}/results`,
    );
    return data;
  }

  async createDelegation(
    projectUri: string,
    input: CreateDelegationInput,
  ): Promise<Delegation> {
    const encoded = encodeAtUri(projectUri);
    const { data } = await this.request<Delegation>(
      'POST',
      `/api/projects/${encoded}/delegations`,
      input,
    );
    return data;
  }

  async listDelegations(
    projectUri: string,
  ): Promise<DelegationListResponse> {
    const encoded = encodeAtUri(projectUri);
    const { data } = await this.request<DelegationListResponse>(
      'GET',
      `/api/projects/${encoded}/delegations`,
    );
    return data;
  }

  async revokeDelegation(delegationUri: string): Promise<Delegation> {
    const encoded = encodeAtUri(delegationUri);
    const { data } = await this.request<Delegation>(
      'DELETE',
      `/api/delegations/${encoded}`,
    );
    return data;
  }

  // =====================================================================
  // Connections
  // =====================================================================

  async listConnections(): Promise<{ connections: Connection[] }> {
    const { data } = await this.request<{ connections: Connection[] }>(
      'GET',
      '/api/connections',
    );
    return data;
  }

  async getConnectionAuthorizeUrl(
    service: string,
  ): Promise<AuthorizeUrlResponse> {
    const { data } = await this.request<AuthorizeUrlResponse>(
      'GET',
      `/api/connections/${service}/authorize`,
    );
    return data;
  }

  async disconnectService(
    connectionUri: string,
  ): Promise<{ ok: true }> {
    const encoded = encodeAtUri(connectionUri);
    const { data } = await this.request<{ ok: true }>(
      'DELETE',
      `/api/connections/${encoded}`,
    );
    return data;
  }

  async bindResource(
    connectionUri: string,
    input: BindResourceInput,
  ): Promise<ConnectionBinding> {
    const encoded = encodeAtUri(connectionUri);
    const { data } = await this.request<ConnectionBinding>(
      'POST',
      `/api/connections/${encoded}/bind`,
      input,
    );
    return data;
  }

  // =====================================================================
  // Funding
  // =====================================================================

  async createCampaign(input: CreateCampaignInput): Promise<Campaign> {
    const { data } = await this.request<Campaign>(
      'POST',
      '/api/campaigns',
      input,
    );
    return data;
  }

  async listCampaigns(
    params?: ListCampaignsParams,
  ): Promise<PaginatedResult<Campaign>> {
    const query = this.buildQuery({
      limit: params?.limit,
      cursor: params?.cursor,
      beneficiaryUri: params?.beneficiaryUri,
      tier: params?.tier,
      status: params?.status,
      campaignType: params?.campaignType,
      mine: params?.mine,
    });
    return this.requestPaginated<Campaign>(
      'GET',
      `/api/campaigns${query}`,
      'campaigns',
    );
  }

  async getCampaign(campaignUri: string): Promise<Campaign> {
    const encoded = encodeAtUri(campaignUri);
    const { data } = await this.request<Campaign>(
      'GET',
      `/api/campaigns/${encoded}`,
    );
    return data;
  }

  async updateCampaign(
    campaignUri: string,
    input: UpdateCampaignInput,
  ): Promise<Campaign> {
    const encoded = encodeAtUri(campaignUri);
    const { data } = await this.request<Campaign>(
      'PUT',
      `/api/campaigns/${encoded}`,
      input,
    );
    return data;
  }

  async updateCampaignStatus(
    campaignUri: string,
    input: UpdateCampaignStatusInput,
  ): Promise<Campaign> {
    const encoded = encodeAtUri(campaignUri);
    const { data } = await this.request<Campaign>(
      'PUT',
      `/api/campaigns/${encoded}/status`,
      input,
    );
    return data;
  }

  async discoverCampaigns(
    params?: DiscoverCampaignsParams,
  ): Promise<PaginatedResult<Campaign>> {
    const query = this.buildQuery({
      limit: params?.limit,
      cursor: params?.cursor,
      tier: params?.tier,
      campaignType: params?.campaignType,
    });
    return this.requestPaginated<Campaign>(
      'GET',
      `/api/discover/campaigns${query}`,
      'campaigns',
    );
  }

  async discoverCampaignDetail(campaignUri: string): Promise<Campaign> {
    const encoded = encodeAtUri(campaignUri);
    const { data } = await this.request<Campaign>(
      'GET',
      `/api/discover/campaigns/${encoded}`,
    );
    return data;
  }

  async createPledge(
    campaignUri: string,
    input: CreatePledgeInput,
  ): Promise<Pledge> {
    const encoded = encodeAtUri(campaignUri);
    const { data } = await this.request<Pledge>(
      'POST',
      `/api/campaigns/${encoded}/pledges`,
      input,
    );
    return data;
  }

  async listPledges(
    campaignUri: string,
    params?: ListPledgesParams,
  ): Promise<PaginatedResult<Pledge>> {
    const encoded = encodeAtUri(campaignUri);
    const query = this.buildQuery({
      limit: params?.limit,
      cursor: params?.cursor,
      paymentStatus: params?.paymentStatus,
    });
    return this.requestPaginated<Pledge>(
      'GET',
      `/api/campaigns/${encoded}/pledges${query}`,
      'pledges',
    );
  }

  async listBackers(
    campaignUri: string,
    params?: PaginationParams,
  ): Promise<PaginatedResult<Backer>> {
    const encoded = encodeAtUri(campaignUri);
    const query = this.buildQuery({
      limit: params?.limit,
      cursor: params?.cursor,
    });
    return this.requestPaginated<Backer>(
      'GET',
      `/api/campaigns/${encoded}/backers${query}`,
      'backers',
    );
  }

  async getPledge(pledgeUri: string): Promise<Pledge> {
    const encoded = encodeAtUri(pledgeUri);
    const { data } = await this.request<Pledge>(
      'GET',
      `/api/pledges/${encoded}`,
    );
    return data;
  }

  async cancelPledge(pledgeUri: string): Promise<Pledge> {
    const encoded = encodeAtUri(pledgeUri);
    const { data } = await this.request<Pledge>(
      'DELETE',
      `/api/pledges/${encoded}`,
    );
    return data;
  }

  async refundPledge(pledgeUri: string): Promise<Pledge> {
    const encoded = encodeAtUri(pledgeUri);
    const { data } = await this.request<Pledge>(
      'POST',
      `/api/pledges/${encoded}/refund`,
    );
    return data;
  }

  // =====================================================================
  // Automation
  // =====================================================================

  async createWorkflow(
    projectUri: string,
    input: CreateWorkflowInput,
  ): Promise<Workflow> {
    const encoded = encodeAtUri(projectUri);
    const { data } = await this.request<Workflow>(
      'POST',
      `/api/projects/${encoded}/workflows`,
      input,
    );
    return data;
  }

  async listWorkflows(
    projectUri: string,
  ): Promise<{ workflows: Workflow[] }> {
    const encoded = encodeAtUri(projectUri);
    const { data } = await this.request<{ workflows: Workflow[] }>(
      'GET',
      `/api/projects/${encoded}/workflows`,
    );
    return data;
  }

  async getWorkflow(workflowId: string): Promise<Workflow> {
    const { data } = await this.request<Workflow>(
      'GET',
      `/api/workflows/${workflowId}`,
    );
    return data;
  }

  async updateWorkflow(
    workflowId: string,
    input: UpdateWorkflowInput,
  ): Promise<Workflow> {
    const { data } = await this.request<Workflow>(
      'PUT',
      `/api/workflows/${workflowId}`,
      input,
    );
    return data;
  }

  async deleteWorkflow(workflowId: string): Promise<{ ok: true }> {
    const { data } = await this.request<{ ok: true }>(
      'DELETE',
      `/api/workflows/${workflowId}`,
    );
    return data;
  }

  async executeWorkflow(
    workflowId: string,
  ): Promise<WorkflowExecution> {
    const { data } = await this.request<WorkflowExecution>(
      'POST',
      `/api/workflows/${workflowId}/execute`,
    );
    return data;
  }

  async listWorkflowExecutions(
    workflowId: string,
    params?: PaginationParams,
  ): Promise<PaginatedResult<WorkflowExecution>> {
    const query = this.buildQuery({
      limit: params?.limit,
      cursor: params?.cursor,
    });
    return this.requestPaginated<WorkflowExecution>(
      'GET',
      `/api/workflows/${workflowId}/executions${query}`,
      'executions',
    );
  }

  async getWorkflowExecution(
    workflowId: string,
    executionId: string,
  ): Promise<WorkflowExecution> {
    const { data } = await this.request<WorkflowExecution>(
      'GET',
      `/api/workflows/${workflowId}/executions/${executionId}`,
    );
    return data;
  }

  async createTrigger(
    workflowId: string,
    input: CreateTriggerInput,
  ): Promise<Trigger> {
    const { data } = await this.request<Trigger>(
      'POST',
      `/api/workflows/${workflowId}/triggers`,
      input,
    );
    return data;
  }

  async listTriggers(
    workflowId: string,
  ): Promise<{ triggers: Trigger[] }> {
    const { data } = await this.request<{ triggers: Trigger[] }>(
      'GET',
      `/api/workflows/${workflowId}/triggers`,
    );
    return data;
  }

  async getTrigger(triggerId: string): Promise<Trigger> {
    const { data } = await this.request<Trigger>(
      'GET',
      `/api/triggers/${triggerId}`,
    );
    return data;
  }

  async updateTrigger(
    triggerId: string,
    input: UpdateTriggerInput,
  ): Promise<Trigger> {
    const { data } = await this.request<Trigger>(
      'PUT',
      `/api/triggers/${triggerId}`,
      input,
    );
    return data;
  }

  async deleteTrigger(triggerId: string): Promise<{ ok: true }> {
    const { data } = await this.request<{ ok: true }>(
      'DELETE',
      `/api/triggers/${triggerId}`,
    );
    return data;
  }

  async listEvents(
    projectUri: string,
    params?: PaginationParams,
  ): Promise<PaginatedResult<EventLogEntry>> {
    const encoded = encodeAtUri(projectUri);
    const query = this.buildQuery({
      limit: params?.limit,
      cursor: params?.cursor,
    });
    return this.requestPaginated<EventLogEntry>(
      'GET',
      `/api/projects/${encoded}/events${query}`,
      'events',
    );
  }

  async listWorkflowTemplates(): Promise<{ templates: WorkflowTemplate[] }> {
    const { data } = await this.request<{ templates: WorkflowTemplate[] }>(
      'GET',
      '/api/workflow-templates',
    );
    return data;
  }

  async getWorkflowTemplate(templateId: string): Promise<WorkflowTemplate> {
    const { data } = await this.request<WorkflowTemplate>(
      'GET',
      `/api/workflow-templates/${templateId}`,
    );
    return data;
  }

  // =====================================================================
  // Agents
  // =====================================================================

  async createAgentConfig(
    projectUri: string,
    input: CreateAgentConfigInput,
  ): Promise<AgentConfig> {
    const encoded = encodeAtUri(projectUri);
    const { data } = await this.request<AgentConfig>(
      'POST',
      `/api/projects/${encoded}/agents`,
      input,
    );
    return data;
  }

  async createAgentFromTemplate(
    projectUri: string,
    input: CreateFromTemplateInput,
  ): Promise<AgentConfig> {
    const encoded = encodeAtUri(projectUri);
    const { data } = await this.request<AgentConfig>(
      'POST',
      `/api/projects/${encoded}/agents/from-template`,
      input,
    );
    return data;
  }

  async listAgentConfigs(
    projectUri: string,
  ): Promise<{ agents: AgentConfig[] }> {
    const encoded = encodeAtUri(projectUri);
    const { data } = await this.request<{ agents: AgentConfig[] }>(
      'GET',
      `/api/projects/${encoded}/agents`,
    );
    return data;
  }

  async getAgentConfig(configId: string): Promise<AgentConfig> {
    const { data } = await this.request<AgentConfig>(
      'GET',
      `/api/agents/${configId}`,
    );
    return data;
  }

  async updateAgentConfig(
    configId: string,
    input: UpdateAgentConfigInput,
  ): Promise<AgentConfig> {
    const { data } = await this.request<AgentConfig>(
      'PUT',
      `/api/agents/${configId}`,
      input,
    );
    return data;
  }

  async deleteAgentConfig(configId: string): Promise<{ ok: true }> {
    const { data } = await this.request<{ ok: true }>(
      'DELETE',
      `/api/agents/${configId}`,
    );
    return data;
  }

  async sendAgentMessage(
    configId: string,
    input: SendMessageInput,
  ): Promise<AgentChatResponse> {
    const { data } = await this.request<AgentChatResponse>(
      'POST',
      `/api/agents/${configId}/chat`,
      input,
    );
    return data;
  }

  async listAgentSessions(
    configId: string,
    params?: PaginationParams,
  ): Promise<PaginatedResult<AgentSession>> {
    const query = this.buildQuery({
      limit: params?.limit,
      cursor: params?.cursor,
    });
    return this.requestPaginated<AgentSession>(
      'GET',
      `/api/agents/${configId}/sessions${query}`,
      'sessions',
    );
  }

  async getAgentSession(sessionId: string): Promise<AgentSession> {
    const { data } = await this.request<AgentSession>(
      'GET',
      `/api/agents/sessions/${sessionId}`,
    );
    return data;
  }

  async getAgentSessionMessages(
    sessionId: string,
    params?: PaginationParams,
  ): Promise<PaginatedResult<AgentMessage>> {
    const query = this.buildQuery({
      limit: params?.limit,
      cursor: params?.cursor,
    });
    return this.requestPaginated<AgentMessage>(
      'GET',
      `/api/agents/sessions/${sessionId}/messages${query}`,
      'messages',
    );
  }

  async deleteAgentSession(sessionId: string): Promise<{ ok: true }> {
    const { data } = await this.request<{ ok: true }>(
      'DELETE',
      `/api/agents/sessions/${sessionId}`,
    );
    return data;
  }

  async getAgentUsage(configId: string): Promise<AgentUsage> {
    const { data } = await this.request<AgentUsage>(
      'GET',
      `/api/agents/${configId}/usage`,
    );
    return data;
  }

  async getProjectAgentUsage(
    projectUri: string,
  ): Promise<ProjectAgentUsage> {
    const encoded = encodeAtUri(projectUri);
    const { data } = await this.request<ProjectAgentUsage>(
      'GET',
      `/api/projects/${encoded}/agent-usage`,
    );
    return data;
  }

  async listAgentTemplates(): Promise<{ templates: AgentTemplate[] }> {
    const { data } = await this.request<{ templates: AgentTemplate[] }>(
      'GET',
      '/api/agents/templates',
    );
    return data;
  }

  async listAgentTools(): Promise<{ tools: AgentTool[] }> {
    const { data } = await this.request<{ tools: AgentTool[] }>(
      'GET',
      '/api/agents/tools',
    );
    return data;
  }

  async listAgentModels(): Promise<{ models: AgentModel[] }> {
    const { data } = await this.request<{ models: AgentModel[] }>(
      'GET',
      '/api/agents/models',
    );
    return data;
  }

  // =====================================================================
  // OIDC
  // =====================================================================

  async registerOidcClient(
    input: RegisterOidcClientInput,
  ): Promise<OidcClient> {
    const { data } = await this.request<OidcClient>(
      'POST',
      '/api/oidc/clients',
      input,
    );
    return data;
  }

  async listOidcClients(): Promise<{ clients: OidcClient[] }> {
    const { data } = await this.request<{ clients: OidcClient[] }>(
      'GET',
      '/api/oidc/clients',
    );
    return data;
  }

  async getOidcClient(clientId: string): Promise<OidcClient> {
    const { data } = await this.request<OidcClient>(
      'GET',
      `/api/oidc/clients/${clientId}`,
    );
    return data;
  }

  async deleteOidcClient(clientId: string): Promise<{ ok: true }> {
    const { data } = await this.request<{ ok: true }>(
      'DELETE',
      `/api/oidc/clients/${clientId}`,
    );
    return data;
  }

  // =====================================================================
  // CLI Auth
  // =====================================================================

  async cliInitLogin(handle: string): Promise<CliLoginInitResponse> {
    const { data } = await this.request<CliLoginInitResponse>(
      'POST',
      '/auth/cli/sessions',
      { handle },
    );
    return data;
  }

  async cliPollLogin(sessionId: string): Promise<CliLoginStatusResponse> {
    const { data } = await this.request<CliLoginStatusResponse>(
      'GET',
      `/auth/cli/sessions/${sessionId}/status`,
    );
    return data;
  }

  async cliExchangeCode(
    sessionId: string,
    code: string,
  ): Promise<{ did: string; handle: string | null; cookie: string }> {
    const response = await fetch(
      `${this.baseUrl}/auth/cli/sessions/${sessionId}/exchange`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
        redirect: 'manual',
      },
    );

    if (!response.ok) {
      let errorBody: { error?: string; message?: string } = {};
      try {
        errorBody = (await response.json()) as { error?: string; message?: string };
      } catch {
        // response may not be JSON
      }
      throw new ApiError(
        response.status,
        errorBody.error ?? 'UnknownError',
        errorBody.message ?? `HTTP ${response.status}`,
      );
    }

    const setCookie = response.headers.get('set-cookie') ?? '';
    const data = (await response.json()) as { did: string; handle: string | null };

    return {
      did: data.did,
      handle: data.handle,
      cookie: setCookie,
    };
  }
}
