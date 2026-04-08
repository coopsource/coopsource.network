<script lang="ts">
  import { Badge } from '$lib/components/ui';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import Users from '@lucide/svelte/icons/users';
  import Globe from '@lucide/svelte/icons/globe';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import FileText from '@lucide/svelte/icons/file-text';
  import Handshake from '@lucide/svelte/icons/handshake';
  import Megaphone from '@lucide/svelte/icons/megaphone';

  let { data } = $props();

  const coop = $derived(data.cooperative);
  const isMember = $derived(data.isMember);

  // Whether to show the stats row at all (member count or any networks).
  const showStats = $derived(coop.memberCount !== null || coop.networks.length > 0);

  function coopTypeVariant(cooperativeType: string): 'default' | 'primary' | 'success' | 'warning' {
    switch (cooperativeType) {
      case 'worker': return 'primary';
      case 'consumer': return 'success';
      case 'producer': return 'warning';
      default: return 'default';
    }
  }

  function statusToVariant(status: string): 'default' | 'primary' | 'success' | 'warning' | 'danger' {
    switch (status) {
      case 'active':
      case 'resolved':
      case 'funded':
      case 'completed':
        return 'success';
      case 'open':
      case 'amended':
        return 'primary';
      case 'closed':
      case 'terminated':
        return 'warning';
      case 'voided':
      case 'cancelled':
        return 'danger';
      default:
        return 'default';
    }
  }

  function formatDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString();
  }

  function formatMoney(amount: number, currency: string): string {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
      }).format(amount);
    } catch {
      return `${amount} ${currency}`;
    }
  }
</script>

<svelte:head>
  <title>{coop.displayName} — Co-op Source</title>
</svelte:head>

<div class="space-y-6">
  <!-- Back link -->
  <a
    href="/explore"
    class="inline-flex items-center gap-1.5 text-sm text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)] cs-transition"
  >
    <ArrowLeft class="h-4 w-4" />
    Back to explore
  </a>

  <!-- "View as member" banner — only when viewer is an active member of this co-op -->
  {#if isMember && coop.handle}
    <a
      href="/coop/{coop.handle}"
      class="flex items-center justify-between gap-3 rounded-lg border border-[var(--cs-primary)] bg-[var(--cs-primary-soft)] px-4 py-3 text-sm cs-transition hover:bg-[var(--cs-primary-soft-hover,var(--cs-primary-soft))]"
    >
      <span class="text-[var(--cs-text)]">
        You're a member of this co-op — view your full workspace
      </span>
      <ArrowRight class="h-4 w-4 shrink-0 text-[var(--cs-primary)]" />
    </a>
  {/if}

  <!-- Header -->
  <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-6">
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-3">
          <h1 class="text-xl font-semibold text-[var(--cs-text)]">{coop.displayName}</h1>
          <Badge variant={coopTypeVariant(coop.cooperativeType)}>
            {coop.cooperativeType}
          </Badge>
        </div>
        {#if coop.handle}
          <p class="mt-0.5 text-sm text-[var(--cs-text-muted)]">@{coop.handle}</p>
        {/if}
        {#if coop.description}
          <p class="mt-3 text-sm text-[var(--cs-text-secondary)] leading-relaxed">{coop.description}</p>
        {/if}
        {#if coop.website}
          <a
            href={coop.website}
            target="_blank"
            rel="noopener noreferrer"
            class="mt-3 inline-flex items-center gap-1.5 text-sm text-[var(--cs-primary)] hover:underline"
          >
            <ExternalLink class="h-3.5 w-3.5" />
            {coop.website}
          </a>
        {/if}
      </div>
    </div>

    <!-- Stats — only shown when at least one stat is public -->
    {#if showStats}
      <div class="mt-6 flex gap-6 border-t border-[var(--cs-border)] pt-4">
        {#if coop.memberCount !== null}
          <div class="flex items-center gap-2 text-sm">
            <Users class="h-4 w-4 text-[var(--cs-text-muted)]" />
            <span class="font-medium text-[var(--cs-text)]">{coop.memberCount}</span>
            <span class="text-[var(--cs-text-secondary)]">member{coop.memberCount !== 1 ? 's' : ''}</span>
          </div>
        {/if}
        {#if coop.networks.length > 0}
          <div class="flex items-center gap-2 text-sm">
            <Globe class="h-4 w-4 text-[var(--cs-text-muted)]" />
            <span class="font-medium text-[var(--cs-text)]">{coop.networks.length}</span>
            <span class="text-[var(--cs-text-secondary)]">network{coop.networks.length !== 1 ? 's' : ''}</span>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Networks section -->
  {#if coop.networks.length > 0}
    <section>
      <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--cs-text-muted)]">
        Networks
      </h2>
      <div class="space-y-2">
        {#each coop.networks as network}
          <div class="flex items-center gap-3 rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-3">
            <div class="rounded-md bg-[var(--cs-primary-soft)] p-1.5">
              <Globe class="h-4 w-4 text-[var(--cs-primary)]" />
            </div>
            <span class="font-medium text-[var(--cs-text)]">{network.displayName}</span>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <!-- Proposals section (gated by publicActivity on the API side) -->
  {#if coop.proposals.length > 0}
    <section>
      <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--cs-text-muted)]">
        Recent proposals
      </h2>
      <div class="space-y-2">
        {#each coop.proposals as proposal}
          <div class="flex items-start gap-3 rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-3">
            <div class="rounded-md bg-[var(--cs-primary-soft)] p-1.5">
              <FileText class="h-4 w-4 text-[var(--cs-primary)]" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="truncate text-sm font-medium text-[var(--cs-text)]">{proposal.title}</span>
                <Badge variant={statusToVariant(proposal.status)}>{proposal.status}</Badge>
              </div>
              <p class="mt-0.5 text-xs text-[var(--cs-text-muted)]">
                Created {formatDate(proposal.createdAt)}
                {#if proposal.resolvedAt}
                  · Resolved {formatDate(proposal.resolvedAt)}
                {/if}
              </p>
            </div>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <!-- Agreements section (gated by publicAgreements on the API side) -->
  {#if coop.agreements.length > 0}
    <section>
      <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--cs-text-muted)]">
        Agreements
      </h2>
      <div class="space-y-2">
        {#each coop.agreements as agreement}
          <div class="flex items-start gap-3 rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-3">
            <div class="rounded-md bg-[var(--cs-primary-soft)] p-1.5">
              <Handshake class="h-4 w-4 text-[var(--cs-primary)]" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="truncate text-sm font-medium text-[var(--cs-text)]">{agreement.title}</span>
                <Badge variant={statusToVariant(agreement.status)}>{agreement.status}</Badge>
              </div>
              <p class="mt-0.5 text-xs text-[var(--cs-text-muted)]">
                {agreement.agreementType}
                {#if agreement.effectiveDate}
                  · Effective {formatDate(agreement.effectiveDate)}
                {/if}
              </p>
            </div>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <!-- Campaigns section (gated by publicCampaigns on the API side) -->
  {#if coop.campaigns.length > 0}
    <section>
      <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--cs-text-muted)]">
        Funding campaigns
      </h2>
      <div class="space-y-2">
        {#each coop.campaigns as campaign}
          <div class="flex items-start gap-3 rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-3">
            <div class="rounded-md bg-[var(--cs-primary-soft)] p-1.5">
              <Megaphone class="h-4 w-4 text-[var(--cs-primary)]" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="truncate text-sm font-medium text-[var(--cs-text)]">{campaign.title}</span>
                <Badge variant={statusToVariant(campaign.status)}>{campaign.status}</Badge>
              </div>
              <p class="mt-0.5 text-xs text-[var(--cs-text-muted)]">
                {formatMoney(campaign.amountRaised, campaign.goalCurrency)} of {formatMoney(campaign.goalAmount, campaign.goalCurrency)}
                {#if campaign.endDate}
                  · Ends {formatDate(campaign.endDate)}
                {/if}
              </p>
            </div>
          </div>
        {/each}
      </div>
    </section>
  {/if}
</div>
