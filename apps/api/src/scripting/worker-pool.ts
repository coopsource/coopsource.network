import type { SerializableScriptContext, ScriptResult } from './script-context.js';

/**
 * Parameters for executing a script in the pool.
 */
export interface ExecuteParams {
  compiledJs: string;
  contextData: SerializableScriptContext;
  cooperativeDid: string;
  timeoutMs: number;
  callbackHandler: (method: string, args: unknown[]) => Promise<unknown>;
}

export interface WorkerPoolOptions {
  maxWorkers?: number;
  maxOldGenerationSizeMb?: number;
}

/**
 * Cooperative script execution pool.
 *
 * DISABLED — Gate 0 containment for audit finding C-02 (amendment AM-1).
 *
 * The previous implementation spawned a worker thread running `scripting/worker.ts`,
 * which built a `node:vm` context seeded with an outer-realm `Promise`. That let any
 * script reach `Promise.constructor('return process')()` and take the API process's
 * OS privileges and secrets, while the same worker exposed DB, HTTP, email, event,
 * and cooperative-PDS-write callbacks. Route-level authorization was a session/URL
 * cooperative match only, so any active member could reach it.
 *
 * The worker entry point and thread spawner have been removed rather than left
 * unreachable: the audit found the sandbox was already inert in production only
 * because of a packaging defect, and treated that as a packaging accident rather
 * than a security boundary. Scripting returns via an isolated runner outside the
 * API trust domain (AM-1, Phase 7); the in-process runner is never re-enabled.
 *
 * The callback surface in `script-service.ts` is retained as the contract that
 * the future capability-scoped RPC surface is derived from.
 */
export class ScriptWorkerPool {
  constructor(_options?: WorkerPoolOptions) {
    // Retained so container wiring and the future isolated runner keep one seam.
  }

  async execute(_params: ExecuteParams): Promise<ScriptResult> {
    throw new Error('Cooperative script execution is disabled (audit C-02 / AM-1)');
  }

  async shutdown(): Promise<void> {
    // No workers are ever started.
  }
}
