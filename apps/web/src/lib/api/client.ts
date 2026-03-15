import type {
  AuthUser,
  CoopEntity,
  Member,
  Invitation,
  Proposal,
  Agreement,
  AgreementTemplate,
  AgreementTemplatesResponse,
  Vote,
  SetupStatus,
  MembersResponse,
  InvitationsResponse,
  ProposalsResponse,
  AgreementsResponse,
  VotesResponse,
  Thread,
  Post,
  ThreadsResponse,
  PostsResponse,
  Network,
  NetworksResponse,
  NetworkMembersResponse,
  Campaign,
  Pledge,
  CampaignsResponse,
  PledgesResponse,
  PaymentProvidersResponse,
  PaymentConfigsResponse,
  PaymentProviderConfig,
  PaymentProviderInfo,
  CheckoutResponse,
  StakeholderInterest,
  DesiredOutcome,
  InterestMap,
  InterestsListResponse,
  OutcomesResponse,
  StakeholderTerms,
  StakeholderTermsResponse,
  ExternalConnection,
  ConnectionBinding,
  AvailableServicesResponse,
  ConnectionsResponse,
  BindingsResponse,
  ExploreCooperativesResponse,
  ExploreCooperativeDetail,
  ExploreNetworksResponse,
  MyMembershipsResponse,
  AgentConfig,
  AgentsResponse,
  AgentSessionsResponse,
  AgentMessagesResponse,
  ChatResult,
  ModelProvidersResponse,
  ModelProviderConfig,
  AvailableModelsResponse,
  ApiToken,
  ApiTokensResponse,
  NotificationsResponse,
  UnreadCountResponse,
  AgentTriggersResponse,
  AgentTrigger,
  TriggerExecutionsResponse,
  LegalDocument,
  LegalDocumentsResponse,
  MeetingRecord,
  MeetingRecordsResponse,
  Officer,
  OfficersResponse,
  ComplianceItem,
  ComplianceItemsResponse,
  MemberNotice,
  MemberNoticesResponse,
  FiscalPeriod,
  FiscalPeriodsResponse,
  OnboardingConfig,
  OnboardingProgress,
  OnboardingProgressResponse,
  OnboardingReview,
  OnboardingReviewsResponse,
  PatronageConfig,
  PatronageConfigsResponse,
  PatronageRecordsResponse,
  CapitalAccount,
  CapitalAccountsResponse,
  CapitalAccountSummary,
  CapitalTransactionsResponse,
  TaxForm1099,
  TaxFormsResponse,
  Delegation,
  DelegationsResponse,
  DelegationChain,
  VoteWeightResponse,
  GovernanceFeedResponse,
  MemberClass,
  MemberClassesResponse,
  CooperativeLink,
  CooperativeLinksResponse,
  CooperativePartner,
} from './types.js';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function createApiClient(fetchFn: typeof fetch, cookie?: string, apiBase?: string) {
  const base = apiBase
    ?? (typeof process !== 'undefined' ? process.env?.API_URL : undefined)
    ?? 'http://localhost:3001';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (cookie) {
    headers['Cookie'] = cookie;
  }

  async function rawRequest(
    path: string,
    options: RequestInit = {},
  ): Promise<Response> {
    return fetchFn(`${base}/api/v1${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        ...headers,
        ...(options.headers as Record<string, string>),
      },
    });
  }

  async function request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const res = await rawRequest(path, options);

    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { error?: string; message?: string };
        message = body.error ?? body.message ?? message;
      } catch {
        // ignore parse errors
      }
      throw new ApiError(res.status, message);
    }

    if (res.status === 204) {
      return undefined as T;
    }

    return res.json() as Promise<T>;
  }

  return {
    // Setup
    getSetupStatus: () => request<SetupStatus>('/setup/status'),

    setupInitialize: (body: {
      cooperativeName: string;
      cooperativeHandle: string;
      adminDisplayName: string;
      adminHandle: string;
      adminEmail: string;
      adminPassword: string;
    }) =>
      request<{ cooperative: CoopEntity; admin: AuthUser; token: string }>(
        '/setup/initialize',
        { method: 'POST', body: JSON.stringify(body) },
      ),

    // Auth
    register: (body: {
      displayName: string;
      handle: string;
      email: string;
      password: string;
    }) =>
      request<{ entity: AuthUser; token: string }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    registerRaw: (body: {
      displayName: string;
      handle: string;
      email: string;
      password: string;
    }) =>
      rawRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    login: (body: { email: string; password: string }) =>
      request<AuthUser>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    // Returns raw Response so callers can extract Set-Cookie and forward it to the browser
    loginRaw: (body: { email: string; password: string }) =>
      rawRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    setupInitializeRaw: (body: {
      cooperativeName: string;
      cooperativeHandle: string;
      adminDisplayName: string;
      adminHandle: string;
      adminEmail: string;
      adminPassword: string;
    }) =>
      rawRequest('/setup/initialize', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    acceptInvitationRaw: (
      token: string,
      body: { displayName: string; handle: string; password: string },
    ) =>
      rawRequest(`/invitations/${token}/accept`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    logout: () =>
      request<void>('/auth/session', { method: 'DELETE' }),

    getMe: () => request<AuthUser>('/auth/me'),
    getMyMemberships: () => request<MyMembershipsResponse>('/me/memberships'),

    // Co-op
    getCooperative: () => request<CoopEntity>('/cooperative'),
    getCooperativeByHandle: (handle: string) =>
      request<CoopEntity>(`/cooperative/by-handle/${encodeURIComponent(handle)}`),

    updateCooperative: (body: {
      displayName?: string;
      description?: string;
      website?: string;
      publicDescription?: boolean;
      publicMembers?: boolean;
      publicActivity?: boolean;
      publicAgreements?: boolean;
      publicCampaigns?: boolean;
    }) =>
      request<CoopEntity>('/cooperative', {
        method: 'PUT',
        body: JSON.stringify(body),
      }),

    // Members
    getMembers: (params?: { limit?: number; cursor?: string }) => {
      const qs = new URLSearchParams();
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      return request<MembersResponse>(`/members${qs.size ? `?${qs}` : ''}`);
    },

    getMember: (did: string) => request<Member>(`/members/${encodeURIComponent(did)}`),

    updateMemberRoles: (did: string, roles: string[]) =>
      request<Member>(`/members/${encodeURIComponent(did)}/roles`, {
        method: 'PUT',
        body: JSON.stringify({ roles }),
      }),

    removeMember: (did: string) =>
      request<void>(`/members/${encodeURIComponent(did)}`, { method: 'DELETE' }),

    // Invitations
    getInvitations: (params?: { limit?: number; cursor?: string }) => {
      const qs = new URLSearchParams();
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      return request<InvitationsResponse>(`/invitations${qs.size ? `?${qs}` : ''}`);
    },

    createInvitation: (body: {
      email: string;
      roles?: string[];
      message?: string;
    }) =>
      request<Invitation>('/invitations', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    getInvitation: (token: string) =>
      request<Invitation>(`/invitations/${token}`),

    acceptInvitation: (
      token: string,
      body: { displayName: string; handle: string; password: string },
    ) =>
      request<{ member: Member }>(`/invitations/${token}/accept`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    revokeInvitation: (id: string) =>
      request<void>(`/invitations/${id}`, { method: 'DELETE' }),

    // Proposals
    getProposals: (params?: {
      status?: string;
      limit?: number;
      cursor?: string;
    }) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set('status', params.status);
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      return request<ProposalsResponse>(`/proposals${qs.size ? `?${qs}` : ''}`);
    },

    createProposal: (body: {
      title: string;
      body: string;
      votingType?: string;
      quorumType?: string;
      quorumBasis?: string;
      quorumThreshold?: number;
      closesAt?: string;
      tags?: string[];
    }) =>
      request<Proposal>('/proposals', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    getProposal: (id: string) => request<Proposal>(`/proposals/${id}`),

    updateProposal: (
      id: string,
      body: Partial<{
        title: string;
        body: string;
        proposalType: string;
        votingMethod: string;
        quorumRequired: number;
        votingEndsAt: string;
      }>,
    ) =>
      request<Proposal>(`/proposals/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),

    deleteProposal: (id: string) =>
      request<void>(`/proposals/${id}`, { method: 'DELETE' }),

    openProposal: (id: string) =>
      request<Proposal>(`/proposals/${id}/open`, { method: 'POST' }),

    closeProposal: (id: string) =>
      request<Proposal>(`/proposals/${id}/close`, { method: 'POST' }),

    resolveProposal: (id: string) =>
      request<Proposal>(`/proposals/${id}/resolve`, { method: 'POST' }),

    getVotes: (proposalId: string) =>
      request<VotesResponse>(`/proposals/${proposalId}/votes`),

    castVote: (
      proposalId: string,
      body: { choice: 'yes' | 'no' | 'abstain'; rationale?: string },
    ) =>
      request<Vote>(`/proposals/${proposalId}/vote`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    retractVote: (proposalId: string) =>
      request<void>(`/proposals/${proposalId}/vote`, { method: 'DELETE' }),

    // Agreements (unified)
    getAgreements: (params?: {
      status?: string;
      limit?: number;
      cursor?: string;
    }) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set('status', params.status);
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      return request<AgreementsResponse>(`/agreements${qs.size ? `?${qs}` : ''}`);
    },

    createAgreement: (body: {
      title: string;
      body?: string;
      agreementType?: string;
      purpose?: string;
      scope?: string;
      governanceFramework?: Record<string, unknown>;
      disputeResolution?: Record<string, unknown>;
      amendmentProcess?: Record<string, unknown>;
      terminationConditions?: Record<string, unknown>;
    }) =>
      request<Agreement>('/agreements', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    getAgreement: (uri: string) =>
      request<Agreement>(`/agreements/${encodeURIComponent(uri)}`),

    updateAgreement: (uri: string, body: Record<string, unknown>) =>
      request<Agreement>(`/agreements/${encodeURIComponent(uri)}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),

    openAgreement: (uri: string) =>
      request<Agreement>(`/agreements/${encodeURIComponent(uri)}/open`, { method: 'POST' }),

    activateAgreement: (uri: string) =>
      request<Agreement>(`/agreements/${encodeURIComponent(uri)}/activate`, { method: 'POST' }),

    terminateAgreement: (uri: string) =>
      request<Agreement>(`/agreements/${encodeURIComponent(uri)}/terminate`, { method: 'POST' }),

    signAgreement: (uri: string, body?: { statement?: string }) =>
      request<Agreement>(`/agreements/${encodeURIComponent(uri)}/sign`, {
        method: 'POST',
        body: JSON.stringify(body ?? {}),
      }),

    retractSignature: (uri: string) =>
      request<void>(`/agreements/${encodeURIComponent(uri)}/sign`, { method: 'DELETE', body: JSON.stringify({}) }),

    voidAgreement: (uri: string) =>
      request<Agreement>(`/agreements/${encodeURIComponent(uri)}/void`, { method: 'POST' }),

    addStakeholderTerms: (agreementUri: string, body: {
      stakeholderDid: string;
      stakeholderType: string;
      stakeholderClass?: string;
      contributions?: Array<{ type: string; description: string; value?: string }>;
      financialTerms?: Record<string, unknown>;
      ipTerms?: Record<string, unknown>;
      governanceRights?: Record<string, unknown>;
      exitTerms?: Record<string, unknown>;
    }) =>
      request<StakeholderTerms>(`/agreements/${encodeURIComponent(agreementUri)}/terms`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    listStakeholderTerms: (agreementUri: string) =>
      request<StakeholderTermsResponse>(`/agreements/${encodeURIComponent(agreementUri)}/terms`),

    removeStakeholderTerms: (agreementUri: string, termsUri: string) =>
      request<void>(`/agreements/${encodeURIComponent(agreementUri)}/terms/${encodeURIComponent(termsUri)}`, {
        method: 'DELETE',
      }),

    // Agreement Templates
    getAgreementTemplates: (params?: { limit?: number; cursor?: string }) => {
      const qs = new URLSearchParams();
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      return request<AgreementTemplatesResponse>(`/agreement-templates${qs.size ? `?${qs}` : ''}`);
    },

    getAgreementTemplate: (id: string) =>
      request<AgreementTemplate>(`/agreement-templates/${id}`),

    createAgreementTemplate: (body: {
      name: string;
      description?: string;
      agreementType?: string;
      templateData?: Record<string, unknown>;
    }) =>
      request<AgreementTemplate>('/agreement-templates', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    updateAgreementTemplate: (id: string, body: Record<string, unknown>) =>
      request<AgreementTemplate>(`/agreement-templates/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),

    deleteAgreementTemplate: (id: string) =>
      request<void>(`/agreement-templates/${id}`, { method: 'DELETE' }),

    useAgreementTemplate: (id: string) =>
      request<Agreement>(`/agreement-templates/${id}/use`, { method: 'POST' }),

    // Threads & Posts
    getThreads: (params?: { limit?: number; cursor?: string }) => {
      const qs = new URLSearchParams();
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      return request<ThreadsResponse>(`/threads${qs.size ? `?${qs}` : ''}`);
    },

    createThread: (body: { title?: string; threadType?: string; memberDids?: string[] }) =>
      request<Thread>('/threads', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    getThread: (id: string) => request<Thread & { members: string[]; cooperativeDid: string; createdBy: string }>(`/threads/${id}`),

    getThreadPosts: (id: string, params?: { limit?: number; cursor?: string }) => {
      const qs = new URLSearchParams();
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      return request<PostsResponse>(`/threads/${id}/posts${qs.size ? `?${qs}` : ''}`);
    },

    createPost: (threadId: string, body: { body: string; parentPostId?: string }) =>
      request<Post>(`/threads/${threadId}/posts`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    deletePost: (id: string) =>
      request<void>(`/posts/${id}`, { method: 'DELETE' }),

    // Networks
    getNetworks: (params?: { limit?: number; cursor?: string }) => {
      const qs = new URLSearchParams();
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      return request<NetworksResponse>(`/networks${qs.size ? `?${qs}` : ''}`);
    },

    createNetwork: (body: { name: string; description?: string; handle?: string }) =>
      request<{ did: string }>('/networks', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    getNetwork: (did: string) => request<Network>(`/networks/${encodeURIComponent(did)}`),

    getNetworkMembers: (did: string, params?: { limit?: number; cursor?: string }) => {
      const qs = new URLSearchParams();
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      return request<NetworkMembersResponse>(`/networks/${encodeURIComponent(did)}/members${qs.size ? `?${qs}` : ''}`);
    },

    joinNetwork: (did: string) =>
      request<{ ok: true }>(`/networks/${encodeURIComponent(did)}/join`, { method: 'POST' }),

    leaveNetwork: (did: string) =>
      request<void>(`/networks/${encodeURIComponent(did)}/leave`, { method: 'DELETE' }),

    // Campaigns
    getCampaigns: (params?: { status?: string; cooperativeDid?: string; limit?: number; cursor?: string }) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set('status', params.status);
      if (params?.cooperativeDid) qs.set('cooperativeDid', params.cooperativeDid);
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      return request<CampaignsResponse>(`/campaigns${qs.size ? `?${qs}` : ''}`);
    },

    getCampaign: (uri: string) =>
      request<Campaign>(`/campaigns/${encodeURIComponent(uri)}`),

    createCampaign: (body: {
      beneficiaryUri: string;
      title: string;
      description?: string;
      tier: string;
      campaignType: string;
      goalAmount: number;
      goalCurrency?: string;
      fundingModel?: string;
      startDate?: string;
      endDate?: string;
    }) =>
      request<Campaign>('/campaigns', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    updateCampaign: (uri: string, body: Record<string, unknown>) =>
      request<Campaign>(`/campaigns/${encodeURIComponent(uri)}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),

    updateCampaignStatus: (uri: string, status: string) =>
      request<Campaign>(`/campaigns/${encodeURIComponent(uri)}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      }),

    createPledge: (campaignUri: string, body: { amount: number; currency?: string }) =>
      request<Pledge>(`/campaigns/${encodeURIComponent(campaignUri)}/pledge`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    getPledges: (campaignUri: string, params?: { limit?: number; cursor?: string }) => {
      const qs = new URLSearchParams();
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      return request<PledgesResponse>(`/campaigns/${encodeURIComponent(campaignUri)}/pledges${qs.size ? `?${qs}` : ''}`);
    },

    // Payment providers
    getPaymentProviders: (campaignUri: string) =>
      request<PaymentProvidersResponse>(`/campaigns/${encodeURIComponent(campaignUri)}/providers`),

    createCheckout: (campaignUri: string, pledgeUri: string, providerId: string, successUrl: string, cancelUrl: string) =>
      request<CheckoutResponse>(`/campaigns/${encodeURIComponent(campaignUri)}/checkout`, {
        method: 'POST',
        body: JSON.stringify({ pledgeUri, providerId, successUrl, cancelUrl }),
      }),

    // Payment provider admin config
    getPaymentConfigs: () =>
      request<PaymentConfigsResponse>('/payment-providers'),

    getSupportedProviders: () =>
      request<{ providers: PaymentProviderInfo[] }>('/payment-providers/supported'),

    addPaymentConfig: (body: {
      providerId: string;
      displayName: string;
      credentials: Record<string, string>;
      webhookSecret?: string;
      config?: Record<string, unknown>;
    }) =>
      request<PaymentProviderConfig>('/payment-providers', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    updatePaymentConfig: (providerId: string, body: {
      displayName?: string;
      enabled?: boolean;
      credentials?: Record<string, string>;
      webhookSecret?: string;
      config?: Record<string, unknown>;
    }) =>
      request<PaymentProviderConfig>(`/payment-providers/${encodeURIComponent(providerId)}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),

    deletePaymentConfig: (providerId: string) =>
      request<void>(`/payment-providers/${encodeURIComponent(providerId)}`, { method: 'DELETE' }),

    // Alignment — Interests
    submitInterests: (body: {
      interests: Array<{ category: string; description: string; priority: number; scope?: string }>;
      contributions?: Array<{ type: string; description: string; capacity?: string }>;
      constraints?: Array<{ description: string; hardConstraint?: boolean }>;
      redLines?: Array<{ description: string; reason?: string }>;
      preferences?: { decisionMaking?: string; communication?: string; pace?: string };
    }) =>
      request<StakeholderInterest>('/alignment/interests', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    getInterests: () =>
      request<InterestsListResponse>('/alignment/interests'),

    getMyInterests: () =>
      request<StakeholderInterest | null>('/alignment/interests/me'),

    updateInterests: (body: {
      interests?: Array<{ category: string; description: string; priority: number; scope?: string }>;
      contributions?: Array<{ type: string; description: string; capacity?: string }>;
      constraints?: Array<{ description: string; hardConstraint?: boolean }>;
      redLines?: Array<{ description: string; reason?: string }>;
      preferences?: { decisionMaking?: string; communication?: string; pace?: string };
    }) =>
      request<StakeholderInterest>('/alignment/interests', {
        method: 'PUT',
        body: JSON.stringify(body),
      }),

    // Alignment — Outcomes
    createOutcome: (body: {
      title: string;
      description?: string;
      category: string;
      successCriteria?: Array<{ metric: string; target: string; timeline?: string }>;
    }) =>
      request<DesiredOutcome>('/alignment/outcomes', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    listOutcomes: (params?: { status?: string; limit?: number; cursor?: string }) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set('status', params.status);
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      return request<OutcomesResponse>(`/alignment/outcomes${qs.size ? `?${qs}` : ''}`);
    },

    getOutcome: (uri: string) =>
      request<DesiredOutcome>(`/alignment/outcomes/${encodeURIComponent(uri)}`),

    supportOutcome: (uri: string, body: { level: string; conditions?: string }) =>
      request<DesiredOutcome>(`/alignment/outcomes/${encodeURIComponent(uri)}/support`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    updateOutcomeStatus: (uri: string, status: string) =>
      request<DesiredOutcome>(`/alignment/outcomes/${encodeURIComponent(uri)}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      }),

    // Alignment — Map
    generateMap: () =>
      request<InterestMap>('/alignment/map/generate', { method: 'POST' }),

    getMap: () =>
      request<InterestMap | null>('/alignment/map'),

    // Connections
    getConnections: () =>
      request<ConnectionsResponse>('/connections'),

    getAvailableServices: () =>
      request<AvailableServicesResponse>('/connections/available'),

    initiateConnection: (service: string) =>
      request<{ authUrl: string; state: string }>('/connections/initiate', {
        method: 'POST',
        body: JSON.stringify({ service }),
      }),

    revokeConnection: (uri: string) =>
      request<void>(`/connections/${encodeURIComponent(uri)}`, { method: 'DELETE' }),

    bindResource: (connectionUri: string, body: {
      projectUri: string;
      resourceType: string;
      resourceId: string;
      metadata?: Record<string, unknown>;
    }) =>
      request<ConnectionBinding>(`/connections/${encodeURIComponent(connectionUri)}/bind`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    listBindings: (connectionUri: string) =>
      request<BindingsResponse>(`/connections/${encodeURIComponent(connectionUri)}/bindings`),

    removeBinding: (uri: string) =>
      request<void>(`/connections/bindings/${encodeURIComponent(uri)}`, { method: 'DELETE' }),

    // Explore (public, no auth needed)
    getExploreCooperatives: (params?: { limit?: number; cursor?: string }) => {
      const qs = new URLSearchParams();
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      return request<ExploreCooperativesResponse>(`/explore/cooperatives${qs.size ? `?${qs}` : ''}`);
    },

    getExploreCooperative: (handle: string) =>
      request<ExploreCooperativeDetail>(`/explore/cooperatives/${encodeURIComponent(handle)}`),

    // ── Agents ──────────────────────────────────────────────────────────────
    getAgents: (cursor?: string) => {
      const qs = cursor ? `?cursor=${cursor}` : '';
      return request<AgentsResponse>(`/agents${qs}`);
    },

    getAgent: (id: string) => request<AgentConfig>(`/agents/${id}`),

    createAgent: (body: Record<string, unknown>) =>
      request<AgentConfig>('/agents', { method: 'POST', body: JSON.stringify(body) }),

    createAgentFromTemplate: (body: { agentType: string; name?: string; monthlyBudgetCents?: number }) =>
      request<AgentConfig>('/agents/from-template', { method: 'POST', body: JSON.stringify(body) }),

    updateAgent: (id: string, body: Record<string, unknown>) =>
      request<AgentConfig>(`/agents/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

    deleteAgent: (id: string) =>
      request<void>(`/agents/${id}`, { method: 'DELETE' }),

    getAvailableModels: () => request<AvailableModelsResponse>('/agents/models'),

    sendAgentMessage: (agentId: string, body: { message: string; sessionId?: string; model?: string }) =>
      request<ChatResult>(`/agents/${agentId}/chat`, { method: 'POST', body: JSON.stringify(body) }),

    getAgentSessions: (agentId: string, cursor?: string) => {
      const qs = cursor ? `?cursor=${cursor}` : '';
      return request<AgentSessionsResponse>(`/agents/${agentId}/sessions${qs}`);
    },

    getSessionMessages: (sessionId: string, cursor?: string) => {
      const qs = cursor ? `?cursor=${cursor}` : '';
      return request<AgentMessagesResponse>(`/agents/sessions/${sessionId}/messages${qs}`);
    },

    closeSession: (sessionId: string) =>
      request<void>(`/agents/sessions/${sessionId}`, { method: 'DELETE' }),

    getAgentUsage: (agentId: string, period?: string) => {
      const qs = period ? `?period=${period}` : '';
      return request<{ usage: unknown }>(`/agents/${agentId}/usage${qs}`);
    },

    // ── Model Providers ─────────────────────────────────────────────────
    getSupportedModelProviders: () => request<{ providers: unknown[] }>('/model-providers/supported'),

    getModelProviders: () => request<ModelProvidersResponse>('/model-providers'),

    addModelProvider: (body: Record<string, unknown>) =>
      request<ModelProviderConfig>('/model-providers', { method: 'POST', body: JSON.stringify(body) }),

    updateModelProvider: (providerId: string, body: Record<string, unknown>) =>
      request<ModelProviderConfig>(`/model-providers/${providerId}`, { method: 'PUT', body: JSON.stringify(body) }),

    removeModelProvider: (providerId: string) =>
      request<void>(`/model-providers/${providerId}`, { method: 'DELETE' }),

    // ── API Tokens ──────────────────────────────────────────────────────
    getApiTokens: () => request<ApiTokensResponse>('/api-tokens'),

    createApiToken: (body: { name: string; scopes?: string[]; expiresInDays?: number }) =>
      request<ApiToken>('/api-tokens', { method: 'POST', body: JSON.stringify(body) }),

    revokeApiToken: (id: string) =>
      request<void>(`/api-tokens/${id}`, { method: 'DELETE' }),

    // Explore (public, no auth needed)
    getExploreNetworks: (params?: { limit?: number; cursor?: string }) => {
      const qs = new URLSearchParams();
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      return request<ExploreNetworksResponse>(`/explore/networks${qs.size ? `?${qs}` : ''}`);
    },

    // ── Notifications ─────────────────────────────────────────────────
    getNotifications: (params?: { limit?: number; cursor?: string }) => {
      const qs = new URLSearchParams();
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      return request<NotificationsResponse>(`/notifications${qs.size ? `?${qs}` : ''}`);
    },

    getUnreadCount: () => request<UnreadCountResponse>('/notifications/unread-count'),

    markNotificationRead: (id: string) =>
      request<void>(`/notifications/${id}/read`, { method: 'PUT' }),

    markAllNotificationsRead: () =>
      request<void>('/notifications/read-all', { method: 'PUT' }),

    // ── Agent Triggers ──────────────────────────────────────────────
    getAgentTriggers: (agentId: string) =>
      request<AgentTriggersResponse>(`/agents/${agentId}/triggers`),

    createAgentTrigger: (agentId: string, body: {
      eventType: string;
      conditions?: Array<{ field: string; operator: string; value: unknown }>;
      actions?: Array<{ type: string; config: Record<string, unknown> }>;
      promptTemplate?: string;
      cooldownSeconds?: number;
      enabled?: boolean;
    }) =>
      request<AgentTrigger>(`/agents/${agentId}/triggers`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    updateAgentTrigger: (triggerId: string, body: Record<string, unknown>) =>
      request<AgentTrigger>(`/agents/triggers/${triggerId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),

    deleteAgentTrigger: (triggerId: string) =>
      request<void>(`/agents/triggers/${triggerId}`, { method: 'DELETE' }),

    getTriggerExecutions: (triggerId: string, params?: { limit?: number; cursor?: string }) => {
      const qs = new URLSearchParams();
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      return request<TriggerExecutionsResponse>(`/agents/triggers/${triggerId}/executions${qs.size ? `?${qs}` : ''}`);
    },

    // ── Legal Documents ──────────────────────────────────────────────
    getLegalDocuments: (params?: { status?: string; documentType?: string; limit?: number; cursor?: string }) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set('status', params.status);
      if (params?.documentType) qs.set('documentType', params.documentType);
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      return request<LegalDocumentsResponse>(`/legal/documents${qs.size ? `?${qs}` : ''}`);
    },

    createLegalDocument: (body: {
      title: string;
      body?: string;
      documentType: string;
      bodyFormat?: string;
      status?: string;
    }) =>
      request<LegalDocument>('/legal/documents', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    getLegalDocument: (id: string) =>
      request<LegalDocument>(`/legal/documents/${id}`),

    updateLegalDocument: (id: string, body: {
      title?: string;
      body?: string;
      documentType?: string;
      status?: string;
    }) =>
      request<LegalDocument>(`/legal/documents/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),

    getMeetings: (params?: { meetingType?: string; limit?: number; cursor?: string }) => {
      const qs = new URLSearchParams();
      if (params?.meetingType) qs.set('meetingType', params.meetingType);
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      return request<MeetingRecordsResponse>(`/legal/meetings${qs.size ? `?${qs}` : ''}`);
    },

    createMeeting: (body: {
      title: string;
      meetingDate: string;
      meetingType: string;
      attendees?: string[];
      quorumMet?: boolean;
      resolutions?: string;
      minutes?: string;
    }) =>
      request<MeetingRecord>('/legal/meetings', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    certifyMeeting: (id: string) =>
      request<MeetingRecord>(`/legal/meetings/${id}/certify`, { method: 'POST' }),

    // ── Officers ─────────────────────────────────────────────────────
    getOfficers: (params?: { status?: string; limit?: number; cursor?: string }) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set('status', params.status);
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      return request<OfficersResponse>(`/admin/officers${qs.size ? `?${qs}` : ''}`);
    },
    appointOfficer: (body: { officerDid: string; title: string; appointedAt: string; appointmentType: string; termEndsAt?: string; responsibilities?: string }) =>
      request<Officer>('/admin/officers', { method: 'POST', body: JSON.stringify(body) }),
    endOfficerTerm: (id: string) =>
      request<Officer>(`/admin/officers/${id}/end-term`, { method: 'POST' }),

    // ── Compliance ───────────────────────────────────────────────────
    getComplianceItems: (params?: { status?: string; limit?: number; cursor?: string }) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set('status', params.status);
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      return request<ComplianceItemsResponse>(`/admin/compliance${qs.size ? `?${qs}` : ''}`);
    },
    createComplianceItem: (body: { title: string; description?: string; dueDate: string; filingType: string }) =>
      request<ComplianceItem>('/admin/compliance', { method: 'POST', body: JSON.stringify(body) }),
    completeComplianceItem: (id: string) =>
      request<ComplianceItem>(`/admin/compliance/${id}/complete`, { method: 'POST' }),

    // ── Notices ──────────────────────────────────────────────────────
    getNotices: (params?: { limit?: number; cursor?: string }) => {
      const qs = new URLSearchParams();
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      return request<MemberNoticesResponse>(`/admin/notices${qs.size ? `?${qs}` : ''}`);
    },
    createNotice: (body: { title: string; body: string; noticeType: string; targetAudience: string }) =>
      request<MemberNotice>('/admin/notices', { method: 'POST', body: JSON.stringify(body) }),

    // ── Fiscal Periods ───────────────────────────────────────────────
    getFiscalPeriods: (params?: { limit?: number; cursor?: string }) => {
      const qs = new URLSearchParams();
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      return request<FiscalPeriodsResponse>(`/admin/fiscal-periods${qs.size ? `?${qs}` : ''}`);
    },
    createFiscalPeriod: (body: { label: string; startsAt: string; endsAt: string }) =>
      request<FiscalPeriod>('/admin/fiscal-periods', { method: 'POST', body: JSON.stringify(body) }),
    closeFiscalPeriod: (id: string) =>
      request<FiscalPeriod>(`/admin/fiscal-periods/${id}/close`, { method: 'POST' }),

    // ── Onboarding ───────────────────────────────────────────────────
    getOnboardingConfig: () => request<OnboardingConfig | null>('/onboarding/config'),
    createOnboardingConfig: (body: { probationDurationDays?: number; requireTraining?: boolean; requireBuyIn?: boolean; buyInAmount?: number; buddySystemEnabled?: boolean; milestones?: Array<{ name: string; description?: string; order: number }> }) =>
      request<OnboardingConfig>('/onboarding/config', { method: 'POST', body: JSON.stringify(body) }),
    updateOnboardingConfig: (body: { probationDurationDays?: number; requireTraining?: boolean; requireBuyIn?: boolean; buyInAmount?: number; buddySystemEnabled?: boolean; milestones?: Array<{ name: string; description?: string; order: number }> }) =>
      request<OnboardingConfig>('/onboarding/config', { method: 'PUT', body: JSON.stringify(body) }),
    startOnboarding: (body: { memberDid: string }) =>
      request<OnboardingProgress>('/onboarding/start', { method: 'POST', body: JSON.stringify(body) }),
    getOnboardingProgress: (params?: { status?: string; limit?: number; cursor?: string }) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set('status', params.status);
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      return request<OnboardingProgressResponse>(`/onboarding/progress${qs.size ? `?${qs}` : ''}`);
    },
    getMemberOnboarding: (memberDid: string) =>
      request<OnboardingProgress | null>(`/onboarding/progress/${encodeURIComponent(memberDid)}`),
    completeTraining: (body: { memberDid: string }) =>
      request<OnboardingProgress>('/onboarding/training/complete', { method: 'POST', body: JSON.stringify(body) }),
    completeBuyIn: (body: { memberDid: string }) =>
      request<OnboardingProgress>('/onboarding/buy-in/complete', { method: 'POST', body: JSON.stringify(body) }),
    completeMilestone: (body: { memberDid: string; milestoneName: string }) =>
      request<OnboardingProgress>('/onboarding/milestone/complete', { method: 'POST', body: JSON.stringify(body) }),
    assignBuddy: (body: { memberDid: string; buddyDid: string }) =>
      request<OnboardingProgress>('/onboarding/buddy/assign', { method: 'POST', body: JSON.stringify(body) }),
    createOnboardingReview: (body: { memberDid: string; reviewType: string; outcome: string; comments?: string; milestoneName?: string }) =>
      request<OnboardingReview>('/onboarding/review', { method: 'POST', body: JSON.stringify(body) }),
    getOnboardingReviews: (memberDid: string) =>
      request<OnboardingReviewsResponse>(`/onboarding/reviews/${encodeURIComponent(memberDid)}`),
    completeOnboarding: (body: { memberDid: string }) =>
      request<OnboardingProgress>('/onboarding/complete', { method: 'POST', body: JSON.stringify(body) }),

    // ── Patronage ────────────────────────────────────────────────────
    getPatronageConfigs: () => request<PatronageConfigsResponse>('/financial/patronage/config'),
    createPatronageConfig: (body: { stakeholderClass?: string; metricType: string; metricWeights?: Record<string, number>; cashPayoutPct?: number }) =>
      request<PatronageConfig>('/financial/patronage/config', { method: 'POST', body: JSON.stringify(body) }),
    updatePatronageConfig: (id: string, body: { metricType?: string; metricWeights?: Record<string, number>; cashPayoutPct?: number }) =>
      request<PatronageConfig>(`/financial/patronage/config/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    deletePatronageConfig: (id: string) =>
      request<void>(`/financial/patronage/config/${id}`, { method: 'DELETE' }),
    runPatronageCalculation: (body: { fiscalPeriodId: string; totalSurplus: number; metrics: Array<{ memberDid: string; metricValue: number; stakeholderClass?: string }> }) =>
      request<{ records: PatronageRecordsResponse['records'] }>('/financial/patronage/calculate', { method: 'POST', body: JSON.stringify(body) }),
    getPatronageRecords: (params: { fiscalPeriodId: string; limit?: number; cursor?: string }) => {
      const qs = new URLSearchParams();
      qs.set('fiscalPeriodId', params.fiscalPeriodId);
      if (params.limit) qs.set('limit', String(params.limit));
      if (params.cursor) qs.set('cursor', params.cursor);
      return request<PatronageRecordsResponse>(`/financial/patronage/records?${qs}`);
    },
    approvePatronageRecords: (body: { fiscalPeriodId: string }) =>
      request<{ approved: number }>('/financial/patronage/records/approve', { method: 'POST', body: JSON.stringify(body) }),
    getMemberPatronageRecords: (memberDid: string, params?: { limit?: number; cursor?: string }) => {
      const qs = new URLSearchParams();
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      return request<PatronageRecordsResponse>(`/financial/patronage/records/member/${encodeURIComponent(memberDid)}${qs.size ? `?${qs}` : ''}`);
    },

    // ── Capital Accounts ─────────────────────────────────────────────
    recordContribution: (body: { memberDid: string; amount: number }) =>
      request<CapitalAccount>('/financial/capital-accounts/contribute', { method: 'POST', body: JSON.stringify(body) }),
    allocatePatronage: (body: { fiscalPeriodId: string }) =>
      request<{ allocated: number }>('/financial/capital-accounts/allocate', { method: 'POST', body: JSON.stringify(body) }),
    redeemAllocation: (body: { memberDid: string; amount: number }) =>
      request<CapitalAccount>('/financial/capital-accounts/redeem', { method: 'POST', body: JSON.stringify(body) }),
    getCapitalAccounts: (params?: { limit?: number; cursor?: string }) => {
      const qs = new URLSearchParams();
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      return request<CapitalAccountsResponse>(`/financial/capital-accounts${qs.size ? `?${qs}` : ''}`);
    },
    getCapitalAccountSummary: () => request<CapitalAccountSummary>('/financial/capital-accounts/summary'),
    getMemberCapitalAccount: (memberDid: string) =>
      request<CapitalAccount>(`/financial/capital-accounts/member/${encodeURIComponent(memberDid)}`),
    getMemberCapitalTransactions: (memberDid: string, params?: { limit?: number; cursor?: string }) => {
      const qs = new URLSearchParams();
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      return request<CapitalTransactionsResponse>(`/financial/capital-accounts/member/${encodeURIComponent(memberDid)}/transactions${qs.size ? `?${qs}` : ''}`);
    },

    // ── Tax Forms 1099-PATR ──────────────────────────────────────────
    generateTaxForms: (body: { fiscalPeriodId: string; taxYear: number }) =>
      request<TaxFormsResponse>('/financial/tax-forms/1099-patr/generate', { method: 'POST', body: JSON.stringify(body) }),
    getTaxForms: (params?: { taxYear?: number; status?: string; limit?: number; cursor?: string }) => {
      const qs = new URLSearchParams();
      if (params?.taxYear) qs.set('taxYear', String(params.taxYear));
      if (params?.status) qs.set('status', params.status);
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      return request<TaxFormsResponse>(`/financial/tax-forms/1099-patr${qs.size ? `?${qs}` : ''}`);
    },
    getTaxDeadlines: () => request<{ forms: TaxForm1099[] }>('/financial/tax-forms/1099-patr/deadlines'),
    getTaxForm: (id: string) => request<TaxForm1099>(`/financial/tax-forms/1099-patr/${id}`),
    markTaxFormGenerated: (id: string) =>
      request<TaxForm1099>(`/financial/tax-forms/1099-patr/${id}/mark-generated`, { method: 'POST' }),
    markTaxFormSent: (id: string) =>
      request<TaxForm1099>(`/financial/tax-forms/1099-patr/${id}/mark-sent`, { method: 'POST' }),
    recordTaxFormPayment: (id: string) =>
      request<TaxForm1099>(`/financial/tax-forms/1099-patr/${id}/record-payment`, { method: 'POST' }),

    // ── Delegations ──────────────────────────────────────────────────
    createDelegation: (body: { delegateeDid: string; scope?: string; proposalUri?: string }) =>
      request<Delegation>('/governance/delegations', { method: 'POST', body: JSON.stringify(body) }),
    revokeDelegation: (uri: string) =>
      request<Delegation>(`/governance/delegations/${encodeURIComponent(uri)}`, { method: 'DELETE' }),
    getDelegations: (params?: { status?: string; limit?: number; cursor?: string }) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set('status', params.status);
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      return request<DelegationsResponse>(`/governance/delegations${qs.size ? `?${qs}` : ''}`);
    },
    getDelegationChain: (memberDid: string, params?: { scope?: string; proposalUri?: string }) => {
      const qs = new URLSearchParams();
      if (params?.scope) qs.set('scope', params.scope);
      if (params?.proposalUri) qs.set('proposalUri', params.proposalUri);
      return request<DelegationChain>(`/governance/delegations/chain/${encodeURIComponent(memberDid)}${qs.size ? `?${qs}` : ''}`);
    },
    getVoteWeight: (memberDid: string, proposalId: string) =>
      request<VoteWeightResponse>(`/governance/vote-weight/${encodeURIComponent(memberDid)}?proposalId=${proposalId}`),

    // ── Governance Feed ──────────────────────────────────────────────
    getGovernanceActionItems: (params?: { limit?: number; cursor?: string }) => {
      const qs = new URLSearchParams();
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      return request<GovernanceFeedResponse>(`/governance/feed/action-items${qs.size ? `?${qs}` : ''}`);
    },
    getGovernanceOutcomes: (params?: { limit?: number; cursor?: string }) => {
      const qs = new URLSearchParams();
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      return request<GovernanceFeedResponse>(`/governance/feed/outcomes${qs.size ? `?${qs}` : ''}`);
    },
    getGovernanceMeetings: (params?: { limit?: number; cursor?: string }) => {
      const qs = new URLSearchParams();
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      return request<GovernanceFeedResponse>(`/governance/feed/meetings${qs.size ? `?${qs}` : ''}`);
    },

    // ── Member Classes ───────────────────────────────────────────────
    getMemberClasses: () => request<MemberClassesResponse>('/member-classes'),
    createMemberClass: (body: { name: string; description?: string; voteWeight?: number; quorumWeight?: number; boardSeats?: number }) =>
      request<MemberClass>('/member-classes', { method: 'POST', body: JSON.stringify(body) }),
    getMemberClass: (id: string) => request<MemberClass>(`/member-classes/${id}`),
    updateMemberClass: (id: string, body: { name?: string; description?: string; voteWeight?: number; quorumWeight?: number; boardSeats?: number }) =>
      request<MemberClass>(`/member-classes/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    deleteMemberClass: (id: string) => request<void>(`/member-classes/${id}`, { method: 'DELETE' }),
    assignMemberClass: (body: { memberDid: string; className: string }) =>
      request<{ memberDid: string; className: string }>('/member-classes/assign', { method: 'POST', body: JSON.stringify(body) }),
    removeMemberClass: (memberDid: string) =>
      request<{ memberDid: string; className: null }>(`/member-classes/assign/${encodeURIComponent(memberDid)}`, { method: 'DELETE' }),

    // ── Cooperative Links ────────────────────────────────────────────
    getCooperativeLinks: (params?: { status?: string; linkType?: string; limit?: number; cursor?: string }) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set('status', params.status);
      if (params?.linkType) qs.set('linkType', params.linkType);
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      return request<CooperativeLinksResponse>(`/cooperative-links${qs.size ? `?${qs}` : ''}`);
    },
    createCooperativeLink: (body: { targetDid: string; linkType: string; description?: string }) =>
      request<CooperativeLink>('/cooperative-links', { method: 'POST', body: JSON.stringify(body) }),
    getCooperativeLink: (id: string) => request<CooperativeLink>(`/cooperative-links/${id}`),
    respondToLink: (id: string, body: { accept: boolean; message?: string }) =>
      request<CooperativeLink>(`/cooperative-links/${id}/respond`, { method: 'POST', body: JSON.stringify(body) }),
    dissolveLink: (id: string) => request<CooperativeLink>(`/cooperative-links/${id}`, { method: 'DELETE' }),
    getPartners: () => request<{ partners: CooperativePartner[] }>('/cooperative-links/partners'),
  };
}
