<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    description?: string;
    actions?: Snippet;
    class?: string;
  }

  let {
    title,
    description,
    actions,
    class: className = '',
  }: Props = $props();
</script>

<div class="flex items-start justify-between gap-4 {className}">
  <div>
    <h1 class="text-xl font-semibold text-[var(--cs-text)] tracking-tight">{title}</h1>
    {#if description}
      <p class="mt-1 text-[13px] text-[var(--cs-text-secondary)]">{description}</p>
    {/if}
  </div>
  {#if actions}
    <div class="flex items-center gap-2 shrink-0">
      {@render actions()}
    </div>
  {/if}
</div>
