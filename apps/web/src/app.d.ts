import type { AuthUser } from '$lib/api/types.js';

declare global {
  namespace App {
    interface Locals {
      user: AuthUser | null;
    }
  }
}

export {};
