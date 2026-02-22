<script lang="ts">
  import type { HTMLSelectAttributes } from 'svelte/elements';
  import type { Snippet } from 'svelte';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';

  interface Props extends HTMLSelectAttributes {
    label?: string;
    error?: string;
    options?: Array<{ value: string; label: string }>;
    children?: Snippet;
  }

  let {
    label,
    error,
    options,
    children,
    id,
    class: className = '',
    ...rest
  }: Props = $props();

  const uid = typeof crypto !== 'undefined' ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  const inputId = $derived(id ?? `select-${uid}`);
</script>

<div class="flex flex-col gap-1.5 {className}">
  {#if label}
    <label for={inputId} class="text-[13px] font-medium text-[var(--cs-text)]">
      {label}
    </label>
  {/if}
  <div class="relative">
    <select
      id={inputId}
      class="cs-input focus:cs-input-focus w-full appearance-none pr-8"
      class:border-[var(--color-danger)]={error}
      {...rest}
    >
      {#if options}
        {#each options as opt}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      {:else if children}
        {@render children()}
      {/if}
    </select>
    <ChevronDown
      class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--cs-text-muted)]"
    />
  </div>
  {#if error}
    <p class="text-[11px] text-[var(--color-danger)]">{error}</p>
  {/if}
</div>
