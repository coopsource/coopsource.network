import type { HookRegistration } from './types.js';

/**
 * In-memory registry of hooks for the firehose pipeline.
 *
 * Supports exact collection matches and single-level wildcards
 * (e.g., 'network.coopsource.admin.*' matches 'network.coopsource.admin.officer').
 */
export class HookRegistry {
  /** Exact collection → registrations (pre-computed for O(1) lookup) */
  private exactPre = new Map<string, HookRegistration[]>();
  private exactPost = new Map<string, HookRegistration[]>();

  /** Wildcard patterns for fallback matching */
  private wildcardPre: HookRegistration[] = [];
  private wildcardPost: HookRegistration[] = [];

  /** All registrations by id */
  private byId = new Map<string, HookRegistration>();

  register(hook: HookRegistration): void {
    if (this.byId.has(hook.id)) {
      throw new Error(`Hook already registered: ${hook.id}`);
    }
    this.byId.set(hook.id, hook);

    for (const pattern of hook.collections) {
      if (pattern.endsWith('.*')) {
        // Wildcard pattern — stored for linear scan
        if (hook.phase === 'pre-storage') {
          this.wildcardPre.push(hook);
          this.wildcardPre.sort((a, b) => a.priority - b.priority);
        } else {
          this.wildcardPost.push(hook);
          this.wildcardPost.sort((a, b) => a.priority - b.priority);
        }
      } else {
        // Exact match — store in lookup map
        const map = hook.phase === 'pre-storage' ? this.exactPre : this.exactPost;
        const list = map.get(pattern) ?? [];
        list.push(hook);
        list.sort((a, b) => a.priority - b.priority);
        map.set(pattern, list);
      }
    }
  }

  unregister(hookId: string): void {
    const hook = this.byId.get(hookId);
    if (!hook) return;
    this.byId.delete(hookId);

    for (const pattern of hook.collections) {
      if (pattern.endsWith('.*')) {
        if (hook.phase === 'pre-storage') {
          this.wildcardPre = this.wildcardPre.filter((h) => h.id !== hookId);
        } else {
          this.wildcardPost = this.wildcardPost.filter((h) => h.id !== hookId);
        }
      } else {
        const map = hook.phase === 'pre-storage' ? this.exactPre : this.exactPost;
        const list = map.get(pattern);
        if (list) {
          const filtered = list.filter((h) => h.id !== hookId);
          if (filtered.length === 0) {
            map.delete(pattern);
          } else {
            map.set(pattern, filtered);
          }
        }
      }
    }
  }

  getPreStorageHooks(collection: string): HookRegistration[] {
    return this.getHooks(collection, this.exactPre, this.wildcardPre);
  }

  getPostStorageHooks(collection: string): HookRegistration[] {
    return this.getHooks(collection, this.exactPost, this.wildcardPost);
  }

  listAll(): HookRegistration[] {
    return Array.from(this.byId.values()).sort((a, b) => a.priority - b.priority);
  }

  getById(hookId: string): HookRegistration | undefined {
    return this.byId.get(hookId);
  }

  private getHooks(
    collection: string,
    exactMap: Map<string, HookRegistration[]>,
    wildcards: HookRegistration[],
  ): HookRegistration[] {
    const exact = exactMap.get(collection) ?? [];

    // Check wildcards: 'network.coopsource.admin.*' matches 'network.coopsource.admin.officer'
    const matched: HookRegistration[] = [];
    for (const hook of wildcards) {
      for (const pattern of hook.collections) {
        if (pattern.endsWith('.*')) {
          const prefix = pattern.slice(0, -2); // Remove '.*'
          if (collection.startsWith(prefix + '.') || collection === prefix) {
            matched.push(hook);
            break;
          }
        }
      }
    }

    if (matched.length === 0) return exact;
    if (exact.length === 0) return matched;

    // Merge and sort by priority
    return [...exact, ...matched].sort((a, b) => a.priority - b.priority);
  }
}
