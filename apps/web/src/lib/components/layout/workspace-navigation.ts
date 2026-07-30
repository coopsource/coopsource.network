import type { CoopEntity, WorkspaceContext } from "$lib/api/types.js";

export interface WorkspaceRoute {
  href: string;
  label: string;
}

export function networkWorkspaceRoutes(
  workspace: WorkspaceContext | null | undefined,
): WorkspaceRoute[] {
  if (workspace?.type !== "network" || !workspace.prefix) return [];
  return [
    {
      href: `${workspace.prefix}/cooperatives`,
      label: "Cooperatives",
    },
  ];
}

export function workspaceHref(cooperative: CoopEntity): string | null {
  if (!cooperative.handle) return null;
  return `/${cooperative.isNetwork ? "net" : "coop"}/${cooperative.handle}`;
}

export function workspaceSettingsHref(
  workspace: WorkspaceContext | null | undefined,
): string {
  return workspace?.type === "coop" && workspace.prefix
    ? `${workspace.prefix}/settings`
    : "/me/settings";
}
