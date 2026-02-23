<script lang="ts">
  import { EmptyState } from '$lib/components/ui';

  let { data } = $props();
</script>

<svelte:head>
  <title>Agreement Templates — Co-op Source</title>
</svelte:head>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <a href="/agreements" class="text-sm text-[var(--cs-text-muted)] hover:text-[var(--cs-text)]">&larr; Agreements</a>
      <h1 class="text-xl font-semibold text-[var(--cs-text)]">Templates</h1>
    </div>
    <a
      href="/agreements/templates/new"
      class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]"
    >
      New template
    </a>
  </div>

  {#if data.templates.length === 0}
    <EmptyState
      title="No templates"
      description="Create a reusable template to speed up agreement creation."
    />
  {:else}
    <div class="space-y-2">
      {#each data.templates as template}
        <a
          href="/agreements/templates/{template.id}"
          class="block rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-4 hover:border-[var(--cs-border-hover)] hover:shadow-sm"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <h3 class="font-medium text-[var(--cs-text)]">{template.name}</h3>
              {#if template.description}
                <p class="mt-1 line-clamp-2 text-sm text-[var(--cs-text-muted)]">{template.description}</p>
              {/if}
              <div class="mt-2 flex items-center gap-3 text-xs text-[var(--cs-text-muted)]">
                <span>{template.agreementType}</span>
                <span>{new Date(template.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </a>
      {/each}
    </div>
  {/if}

  {#if data.cursor}
    <div class="flex justify-center pt-2">
      <a
        href="?cursor={data.cursor}"
        class="text-sm text-[var(--cs-primary)] hover:text-[var(--cs-primary-hover)]"
      >
        Load more
      </a>
    </div>
  {/if}
</div>
