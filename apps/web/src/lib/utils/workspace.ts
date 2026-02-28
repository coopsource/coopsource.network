import { page } from '$app/stores';
import { derived } from 'svelte/store';

/** Returns the workspace prefix (e.g. '/coop/acme') or empty string */
export const workspacePrefix = derived(page, ($page) => {
  return ($page.data?.workspace?.prefix as string) ?? '';
});
