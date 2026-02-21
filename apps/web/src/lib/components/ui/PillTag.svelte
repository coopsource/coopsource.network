<script lang="ts">
  import type { Snippet } from 'svelte';
  import X from 'lucide-svelte/icons/x';

  interface Props {
    category?: 'interest' | 'contribution' | 'constraint' | 'redline' | 'default';
    removable?: boolean;
    onremove?: () => void;
    class?: string;
    children: Snippet;
  }

  let {
    category = 'default',
    removable = false,
    onremove,
    class: className = '',
    children,
  }: Props = $props();

  // Pre-computed OKLCH values at 12% and 25% opacity (avoids relative color syntax)
  const styles: Record<string, string> = {
    interest: 'bg-[oklch(0.59_0.19_264_/_0.12)] text-[var(--color-category-interest)] border-[oklch(0.59_0.19_264_/_0.25)]',
    contribution: 'bg-[oklch(0.60_0.17_160_/_0.12)] text-[var(--color-category-contribution)] border-[oklch(0.60_0.17_160_/_0.25)]',
    constraint: 'bg-[oklch(0.67_0.14_80_/_0.12)] text-[var(--color-category-constraint)] border-[oklch(0.67_0.14_80_/_0.25)]',
    redline: 'bg-[oklch(0.58_0.18_18_/_0.12)] text-[var(--color-category-redline)] border-[oklch(0.58_0.18_18_/_0.25)]',
    default: 'bg-[var(--cs-bg-inset)] text-[var(--cs-text-secondary)] border-[var(--cs-border)]',
  };
</script>

<span class="inline-flex items-center gap-1 px-2 py-0.5 text-[12px] font-medium rounded-[var(--radius-full)] border {styles[category]} {className}">
  {@render children()}
  {#if removable}
    <button
      onclick={onremove}
      class="p-0.5 rounded-full hover:bg-black/10 cs-transition cursor-pointer"
      aria-label="Remove"
    >
      <X class="h-3 w-3" />
    </button>
  {/if}
</span>
