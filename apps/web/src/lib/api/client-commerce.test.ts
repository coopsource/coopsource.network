import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./client.js";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("commerce API client contracts", () => {
  it("preserves the named collection returned by each commerce endpoint", async () => {
    const responses = [
      { listings: [{ id: "listing-1" }], cursor: "listing-cursor" },
      { needs: [{ id: "need-1" }], cursor: "need-cursor" },
      { agreements: [{ id: "agreement-1" }], cursor: "agreement-cursor" },
      { projects: [{ id: "project-1" }], cursor: "project-cursor" },
      { resources: [{ id: "resource-1" }], cursor: "resource-cursor" },
    ];
    const fetchFn = vi.fn<typeof fetch>();
    for (const response of responses) {
      fetchFn.mockResolvedValueOnce(jsonResponse(response));
    }
    const api = createApiClient(fetchFn, "session=test", "https://api.example");

    await expect(api.getCommerceListings()).resolves.toEqual(responses[0]);
    await expect(api.getCommerceNeeds()).resolves.toEqual(responses[1]);
    await expect(api.getIntercoopAgreements()).resolves.toEqual(responses[2]);
    await expect(api.getCollaborativeProjects()).resolves.toEqual(responses[3]);
    await expect(api.getSharedResources()).resolves.toEqual(responses[4]);

    expect(fetchFn.mock.calls.map(([url]) => url)).toEqual([
      "https://api.example/api/v1/commerce/listings",
      "https://api.example/api/v1/commerce/needs",
      "https://api.example/api/v1/commerce/agreements",
      "https://api.example/api/v1/commerce/projects",
      "https://api.example/api/v1/commerce/resources",
    ]);
  });

  it("maps marketplace search text to the API q parameter", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ listings: [], cursor: null }));
    const api = createApiClient(fetchFn, undefined, "https://api.example");

    await api.searchCommerceListings({
      category: "services",
      location: "Portland",
      query: "worker ownership",
      limit: 24,
      cursor: "next-page",
    });

    expect(fetchFn).toHaveBeenCalledOnce();
    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      "https://api.example/api/v1/commerce/listings/search?category=services&location=Portland&q=worker+ownership&limit=24&cursor=next-page",
    );
  });
});
