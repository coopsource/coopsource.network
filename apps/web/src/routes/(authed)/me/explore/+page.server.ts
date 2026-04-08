import type { PageServerLoad } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

type SearchType = 'all' | 'cooperatives' | 'posts';

export const load: PageServerLoad = async ({ fetch, url, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  const q = url.searchParams.get('q')?.trim() ?? '';
  const rawType = url.searchParams.get('type') ?? 'all';
  const type: SearchType =
    rawType === 'cooperatives' || rawType === 'posts' ? rawType : 'all';

  if (!q) {
    return {
      q: '',
      type,
      cooperatives: [],
      coopCursor: null as string | null,
      posts: [],
      postCursor: null as string | null,
      postsUnavailable: false,
    };
  }

  // V8.6: Posts endpoint requires an active membership (`requireAuth` middleware
  // enforces this — see plan Open Question §2). Gracefully degrade for users
  // without one instead of failing the entire page load.
  const coopPromise =
    type === 'posts'
      ? Promise.resolve({ cooperatives: [], cursor: null as string | null })
      : api.searchCooperatives(q, { limit: 20 });

  const postPromise =
    type === 'cooperatives'
      ? Promise.resolve({
          posts: [],
          cursor: null as string | null,
          unavailable: false,
        })
      : api
          .searchPosts(q, { limit: 20 })
          .then((r) => ({ ...r, unavailable: false }))
          .catch((e: unknown) => {
            if (e instanceof ApiError && e.status === 401) {
              return {
                posts: [],
                cursor: null as string | null,
                unavailable: true,
              };
            }
            throw e;
          });

  const [coopResult, postResult] = await Promise.all([coopPromise, postPromise]);

  return {
    q,
    type,
    cooperatives: coopResult.cooperatives,
    coopCursor: coopResult.cursor,
    posts: postResult.posts,
    postCursor: postResult.cursor,
    postsUnavailable: postResult.unavailable,
  };
};
