<script lang="ts">
  interface Tab {
    id: string;
    label: string;
    count?: number;
  }

  interface Props {
    tabs: Tab[];
    active: string;
    onchange?: (id: string) => void;
    class?: string;
  }

  let {
    tabs,
    active = $bindable(),
    onchange,
    class: className = '',
  }: Props = $props();

  function select(id: string) {
    active = id;
    onchange?.(id);
  }
</script>

<div class="flex gap-0.5 border-b border-[var(--cs-border)] {className}" role="tablist">
  {#each tabs as tab}
    <button
      role="tab"
      aria-selected={active === tab.id}
      class="px-3 py-2 text-[13px] font-medium cs-transition border-b-2 -mb-px cursor-pointer
        {active === tab.id
          ? 'border-[var(--cs-primary)] text-[var(--cs-primary)]'
          : 'border-transparent text-[var(--cs-text-muted)] hover:text-[var(--cs-text-secondary)]'}"
      onclick={() => select(tab.id)}
    >
      {tab.label}
      {#if tab.count != null}
        <span class="ml-1.5 text-[11px] text-[var(--cs-text-muted)]">{tab.count}</span>
      {/if}
    </button>
  {/each}
</div>
