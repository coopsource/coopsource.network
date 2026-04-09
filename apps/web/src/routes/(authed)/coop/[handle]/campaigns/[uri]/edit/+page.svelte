<script lang="ts">
  import { enhance } from '$app/forms';
  import { workspacePrefix } from '$lib/utils/workspace.js';
  import CampaignForm from '$lib/components/forms/CampaignForm.svelte';

  let { data, form } = $props();
  let submitting = $state(false);

  const initialValues = $derived({
    title: data.campaign.title,
    description: data.campaign.description ?? '',
    tier: data.campaign.tier,
    campaignType: data.campaign.campaignType,
    goalAmount: data.campaign.goalAmount / 100,
    goalCurrency: data.campaign.goalCurrency,
    fundingModel: data.campaign.fundingModel,
    endDate: data.campaign.endDate?.slice(0, 10) ?? '',
  });

  const disabledFields = $derived(
    data.campaign.status === 'active' ? ['tier', 'campaignType', 'fundingModel'] : []
  );
</script>

<svelte:head>
  <title>Edit Campaign — Co-op Source</title>
</svelte:head>

<div class="mx-auto max-w-lg space-y-6">
  <h1 class="text-xl font-semibold text-[var(--cs-text)]">Edit Campaign</h1>

  {#if form?.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}

  <form method="POST" use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }}>
    <div class="space-y-4">
      <CampaignForm {initialValues} {disabledFields} />
    </div>
    <div class="flex gap-3 pt-4">
      <button type="submit" disabled={submitting} class="rounded-md bg-[var(--cs-primary)] px-4 py-2 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50">
        {submitting ? 'Saving...' : 'Save changes'}
      </button>
      <a href="{$workspacePrefix}/campaigns/{encodeURIComponent(data.campaign.uri)}" class="rounded-md px-4 py-2 text-sm text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)]">Cancel</a>
    </div>
  </form>
</div>
