import type {
  AuthUser,
  CoopEntity,
  Member,
  Invitation,
  Proposal,
  Agreement,
  Vote,
  SetupStatus,
  MembersResponse,
  InvitationsResponse,
  ProposalsResponse,
  AgreementsResponse,
  VotesResponse,
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

    // Co-op
    getCooperative: () => request<CoopEntity>('/cooperative'),

    updateCooperative: (body: {
      displayName?: string;
      description?: string;
      website?: string;
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

    // Agreements
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
      body: string;
      agreementType?: string;
    }) =>
      request<Agreement>('/agreements', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    getAgreement: (id: string) => request<Agreement>(`/agreements/${id}`),

    updateAgreement: (
      id: string,
      body: Partial<{ title: string; body: string }>,
    ) =>
      request<Agreement>(`/agreements/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),

    openAgreement: (id: string) =>
      request<Agreement>(`/agreements/${id}/open`, { method: 'POST' }),

    signAgreement: (id: string, body?: { signatureType?: string }) =>
      request<Agreement>(`/agreements/${id}/sign`, {
        method: 'POST',
        body: JSON.stringify(body ?? {}),
      }),

    retractSignature: (id: string) =>
      request<void>(`/agreements/${id}/sign`, { method: 'DELETE' }),

    voidAgreement: (id: string) =>
      request<Agreement>(`/agreements/${id}/void`, { method: 'POST' }),
  };
}
