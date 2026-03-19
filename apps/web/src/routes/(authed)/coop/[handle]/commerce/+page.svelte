<script lang="ts">
  import { workspacePrefix } from '$lib/utils/workspace.js';
  import ShoppingBag from '@lucide/svelte/icons/shopping-bag';
  import HandHelping from '@lucide/svelte/icons/hand-helping';
  import Handshake from '@lucide/svelte/icons/handshake';
  import FolderKanban from '@lucide/svelte/icons/folder-kanban';
  import Package from '@lucide/svelte/icons/package';

  let { data } = $props();

  const sections = [
    {
      title: 'Listings',
      description: 'Offer products and services to other cooperatives.',
      href: `${$workspacePrefix}/commerce/listings`,
      icon: ShoppingBag,
      color: 'text-blue-600 bg-blue-50',
    },
    {
      title: 'Needs',
      description: 'Post what your cooperative needs from others.',
      href: `${$workspacePrefix}/commerce/needs`,
      icon: HandHelping,
      color: 'text-orange-600 bg-orange-50',
    },
    {
      title: 'Inter-Coop Agreements',
      description: 'Trade agreements and partnerships between cooperatives.',
      href: `${$workspacePrefix}/commerce/projects`,
      icon: Handshake,
      color: 'text-violet-600 bg-violet-50',
    },
    {
      title: 'Collaborative Projects',
      description: 'Joint ventures with shared resources and revenue.',
      href: `${$workspacePrefix}/commerce/projects`,
      icon: FolderKanban,
      color: 'text-emerald-600 bg-emerald-50',
    },
    {
      title: 'Shared Resources',
      description: 'Equipment, space, and tools available for booking.',
      href: `${$workspacePrefix}/commerce/resources`,
      icon: Package,
      color: 'text-amber-600 bg-amber-50',
    },
  ];
</script>

<svelte:head>
  <title>Commerce — Co-op Source</title>
</svelte:head>

<div class="space-y-6">
  <div>
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">Commerce</h1>
    <p class="mt-1 text-sm text-[var(--cs-text-secondary)]">
      Coordinate trade, share resources, and collaborate with other cooperatives.
    </p>
  </div>

  <!-- Overview Cards -->
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {#each sections as section}
      <a
        href={section.href}
        class="block rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-5 hover:border-[var(--cs-border-hover)] hover:shadow-sm transition-shadow"
      >
        <div class="flex items-start gap-3">
          <div class="rounded-lg p-2 {section.color}">
            <section.icon class="h-5 w-5" />
          </div>
          <div class="min-w-0 flex-1">
            <h3 class="font-medium text-[var(--cs-text)]">{section.title}</h3>
            <p class="mt-1 text-sm text-[var(--cs-text-secondary)]">{section.description}</p>
          </div>
        </div>
      </a>
    {/each}
  </div>

  <!-- Quick Stats -->
  <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4 text-center">
      <div class="text-2xl font-semibold text-[var(--cs-text)]">{data.listingsCount}</div>
      <div class="mt-1 text-xs text-[var(--cs-text-muted)]">Active Listings</div>
    </div>
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4 text-center">
      <div class="text-2xl font-semibold text-[var(--cs-text)]">{data.needsCount}</div>
      <div class="mt-1 text-xs text-[var(--cs-text-muted)]">Open Needs</div>
    </div>
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4 text-center">
      <div class="text-2xl font-semibold text-[var(--cs-text)]">{data.agreementsCount}</div>
      <div class="mt-1 text-xs text-[var(--cs-text-muted)]">Agreements</div>
    </div>
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4 text-center">
      <div class="text-2xl font-semibold text-[var(--cs-text)]">{data.projectsCount}</div>
      <div class="mt-1 text-xs text-[var(--cs-text-muted)]">Projects</div>
    </div>
  </div>
</div>
