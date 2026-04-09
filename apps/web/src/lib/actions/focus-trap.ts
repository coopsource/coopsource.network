import type { Action } from 'svelte/action';

const FOCUSABLE_SELECTOR =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * Svelte action: traps keyboard focus within a container element.
 *
 * On mount the previously-focused element is saved and focus moves to the
 * first focusable child (or the node itself). Tab / Shift+Tab wrap around
 * the focusable elements inside the container. On destroy, focus is
 * restored to the previously-focused element.
 *
 * Focusable elements are queried on every Tab press so that dynamically
 * added/removed elements are handled without a MutationObserver.
 *
 * Usage: <div use:focusTrap>…</div>
 */
export const focusTrap: Action<HTMLElement> = (node) => {
  const previouslyFocused = document.activeElement as HTMLElement | null;

  // Focus the first focusable child, or the node itself as a fallback.
  function focusFirst(): void {
    const targets = node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (targets.length > 0) {
      targets[0].focus();
    } else {
      // Ensure the container can receive focus so the trap isn't invisible.
      if (!node.hasAttribute('tabindex')) {
        node.setAttribute('tabindex', '-1');
      }
      node.focus();
    }
  }

  focusFirst();

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;

    const focusable = Array.from(
      node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey) {
      if (document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  node.addEventListener('keydown', handleKeydown);

  return {
    destroy() {
      node.removeEventListener('keydown', handleKeydown);
      previouslyFocused?.focus();
    },
  };
};
