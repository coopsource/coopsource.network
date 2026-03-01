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

export function createApiClient(fetchFn: typeof fetch, cookie?: string) {
  const apiBase = process.env.API_URL ?? 'http://localhost:3001';

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
    return fetchFn(`${apiBase}/api/v1${path}`, {
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
      request<void>(`/agreements/${encodeURIComponent(uri)}/sign`, { method: 'DELETE' }),

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

    getExploreNetworks: (params?: { limit?: number; cursor?: string }) => {
      const qs = new URLSearchParams();
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      return request<ExploreNetworksResponse>(`/explore/networks${qs.size ? `?${qs}` : ''}`);
    },
  };
}
