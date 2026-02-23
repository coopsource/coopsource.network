<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'outline';
    size?: 'sm' | 'md';
    dot?: boolean;
    class?: string;
    children: Snippet;
  }

  let {
    variant = 'default',
    size = 'sm',
    dot = false,
    class: className = '',
    children,
  }: Props = $props();

  const variants: Record<string, string> = {
    default: 'bg-[var(--cs-badge-default-bg,var(--cs-bg-inset))] text-[var(--cs-text-secondary)] border border-[var(--cs-border)]',
    primary: 'bg-[var(--cs-primary-soft)] text-[var(--cs-primary)]',
    success: 'bg-[var(--color-success-light)] text-[var(--color-success-dark)]',
    warning: 'bg-[var(--color-warning-light)] text-[var(--color-warning-dark)]',
    danger: 'bg-[var(--color-danger-light)] text-[var(--color-danger-dark)]',
    outline: 'border border-[var(--cs-border)] text-[var(--cs-text-secondary)]',
  };

  const dotColors: Record<string, string> = {
    default: 'bg-[var(--cs-text-muted)]',
    primary: 'bg-[var(--cs-primary)]',
    success: 'bg-[var(--color-success)]',
    warning: 'bg-[var(--color-warning)]',
    danger: 'bg-[var(--color-danger)]',
    outline: 'bg-[var(--cs-text-muted)]',
  };

  const sizes: Record<string, string> = {
    sm: 'text-[11px] px-1.5 py-0.5',
    md: 'text-xs px-2 py-0.5',
  };
</script>

<span
  class="inline-flex items-center gap-1 font-medium rounded-[var(--radius-full)] whitespace-nowrap {variants[variant]} {sizes[size]} {className}"
>
  {#if dot}
    <span class="h-1.5 w-1.5 rounded-full {dotColors[variant]}"></span>
  {/if}
  {@render children()}
</span>
