import type { Action } from 'svelte/action';

/**
 * Svelte action: fires the callback when a click happens outside the element.
 *
 * Usage: <div use:clickOutside={() => (open = false)}>
 *
 * The listener is attached on mount and cleaned up on destroy. Uses capture
 * phase (third arg `true`) so the handler runs before bubbling click handlers.
 * Uses queueMicrotask to avoid the click that OPENED the element from
 * immediately triggering the outside-click handler.
 */
export const clickOutside: Action<HTMLElement, () => void> = (node, callback) => {
  function handle(event: MouseEvent) {
    if (!node.contains(event.target as Node)) {
      callback();
    }
  }

  let mounted = false;
  queueMicrotask(() => {
    mounted = true;
    document.addEventListener('click', handle, true);
  });

  return {
    destroy() {
      if (mounted) {
        document.removeEventListener('click', handle, true);
      }
    },
  };
};
