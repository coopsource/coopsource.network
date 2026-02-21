<script lang="ts">
  import type { Snippet } from 'svelte';
  import X from 'lucide-svelte/icons/x';

  interface Props {
    open: boolean;
    title?: string;
    onclose?: () => void;
    size?: 'sm' | 'md' | 'lg';
    children: Snippet;
    footer?: Snippet;
  }

  let {
    open = $bindable(false),
    title,
    onclose,
    size = 'md',
    children,
    footer,
  }: Props = $props();

  function close() {
    open = false;
    onclose?.();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  const widths: Record<string, string> = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
  };
</script>

<svelte:window onkeydown={open ? handleKeydown : undefined} />

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-[var(--cs-bg-overlay)] animate-in fade-in duration-150"
    onclick={handleBackdrop}
  >
    <div
      class="w-full {widths[size]} mx-4 bg-[var(--cs-bg-elevated)] border border-[var(--cs-border)] rounded-[var(--radius-lg)] shadow-lg animate-in zoom-in-95 duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-heading' : undefined}
      aria-label={title ? undefined : 'Dialog'}
    >
      {#if title}
        <div class="flex items-center justify-between px-5 py-3.5 border-b border-[var(--cs-border)]">
          <h2 id="modal-heading" class="text-[15px] font-semibold text-[var(--cs-text)]">{title}</h2>
          <button
            onclick={close}
            aria-label="Close"
            class="p-1 rounded-[var(--radius-sm)] text-[var(--cs-text-muted)] hover:text-[var(--cs-text)] hover:bg-[var(--cs-bg-inset)] cs-transition"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
      {/if}
      <div class="px-5 py-4">
        {@render children()}
      </div>
      {#if footer}
        <div class="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-[var(--cs-border)]">
          {@render footer()}
        </div>
      {/if}
    </div>
  </div>
{/if}
