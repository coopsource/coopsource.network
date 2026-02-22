<script lang="ts">
  import Modal from './Modal.svelte';
  import Button from './Button.svelte';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';

  interface Props {
    open: boolean;
    title?: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'danger' | 'primary';
    loading?: boolean;
    onconfirm?: () => void;
    oncancel?: () => void;
  }

  let {
    open = $bindable(false),
    title = 'Confirm',
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    variant = 'danger',
    loading = false,
    onconfirm,
    oncancel,
  }: Props = $props();

  function handleCancel() {
    open = false;
    oncancel?.();
  }

  function handleConfirm() {
    onconfirm?.();
  }
</script>

<Modal bind:open {title} onclose={handleCancel} size="sm">
  <div class="flex items-start gap-3">
    {#if variant === 'danger'}
      <div class="p-2 rounded-full bg-[var(--color-danger-light)]">
        <AlertTriangle class="h-5 w-5 text-[var(--color-danger)]" />
      </div>
    {/if}
    <p class="text-[13px] text-[var(--cs-text-secondary)] pt-1">{message}</p>
  </div>

  {#snippet footer()}
    <Button variant="ghost" onclick={handleCancel}>{cancelLabel}</Button>
    <Button variant={variant === 'danger' ? 'danger' : 'primary'} onclick={handleConfirm} {loading}>
      {confirmLabel}
    </Button>
  {/snippet}
</Modal>
