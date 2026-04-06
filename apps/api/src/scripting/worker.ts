/**
 * Worker thread entry point for executing cooperative scripts.
 *
 * Receives compiled JavaScript and a serializable context via workerData,
 * creates a vm sandbox with a `ctx` object, and executes the script.
 *
 * All `ctx` methods (db.query, http.fetch, etc.) send callback messages
 * to the main thread via parentPort and await responses.
 */
import { workerData, parentPort } from 'node:worker_threads';
import * as vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import type { SerializableScriptContext, ScriptLogEntry } from './script-context.js';

interface WorkerData {
  compiledJs: string;
  contextData: SerializableScriptContext;
  cooperativeDid: string;
}

interface CallbackRequest {
  type: 'callback';
  id: string;
  method: string;
  args: unknown[];
}

interface CallbackResponse {
  type: 'callback-result';
  id: string;
  result?: unknown;
  error?: string;
}

interface WorkerResult {
  type: 'result';
  success: boolean;
  error?: string;
  logs: ScriptLogEntry[];
}

// ─── Pending promise map for async callbacks ────────────────────────────

const pendingCallbacks = new Map<
  string,
  { resolve: (value: unknown) => void; reject: (err: Error) => void }
>();

const logs: ScriptLogEntry[] = [];

// Listen for callback responses from the main thread
parentPort!.on('message', (msg: CallbackResponse) => {
  if (msg.type === 'callback-result') {
    const pending = pendingCallbacks.get(msg.id);
    if (pending) {
      pendingCallbacks.delete(msg.id);
      if (msg.error) {
        pending.reject(new Error(msg.error));
      } else {
        pending.resolve(msg.result);
      }
    }
  }
});

/**
 * Send a callback request to the main thread and await the response.
 */
function callMain(method: string, args: unknown[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    pendingCallbacks.set(id, { resolve, reject });
    const request: CallbackRequest = { type: 'callback', id, method, args };
    parentPort!.postMessage(request);
  });
}

// ─── Build the ctx object for the sandbox ───────────────────────────────

function buildContext(data: WorkerData): Record<string, unknown> {
  const ctx = {
    event: data.contextData.event,
    config: data.contextData.config,

    db: {
      query: (collection: string, filters?: Record<string, unknown>) =>
        callMain('db.query', [collection, filters]),
      get: (uri: string) => callMain('db.get', [uri]),
      count: (collection: string, filters?: Record<string, unknown>) =>
        callMain('db.count', [collection, filters]),
    },

    http: {
      fetch: (url: string, options?: Record<string, unknown>) =>
        callMain('http.fetch', [url, options]),
    },

    email: {
      send: (params: Record<string, unknown>) =>
        callMain('email.send', [params]),
    },

    pds: {
      createRecord: (params: Record<string, unknown>) =>
        callMain('pds.createRecord', [params]),
    },

    emitEvent: (type: string, eventData: Record<string, unknown>) =>
      callMain('emitEvent', [type, eventData]),

    log: {
      info: (message: string, logData?: Record<string, unknown>) => {
        logs.push({
          level: 'info',
          message,
          data: logData,
          timestamp: new Date().toISOString(),
        });
      },
      warn: (message: string, logData?: Record<string, unknown>) => {
        logs.push({
          level: 'warn',
          message,
          data: logData,
          timestamp: new Date().toISOString(),
        });
      },
      error: (message: string, logData?: Record<string, unknown>) => {
        logs.push({
          level: 'error',
          message,
          data: logData,
          timestamp: new Date().toISOString(),
        });
      },
    },
  };

  return ctx;
}

// ─── Execute the script ─────────────────────────────────────────────────

async function run(): Promise<void> {
  const data = workerData as WorkerData;

  try {
    const ctx = buildContext(data);

    // Create a minimal sandbox: only ctx is accessible
    const sandbox = vm.createContext({
      ctx,
      // Scripts need Promise for async/await to work
      Promise,
      // JSON for data manipulation
      JSON,
      // Provide console.log that routes to ctx.log
      console: {
        log: (message: string, ...args: unknown[]) => {
          const logData = args.length > 0 ? { args } : undefined;
          logs.push({
            level: 'info',
            message: String(message),
            data: logData,
            timestamp: new Date().toISOString(),
          });
        },
        warn: (message: string, ...args: unknown[]) => {
          const logData = args.length > 0 ? { args } : undefined;
          logs.push({
            level: 'warn',
            message: String(message),
            data: logData,
            timestamp: new Date().toISOString(),
          });
        },
        error: (message: string, ...args: unknown[]) => {
          const logData = args.length > 0 ? { args } : undefined;
          logs.push({
            level: 'error',
            message: String(message),
            data: logData,
            timestamp: new Date().toISOString(),
          });
        },
      },
    });

    // Wrap the compiled JS in an async IIFE so top-level await works
    const wrappedCode = `(async () => { ${data.compiledJs} })()`;

    const script = new vm.Script(wrappedCode, {
      filename: 'cooperative-script.js',
    });

    await script.runInContext(sandbox, {
      // Timeout is enforced at the Worker level by the pool
    });

    const result: WorkerResult = {
      type: 'result',
      success: true,
      logs,
    };
    parentPort!.postMessage(result);
  } catch (err) {
    const result: WorkerResult = {
      type: 'result',
      success: false,
      error: err instanceof Error ? err.message : String(err),
      logs,
    };
    parentPort!.postMessage(result);
  }
}

run().catch((err) => {
  const result: WorkerResult = {
    type: 'result',
    success: false,
    error: err instanceof Error ? err.message : String(err),
    logs,
  };
  parentPort!.postMessage(result);
});
