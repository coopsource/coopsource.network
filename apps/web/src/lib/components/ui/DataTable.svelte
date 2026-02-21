<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Column {
    key: string;
    label: string;
    width?: string;
    align?: 'left' | 'center' | 'right';
  }

  interface Props {
    columns: Column[];
    rows: Record<string, unknown>[];
    row?: Snippet<[Record<string, unknown>, number]>;
    empty?: string;
    class?: string;
  }

  let {
    columns,
    rows,
    row: rowSnippet,
    empty = 'No data',
    class: className = '',
  }: Props = $props();

  const aligns: Record<string, string> = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  };
</script>

<div class="overflow-x-auto cs-card {className}">
  <table class="w-full text-[13px]">
    <thead>
      <tr class="border-b border-[var(--cs-border)]">
        {#each columns as col}
          <th
            class="px-4 py-2.5 font-medium text-[11px] uppercase tracking-wider text-[var(--cs-text-muted)] {aligns[col.align ?? 'left']}"
            style={col.width ? `width: ${col.width}` : ''}
          >
            {col.label}
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#if rows.length === 0}
        <tr>
          <td
            colspan={columns.length}
            class="px-4 py-8 text-center text-[var(--cs-text-muted)]"
          >
            {empty}
          </td>
        </tr>
      {:else}
        {#each rows as item, i}
          {#if rowSnippet}
            {@render rowSnippet(item, i)}
          {:else}
            <tr class="border-b border-[var(--cs-border)] last:border-b-0 hover:bg-[var(--cs-bg-inset)] cs-transition">
              {#each columns as col}
                <td class="px-4 py-2.5 {aligns[col.align ?? 'left']}">
                  {item[col.key] ?? ''}
                </td>
              {/each}
            </tr>
          {/if}
        {/each}
      {/if}
    </tbody>
  </table>
</div>
