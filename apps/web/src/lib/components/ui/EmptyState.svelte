<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Component } from 'svelte';
  import Inbox from 'lucide-svelte/icons/inbox';

  interface Props {
    icon?: Component;
    title: string;
    description?: string;
    actions?: Snippet;
    class?: string;
  }

  let {
    icon: Icon = Inbox,
    title,
    description,
    actions,
    class: className = '',
  }: Props = $props();
</script>

<div class="flex flex-col items-center justify-center py-12 px-6 text-center {className}">
  <div class="mb-3 p-3 rounded-full bg-[var(--cs-bg-inset)]">
    <Icon class="h-6 w-6 text-[var(--cs-text-muted)]" />
  </div>
  <h3 class="text-[15px] font-semibold text-[var(--cs-text)]">{title}</h3>
  {#if description}
    <p class="mt-1 text-[13px] text-[var(--cs-text-secondary)] max-w-sm">{description}</p>
  {/if}
  {#if actions}
    <div class="mt-4">
      {@render actions()}
    </div>
  {/if}
</div>
