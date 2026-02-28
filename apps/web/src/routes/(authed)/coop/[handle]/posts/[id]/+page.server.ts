import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ params, fetch, request }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);

  try {
    const [thread, postsData] = await Promise.all([
      api.getThread(params.id),
      api.getThreadPosts(params.id, { limit: 50 }),
    ]);
    return { thread, posts: postsData.posts, postsCursor: postsData.cursor };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      error(404, 'Thread not found.');
    }
    error(500, 'Failed to load thread.');
  }
};

export const actions: Actions = {
  createPost: async ({ request, params, fetch }) => {
    const data = await request.formData();
    const body = String(data.get('body') ?? '').trim();

    if (!body) {
      return fail(400, { postError: 'Post body is required.' });
    }

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.createPost(params.id, { body });
      return { postSuccess: true };
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { postError: err.message });
      }
      return fail(500, { postError: 'Failed to create post.' });
    }
  },

  deletePost: async ({ request, fetch }) => {
    const data = await request.formData();
    const postId = String(data.get('postId') ?? '');

    if (!postId) {
      return fail(400, { postError: 'Post ID is required.' });
    }

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.deletePost(postId);
      return { deleteSuccess: true };
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, { postError: err.message });
      }
      return fail(500, { postError: 'Failed to delete post.' });
    }
  },
};
