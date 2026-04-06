import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { SerializableScriptContext, ScriptResult, ScriptLogEntry } from './script-context.js';
import { logger } from '../middleware/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Callback request from the worker thread.
 */
interface CallbackRequest {
  type: 'callback';
  id: string;
  method: string;
  args: unknown[];
}

/**
 * Result message from the worker thread.
 */
interface WorkerResult {
  type: 'result';
  success: boolean;
  error?: string;
  logs: ScriptLogEntry[];
}

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
 * Custom Worker Thread pool for executing cooperative scripts.
 *
 * Each script execution gets its own Worker thread with a fresh V8 isolate.
 * The pool manages concurrency and provides bidirectional communication
 * via MessagePort for ctx method callbacks (db.query, http.fetch, etc.).
 *
 * Workers are NOT reused — each execution spawns a new worker. This ensures
 * clean state between script executions (no leaked variables, no memory
 * accumulation from long-running workers).
 */
export class ScriptWorkerPool {
  private maxWorkers: number;
  private maxOldGenerationSizeMb: number;
  private activeWorkers = 0;
  private waitQueue: Array<() => void> = [];
  private shuttingDown = false;

  constructor(options?: WorkerPoolOptions) {
    this.maxWorkers = options?.maxWorkers ?? 4;
    this.maxOldGenerationSizeMb = options?.maxOldGenerationSizeMb ?? 64;
  }

  /**
   * Execute a compiled script in a Worker thread.
   *
   * Handles:
   * - Concurrency limiting (waits if maxWorkers reached)
   * - Timeout enforcement (terminates worker on timeout)
   * - Bidirectional callback routing (ctx.db.query → main thread → worker)
   * - Resource limits (V8 heap size cap)
   */
  async execute(params: ExecuteParams): Promise<ScriptResult> {
    if (this.shuttingDown) {
      throw new Error('Worker pool is shutting down');
    }

    // Wait for an available slot
    await this.acquireSlot();

    const startTime = Date.now();

    try {
      return await this.runWorker(params, startTime);
    } finally {
      this.releaseSlot();
    }
  }

  /**
   * Shut down the pool. No new executions will be accepted.
   */
  async shutdown(): Promise<void> {
    this.shuttingDown = true;

    // Reject any waiting executions
    for (const resolve of this.waitQueue) {
      resolve();
    }
    this.waitQueue = [];
  }

  private async acquireSlot(): Promise<void> {
    if (this.activeWorkers < this.maxWorkers) {
      this.activeWorkers++;
      return;
    }

    // Wait for a slot to open
    await new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });

    if (this.shuttingDown) {
      throw new Error('Worker pool is shutting down');
    }

    this.activeWorkers++;
  }

  private releaseSlot(): void {
    this.activeWorkers--;
    const next = this.waitQueue.shift();
    if (next) {
      next();
    }
  }

  private runWorker(params: ExecuteParams, startTime: number): Promise<ScriptResult> {
    return new Promise((resolve) => {
      // Resolve the worker script path. In dev (tsx), source is .ts.
      // In production (compiled), it's .js in dist/.
      const workerPath = path.join(__dirname, 'worker.ts');

      const worker = new Worker(workerPath, {
        workerData: {
          compiledJs: params.compiledJs,
          contextData: params.contextData,
          cooperativeDid: params.cooperativeDid,
        },
        resourceLimits: {
          maxOldGenerationSizeMb: this.maxOldGenerationSizeMb,
        },
        // Use tsx loader for TypeScript support in dev
        execArgv: ['--import', 'tsx'],
      });

      let settled = false;

      // Timeout enforcement
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          worker.terminate().catch(() => {
            // Worker may already be dead
          });
          resolve({
            success: false,
            error: `Script execution timed out after ${params.timeoutMs}ms`,
            durationMs: Date.now() - startTime,
            logs: [],
          });
        }
      }, params.timeoutMs);

      // Handle messages from worker
      worker.on('message', (msg: CallbackRequest | WorkerResult) => {
        if (msg.type === 'callback') {
          // Route callback to the main thread handler
          params
            .callbackHandler(msg.method, msg.args)
            .then((result) => {
              worker.postMessage({
                type: 'callback-result',
                id: msg.id,
                result,
              });
            })
            .catch((err) => {
              worker.postMessage({
                type: 'callback-result',
                id: msg.id,
                error: err instanceof Error ? err.message : String(err),
              });
            });
        } else if (msg.type === 'result') {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve({
              success: msg.success,
              error: msg.error,
              durationMs: Date.now() - startTime,
              logs: msg.logs ?? [],
            });
          }
        }
      });

      // Handle worker errors
      worker.on('error', (err: Error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          logger.error({ err, cooperativeDid: params.cooperativeDid }, 'Script worker error');
          resolve({
            success: false,
            error: err.message,
            durationMs: Date.now() - startTime,
            logs: [],
          });
        }
      });

      // Handle worker exit
      worker.on('exit', (code) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({
            success: false,
            error: `Worker exited with code ${code}`,
            durationMs: Date.now() - startTime,
            logs: [],
          });
        }
      });
    });
  }
}
