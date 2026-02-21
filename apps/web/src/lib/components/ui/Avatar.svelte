<script lang="ts">
  interface Props {
    src?: string | null;
    name?: string;
    size?: 'sm' | 'md' | 'lg';
    class?: string;
  }

  let {
    src,
    name = '',
    size = 'md',
    class: className = '',
  }: Props = $props();

  const initials = $derived(
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('')
  );

  const sizes: Record<string, string> = {
    sm: 'h-6 w-6 text-[10px]',
    md: 'h-8 w-8 text-xs',
    lg: 'h-10 w-10 text-sm',
  };
</script>

{#if src}
  <img
    {src}
    alt={name}
    class="rounded-full object-cover {sizes[size]} {className}"
  />
{:else}
  <div
    class="rounded-full flex items-center justify-center font-medium bg-[var(--cs-primary-soft)] text-[var(--cs-primary)] {sizes[size]} {className}"
  >
    {initials || '?'}
  </div>
{/if}
