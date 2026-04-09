import type { PageServerLoad } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

type SearchType = 'all' | 'cooperatives' | 'posts' | 'people';

export const load: PageServerLoad = async ({ fetch, url, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  const q = url.searchParams.get('q')?.trim() ?? '';
  const rawType = url.searchParams.get('type') ?? 'all';
  const type: SearchType =
    rawType === 'cooperatives' || rawType === 'posts' || rawType === 'people'
      ? rawType
      : 'all';

  if (!q) {
    return {
      q: '',
      type,
      cooperatives: [],
      coopCursor: null as string | null,
      posts: [],
      postCursor: null as string | null,
      postsUnavailable: false,
      people: [],
      peopleCursor: null as string | null,
      peopleUnavailable: false,
    };
  }

  // V8.6/V8.8: Posts and People endpoints require an active membership
  // (`requireAuth` middleware enforces this — see plan Open Question §2).
  // Gracefully degrade for users without one instead of failing the entire
  // page load.
  const coopPromise =
    type === 'posts' || type === 'people'
      ? Promise.resolve({ cooperatives: [], cursor: null as string | null })
      : api.searchCooperatives(q, { limit: 20 });

  const postPromise =
    type === 'cooperatives' || type === 'people'
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

  const peoplePromise =
    type === 'cooperatives' || type === 'posts'
      ? Promise.resolve({
          people: [],
          cursor: null as string | null,
          unavailable: false,
        })
      : api
          .searchPeople(q, { limit: 20 })
          .then((r) => ({ ...r, unavailable: false }))
          .catch((e: unknown) => {
            if (e instanceof ApiError && e.status === 401) {
              return {
                people: [],
                cursor: null as string | null,
                unavailable: true,
              };
            }
            throw e;
          });

  const [coopResult, postResult, peopleResult] = await Promise.all([
    coopPromise,
    postPromise,
    peoplePromise,
  ]);

  return {
    q,
    type,
    cooperatives: coopResult.cooperatives,
    coopCursor: coopResult.cursor,
    posts: postResult.posts,
    postCursor: postResult.cursor,
    postsUnavailable: postResult.unavailable,
    people: peopleResult.people,
    peopleCursor: peopleResult.cursor,
    peopleUnavailable: peopleResult.unavailable,
  };
};
