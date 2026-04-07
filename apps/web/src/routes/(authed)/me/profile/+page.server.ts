import type { PageServerLoad } from './$types.js';

// No data fetching needed — data.user is provided by the (authed) parent layout.
// This file exists only to give SvelteKit a route entry point.
export const load: PageServerLoad = async () => {
  return {};
};
