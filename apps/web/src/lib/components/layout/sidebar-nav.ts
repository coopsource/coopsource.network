import type { Component } from 'svelte';
import Users from '@lucide/svelte/icons/users';
import Vote from '@lucide/svelte/icons/vote';
import MessageSquare from '@lucide/svelte/icons/message-square';
import Compass from '@lucide/svelte/icons/compass';
import Banknote from '@lucide/svelte/icons/banknote';
import Globe from '@lucide/svelte/icons/globe';
import Shield from '@lucide/svelte/icons/shield';
import DollarSign from '@lucide/svelte/icons/dollar-sign';
import Handshake from '@lucide/svelte/icons/handshake';
import Settings from '@lucide/svelte/icons/settings';
import CircleUser from '@lucide/svelte/icons/circle-user';
import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
import Building2 from '@lucide/svelte/icons/building-2';
import type { CoopEntity, WorkspaceContext } from '$lib/api/types.js';

export interface NavItem {
  href: string;
  label: string;
  icon: Component;
}

export interface NavSection {
  label: string; // empty string = no section header rendered
  items: NavItem[];
}

/** Map of sub-routes → parent sidebar item, for active state highlighting. */
export const ROUTE_PARENT_MAP: Record<string, string> = {
  '/invitations': '/members',
  '/onboarding': '/members',
  '/agreements': '/governance',
  '/legal': '/governance',
  '/agents': '/admin',
  '/notifications': '/settings',
  '/settings/connections': '/settings',
  '/settings/payments': '/settings',
};

/** Is the user's role set elevated to officer/admin/owner? */
export function isAdminRoles(roles: readonly string[] | undefined): boolean {
  return roles?.some((r) => ['admin', 'owner', 'officer'].includes(r)) ?? false;
}

/** Compute the Cooperative nav section for a coop workspace. */
export function cooperativeNavSection(
  workspace: WorkspaceContext | null | undefined,
  isAdmin: boolean,
): NavSection {
  const prefix = workspace?.prefix ?? '';
  if (!prefix || workspace?.type !== 'coop') return { label: 'Cooperative', items: [] };

  const isNetwork = workspace?.cooperative?.isNetwork ?? false;
  const membersLabel = isNetwork ? 'Cooperatives' : 'Members';

  const items: NavItem[] = [
    { href: `${prefix}/members`, label: membersLabel, icon: Users },
    { href: `${prefix}/governance`, label: 'Governance', icon: Vote },
    { href: `${prefix}/posts`, label: 'Posts', icon: MessageSquare },
  ];

  if (isAdmin) {
    items.push({ href: `${prefix}/finance`, label: 'Finance', icon: DollarSign });
    items.push({ href: `${prefix}/admin`, label: 'Admin', icon: Shield });
  }

  return { label: 'Cooperative', items };
}

/** Compute the Network nav section for a coop workspace. */
export function networkNavSection(
  workspace: WorkspaceContext | null | undefined,
): NavSection {
  const prefix = workspace?.prefix ?? '';
  if (!prefix || workspace?.type !== 'coop') return { label: 'Network', items: [] };

  return {
    label: 'Network',
    items: [
      { href: `${prefix}/networks`, label: 'Networks', icon: Globe },
      { href: `${prefix}/partners`, label: 'Partners', icon: Handshake },
      { href: `${prefix}/alignment`, label: 'Alignment', icon: Compass },
      { href: `${prefix}/campaigns`, label: 'Campaigns', icon: Banknote },
    ],
  };
}

/** Compute the You nav section (user-scoped items). */
export function youNavSection(
  workspace: WorkspaceContext | null | undefined,
): NavSection {
  // Profile is always user-scoped: /me/profile
  // Settings is context-scoped: /me/settings in home mode, /coop/X/settings in coop mode
  const isHome = workspace?.type === 'home';
  const settingsHref = isHome
    ? '/me/settings'
    : workspace?.prefix
      ? `${workspace.prefix}/settings`
      : '/me/settings';

  return {
    label: 'You',
    items: [
      { href: '/me/profile', label: 'Profile', icon: CircleUser },
      { href: settingsHref, label: 'Settings', icon: Settings },
    ],
  };
}

/** Compute the Home mode top nav section (Activity link). Empty for non-home workspaces. */
export function homeNavSection(
  workspace: WorkspaceContext | null | undefined,
): NavSection {
  if (workspace?.type !== 'home') return { label: '', items: [] };
  return {
    label: '',
    items: [
      { href: '/me', label: 'Activity', icon: LayoutDashboard },
    ],
  };
}

/** Compute the My Coops section for Home mode. Lists all coops the user belongs to. */
export function myCoopsNavSection(
  workspace: WorkspaceContext | null | undefined,
  myCoops: readonly CoopEntity[],
): NavSection {
  if (workspace?.type !== 'home' || myCoops.length === 0) {
    return { label: 'My Coops', items: [] };
  }
  return {
    label: 'My Coops',
    items: myCoops
      .filter((coop) => coop.handle !== null)
      .map((coop) => ({
        href: `/coop/${coop.handle}`,
        label: coop.displayName,
        icon: Building2,
      })),
  };
}

/** Check whether a sidebar item href is active for the current pathname. */
export function isNavItemActive(
  href: string,
  pathname: string,
  workspacePrefix: string | undefined,
): boolean {
  if (pathname === href || pathname.startsWith(href + '/')) return true;

  if (workspacePrefix) {
    for (const [subRoute, parentRoute] of Object.entries(ROUTE_PARENT_MAP)) {
      const fullSub = workspacePrefix + subRoute;
      const fullParent = workspacePrefix + parentRoute;
      if (href === fullParent && (pathname === fullSub || pathname.startsWith(fullSub + '/'))) {
        return true;
      }
    }
  }

  return false;
}
