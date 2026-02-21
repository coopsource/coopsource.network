<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  interface Props extends HTMLButtonAttributes {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    loading?: boolean;
    children: Snippet;
  }

  let {
    variant = 'primary',
    size = 'md',
    loading = false,
    children,
    disabled,
    class: className = '',
    ...rest
  }: Props = $props();

  const base = 'inline-flex items-center justify-center font-medium cs-transition cursor-pointer select-none';

  const variants: Record<string, string> = {
    primary: 'bg-[var(--cs-primary)] text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] shadow-xs',
    secondary: 'bg-[var(--cs-bg-card)] text-[var(--cs-text)] border border-[var(--cs-border)] hover:border-[var(--cs-border-hover)] hover:bg-[var(--cs-bg-inset)] shadow-xs',
    ghost: 'text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)] hover:bg-[var(--cs-bg-inset)]',
    danger: 'bg-[var(--color-danger)] text-white hover:bg-[var(--color-danger-dark)] shadow-xs',
  };

  const sizes: Record<string, string> = {
    sm: 'h-7 px-2.5 text-xs gap-1.5 rounded-[var(--radius-sm)]',
    md: 'h-8 px-3 text-[13px] gap-2 rounded-[var(--radius-sm)]',
    lg: 'h-9 px-4 text-sm gap-2 rounded-[var(--radius-md)]',
  };
</script>

<button
  class="{base} {variants[variant]} {sizes[size]} {className}"
  disabled={disabled || loading}
  class:opacity-50={disabled || loading}
  class:pointer-events-none={loading}
  {...rest}
>
  {#if loading}
    <span class="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
  {/if}
  {@render children()}
</button>
