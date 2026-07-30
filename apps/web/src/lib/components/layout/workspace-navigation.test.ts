import { describe, expect, it } from "vitest";
import type { CoopEntity, WorkspaceContext } from "$lib/api/types.js";
import {
  networkWorkspaceRoutes,
  workspaceHref,
  workspaceSettingsHref,
} from "./workspace-navigation.js";

function cooperative(overrides: Partial<CoopEntity> = {}): CoopEntity {
  return {
    did: "did:plc:example",
    handle: "example",
    displayName: "Example",
    description: null,
    website: null,
    status: "active",
    createdAt: "2026-07-30T00:00:00.000Z",
    ...overrides,
  };
}

function workspace(
  type: WorkspaceContext["type"],
  entity: CoopEntity | null = null,
): WorkspaceContext {
  const handle = type === "home" ? "me" : "example";
  const routeType = type === "network" ? "net" : type;
  return {
    type,
    handle,
    prefix: type === "home" ? "/me" : `/${routeType}/${handle}`,
    cooperative: entity,
  };
}

describe("workspace navigation routes", () => {
  it("exposes only the roster-backed route in a network workspace", () => {
    const networkWorkspace = workspace(
      "network",
      cooperative({ isNetwork: true }),
    );

    expect(networkWorkspaceRoutes(networkWorkspace)).toEqual([
      { href: "/net/example/cooperatives", label: "Cooperatives" },
    ]);
  });

  it("routes cooperatives and networks through their distinct workspace roots", () => {
    expect(workspaceHref(cooperative())).toBe("/coop/example");
    expect(workspaceHref(cooperative({ isNetwork: true }))).toBe(
      "/net/example",
    );
    expect(workspaceHref(cooperative({ handle: null }))).toBeNull();
  });

  it("keeps settings global unless the workspace is a cooperative", () => {
    expect(
      workspaceSettingsHref(
        workspace("network", cooperative({ isNetwork: true })),
      ),
    ).toBe("/me/settings");
    expect(workspaceSettingsHref(workspace("home"))).toBe("/me/settings");
    expect(workspaceSettingsHref(workspace("coop", cooperative()))).toBe(
      "/coop/example/settings",
    );
  });
});
