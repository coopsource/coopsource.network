<script lang="ts">
  interface Props {
    initialValues?: Partial<{
      title: string;
      description: string;
      tier: string;
      campaignType: string;
      goalAmount: number;
      goalCurrency: string;
      fundingModel: string;
      endDate: string;
    }>;
    disabledFields?: string[];
  }

  let { initialValues, disabledFields = [] }: Props = $props();

  function isDisabled(field: string): boolean {
    return disabledFields.includes(field);
  }
</script>

<div>
  <label for="title" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Title</label>
  <input id="title" name="title" type="text" required maxlength="256" value={initialValues?.title ?? ''} class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
</div>

<div>
  <label for="description" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Description</label>
  <textarea id="description" name="description" rows="3" maxlength="5000" class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]">{initialValues?.description ?? ''}</textarea>
</div>

<div class="grid grid-cols-2 gap-4">
  <div>
    <label for="tier" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Tier</label>
    {#if isDisabled('tier')}
      <select id="tier" disabled class="mt-1 block w-full rounded-md border border-[var(--cs-border)] bg-[var(--cs-bg-inset)] px-3 py-2 text-sm opacity-60">
        <option value={initialValues?.tier ?? 'cooperative'} selected>{initialValues?.tier ?? 'cooperative'}</option>
      </select>
    {:else}
      <select id="tier" name="tier" value={initialValues?.tier ?? 'cooperative'} class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm">
        <option value="cooperative">Cooperative</option>
        <option value="project">Project</option>
        <option value="network">Network</option>
      </select>
    {/if}
  </div>
  <div>
    <label for="campaignType" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Type</label>
    {#if isDisabled('campaignType')}
      <select id="campaignType" disabled class="mt-1 block w-full rounded-md border border-[var(--cs-border)] bg-[var(--cs-bg-inset)] px-3 py-2 text-sm opacity-60">
        <option value={initialValues?.campaignType ?? 'donation'} selected>{initialValues?.campaignType ?? 'donation'}</option>
      </select>
    {:else}
      <select id="campaignType" name="campaignType" value={initialValues?.campaignType ?? 'donation'} class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm">
        <option value="donation">Donation</option>
        <option value="rewards">Rewards</option>
        <option value="patronage">Patronage</option>
        <option value="revenue_share">Revenue Share</option>
      </select>
    {/if}
  </div>
</div>

<div class="grid grid-cols-2 gap-4">
  <div>
    <label for="goalAmount" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Goal Amount ($)</label>
    <input id="goalAmount" name="goalAmount" type="number" required min="1" step="1" value={initialValues?.goalAmount ?? ''} class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
  </div>
  <div>
    <label for="fundingModel" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Funding Model</label>
    {#if isDisabled('fundingModel')}
      <select id="fundingModel" disabled class="mt-1 block w-full rounded-md border border-[var(--cs-border)] bg-[var(--cs-bg-inset)] px-3 py-2 text-sm opacity-60">
        <option value={initialValues?.fundingModel ?? 'all_or_nothing'} selected>{initialValues?.fundingModel === 'keep_it_all' ? 'Keep It All' : 'All or Nothing'}</option>
      </select>
      <input type="hidden" name="fundingModel" value={initialValues?.fundingModel ?? 'all_or_nothing'} />
    {:else}
      <select id="fundingModel" name="fundingModel" value={initialValues?.fundingModel ?? 'all_or_nothing'} class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm">
        <option value="all_or_nothing">All or Nothing</option>
        <option value="keep_it_all">Keep It All</option>
      </select>
    {/if}
  </div>
</div>

<input type="hidden" name="goalCurrency" value={initialValues?.goalCurrency ?? 'USD'} />

<div>
  <label for="endDate" class="block text-sm font-medium text-[var(--cs-text-secondary)]">End Date (optional)</label>
  <input id="endDate" name="endDate" type="date" value={initialValues?.endDate ?? ''} class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]" />
</div>
