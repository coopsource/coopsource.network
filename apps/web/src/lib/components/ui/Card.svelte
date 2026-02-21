<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    padding?: 'none' | 'sm' | 'md' | 'lg';
    hover?: boolean;
    class?: string;
    children: Snippet;
  }

  let {
    padding = 'md',
    hover = false,
    class: className = '',
    children,
  }: Props = $props();

  const paddings: Record<string, string> = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  };
</script>

<div
  class="cs-card {paddings[padding]} {className}"
  class:hover:shadow-sm={hover}
  class:hover:border-[var(--cs-border-hover)]={hover}
  class:cs-transition={hover}
>
  {@render children()}
</div>
