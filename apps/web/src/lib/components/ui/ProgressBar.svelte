<script lang="ts">
  interface Props {
    value: number;
    max?: number;
    variant?: 'primary' | 'success' | 'warning' | 'danger';
    size?: 'sm' | 'md';
    showLabel?: boolean;
    class?: string;
  }

  let {
    value,
    max = 100,
    variant = 'primary',
    size = 'sm',
    showLabel = false,
    class: className = '',
  }: Props = $props();

  const pct = $derived(Math.min(100, Math.max(0, (value / max) * 100)));

  const colors: Record<string, string> = {
    primary: 'bg-[var(--cs-primary)]',
    success: 'bg-[var(--color-success)]',
    warning: 'bg-[var(--color-warning)]',
    danger: 'bg-[var(--color-danger)]',
  };

  const heights: Record<string, string> = {
    sm: 'h-1.5',
    md: 'h-2.5',
  };
</script>

<div class="flex items-center gap-2 {className}">
  <div class="flex-1 rounded-full bg-[var(--cs-bg-inset)] overflow-hidden {heights[size]}">
    <div
      class="h-full rounded-full cs-transition {colors[variant]}"
      style="width: {pct}%"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    ></div>
  </div>
  {#if showLabel}
    <span class="text-[11px] font-medium text-[var(--cs-text-muted)] tabular-nums">
      {Math.round(pct)}%
    </span>
  {/if}
</div>
