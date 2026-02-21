<script lang="ts">
  import type { HTMLTextareaAttributes } from 'svelte/elements';

  interface Props extends HTMLTextareaAttributes {
    label?: string;
    error?: string;
    hint?: string;
  }

  let {
    label,
    error,
    hint,
    id,
    rows = 4,
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
  <textarea
    id={inputId}
    {rows}
    class="cs-input focus:cs-input-focus w-full resize-y"
    class:border-[var(--color-danger)]={error}
    {...rest}
  ></textarea>
  {#if error}
    <p class="text-[11px] text-[var(--color-danger)]">{error}</p>
  {:else if hint}
    <p class="text-[11px] text-[var(--cs-text-muted)]">{hint}</p>
  {/if}
</div>
