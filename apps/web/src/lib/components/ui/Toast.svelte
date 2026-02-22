<script lang="ts">
  import CheckCircle from '@lucide/svelte/icons/check-circle-2';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
  import AlertCircle from '@lucide/svelte/icons/alert-circle';
  import Info from '@lucide/svelte/icons/info';
  import X from '@lucide/svelte/icons/x';

  interface Props {
    variant?: 'success' | 'warning' | 'error' | 'info';
    message: string;
    description?: string;
    onclose?: () => void;
  }

  let {
    variant = 'info',
    message,
    description,
    onclose,
  }: Props = $props();

  const icons = { success: CheckCircle, warning: AlertTriangle, error: AlertCircle, info: Info };
  const iconColors: Record<string, string> = {
    success: 'text-[var(--color-success)]',
    warning: 'text-[var(--color-warning)]',
    error: 'text-[var(--color-danger)]',
    info: 'text-[var(--cs-primary)]',
  };

  const Icon = $derived(icons[variant]);
</script>

<div
  class="flex items-start gap-3 w-80 p-3 bg-[var(--cs-bg-elevated)] border border-[var(--cs-border)] rounded-[var(--radius-md)] shadow-md"
  role="alert"
>
  <Icon class="h-5 w-5 mt-0.5 shrink-0 {iconColors[variant]}" />
  <div class="flex-1 min-w-0">
    <p class="text-[13px] font-medium text-[var(--cs-text)]">{message}</p>
    {#if description}
      <p class="text-[12px] text-[var(--cs-text-secondary)] mt-0.5">{description}</p>
    {/if}
  </div>
  {#if onclose}
    <button
      onclick={onclose}
      class="p-0.5 rounded text-[var(--cs-text-muted)] hover:text-[var(--cs-text)] cs-transition"
    >
      <X class="h-3.5 w-3.5" />
    </button>
  {/if}
</div>
