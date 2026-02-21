import { vi } from 'vitest';
import { CoopSourceClient } from '../src/client.js';

export const BASE_URL = 'http://localhost:3001';
export const COOKIE = 'connect.sid=abc';

export const PROJECT_URI = 'at://did:plc:abc/network.coopsource.org.project/123';
export const COOP_URI = 'at://did:plc:abc/network.coopsource.org.cooperative/xyz';
export const PROPOSAL_URI = 'at://did:plc:abc/network.coopsource.governance.proposal/456';
export const AGREEMENT_URI = 'at://did:plc:abc/network.coopsource.agreement.master/agr1';
export const AMENDMENT_URI = 'at://did:plc:abc/network.coopsource.agreement.amendment/amd1';
export const INTEREST_URI = 'at://did:plc:abc/network.coopsource.alignment.interest/int1';
export const MEMBERSHIP_URI = 'at://did:plc:abc/network.coopsource.org.membership/mem1';
export const CONNECTION_URI = 'at://did:plc:abc/network.coopsource.connection.external/conn1';
export const CAMPAIGN_URI = 'at://did:plc:abc/network.coopsource.funding.campaign/camp1';
export const PLEDGE_URI = 'at://did:plc:abc/network.coopsource.funding.pledge/pledge1';
export const DELEGATION_URI = 'at://did:plc:abc/network.coopsource.governance.delegation/del1';

export const ENCODED_PROJECT_URI = encodeURIComponent(PROJECT_URI);
export const ENCODED_COOP_URI = encodeURIComponent(COOP_URI);
export const ENCODED_PROPOSAL_URI = encodeURIComponent(PROPOSAL_URI);
export const ENCODED_AGREEMENT_URI = encodeURIComponent(AGREEMENT_URI);
export const ENCODED_AMENDMENT_URI = encodeURIComponent(AMENDMENT_URI);
export const ENCODED_INTEREST_URI = encodeURIComponent(INTEREST_URI);
export const ENCODED_MEMBERSHIP_URI = encodeURIComponent(MEMBERSHIP_URI);
export const ENCODED_CONNECTION_URI = encodeURIComponent(CONNECTION_URI);
export const ENCODED_CAMPAIGN_URI = encodeURIComponent(CAMPAIGN_URI);
export const ENCODED_PLEDGE_URI = encodeURIComponent(PLEDGE_URI);
export const ENCODED_DELEGATION_URI = encodeURIComponent(DELEGATION_URI);

export function mockOkResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => data,
    headers: new Headers(),
  } as unknown as Response;
}

export function mockErrorResponse(
  status: number,
  body: { error?: string; message?: string },
): Response {
  return {
    ok: false,
    status,
    json: async () => body,
    headers: new Headers(),
  } as unknown as Response;
}

export function mock204Response(): Response {
  return {
    ok: true,
    status: 204,
    headers: new Headers(),
  } as unknown as Response;
}

export function createMockFetchAndClient() {
  const mockFetch = vi.fn<(...args: unknown[]) => Promise<Response>>();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  const client = new CoopSourceClient(BASE_URL, { cookie: COOKIE });

  return {
    mockFetch,
    client,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}
