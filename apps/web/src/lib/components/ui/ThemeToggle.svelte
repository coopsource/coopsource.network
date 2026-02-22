<script lang="ts">
  import Sun from '@lucide/svelte/icons/sun';
  import Moon from '@lucide/svelte/icons/moon';
  import Monitor from '@lucide/svelte/icons/monitor';

  interface Props {
    variant?: 'icon' | 'full';
    class?: string;
  }

  let {
    variant = 'icon',
    class: className = '',
  }: Props = $props();

  type Theme = 'light' | 'dark' | 'system';

  let theme = $state<Theme>(
    typeof window !== 'undefined'
      ? ((localStorage.getItem('theme') ?? 'system') as Theme)
      : 'system',
  );

  function applyTheme(t: Theme) {
    if (typeof document === 'undefined') return;
    const html = document.documentElement;
    if (t === 'system') {
      html.removeAttribute('data-theme');
      localStorage.removeItem('theme');
    } else {
      html.setAttribute('data-theme', t);
      localStorage.setItem('theme', t);
    }
  }

  function cycle() {
    const order: Theme[] = ['light', 'dark', 'system'];
    const next = order[(order.indexOf(theme) + 1) % order.length];
    theme = next;
    applyTheme(next);
  }

  function select(t: Theme) {
    theme = t;
    applyTheme(t);
  }

  const icons = { light: Sun, dark: Moon, system: Monitor };
  const Icon = $derived(icons[theme]);
  const label = $derived(theme === 'system' ? 'System' : theme === 'dark' ? 'Dark' : 'Light');
</script>

{#if variant === 'icon'}
  <button
    onclick={cycle}
    class="p-1.5 rounded-[var(--radius-sm)] cs-transition cursor-pointer
      text-[var(--cs-sidebar-text)] hover:text-[var(--cs-sidebar-text-active)] hover:bg-[var(--cs-sidebar-hover)]"
    title="Theme: {label}"
    aria-label="Toggle theme"
  >
    <Icon class="h-4 w-4" />
  </button>
{:else}
  <div class="flex items-center gap-0.5 p-0.5 rounded-[var(--radius-md)] bg-[var(--cs-bg-inset)] {className}">
    {#each (['light', 'dark', 'system'] as const) as t}
      {@const I = icons[t]}
      <button
        onclick={() => select(t)}
        class="flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium rounded-[var(--radius-sm)] cs-transition cursor-pointer
          {theme === t
            ? 'bg-[var(--cs-bg-card)] text-[var(--cs-text)] shadow-xs'
            : 'text-[var(--cs-text-muted)] hover:text-[var(--cs-text-secondary)]'}"
        aria-pressed={theme === t}
      >
        <I class="h-3.5 w-3.5" />
        {t === 'system' ? 'System' : t === 'dark' ? 'Dark' : 'Light'}
      </button>
    {/each}
  </div>
{/if}
