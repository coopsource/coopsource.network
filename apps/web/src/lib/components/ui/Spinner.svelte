<script lang="ts">
  interface Props {
    size?: 'sm' | 'md' | 'lg';
    class?: string;
  }

  let { size = 'md', class: className = '' }: Props = $props();

  const sizes: Record<string, string> = {
    sm: 'h-4 w-4 border-[1.5px]',
    md: 'h-5 w-5 border-2',
    lg: 'h-8 w-8 border-2',
  };
</script>

<div
  class="animate-spin rounded-full border-[var(--cs-primary)] border-t-transparent {sizes[size]} {className}"
  role="status"
  aria-label="Loading"
>
  <span class="sr-only">Loading...</span>
</div>
