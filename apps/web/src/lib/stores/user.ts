import { writable } from 'svelte/store';
import type { AuthUser } from '$lib/api/types.js';

export const user = writable<AuthUser | null>(null);
