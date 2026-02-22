import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';
import { forwardSessionCookie } from '$lib/server/cookies.js';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

export const load: PageServerLoad = async ({ url, cookies, fetch }) => {
  const token = url.searchParams.get('token');

  if (!token) {
    redirect(302, '/login?error=missing_token');
  }

  // Exchange the one-time token for a session cookie (server-side)
  const res = await fetch(`${API_BASE}/api/v1/auth/oauth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
    credentials: 'include',
  });

  if (!res.ok) {
    redirect(302, '/login?error=oauth_failed');
  }

  // Forward the session cookie from the API response to the browser
  forwardSessionCookie(res, cookies);

  redirect(302, '/dashboard');
};
