<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';

  interface Props extends HTMLInputAttributes {
    label?: string;
    error?: string;
    hint?: string;
  }

  let {
    label,
    error,
    hint,
    id,
    class: className = '',
    ...rest
  }: Props = $props();

  const inputId = $derived(id ?? label?.toLowerCase().replace(/\s+/g, '-'));
</script>

<div class="flex flex-col gap-1.5 {className}">
  {#if label}
    <label for={inputId} class="text-[13px] font-medium text-[var(--cs-text)]">
      {label}
    </label>
  {/if}
  <input
    id={inputId}
    class="cs-input focus:cs-input-focus w-full"
    class:border-[var(--color-danger)]={error}
    {...rest}
  />
  {#if error}
    <p class="text-[11px] text-[var(--color-danger)]">{error}</p>
  {:else if hint}
    <p class="text-[11px] text-[var(--cs-text-muted)]">{hint}</p>
  {/if}
</div>
