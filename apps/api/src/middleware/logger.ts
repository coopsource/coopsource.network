import pino from 'pino';
import type { HttpLogger, Options } from 'pino-http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pinoHttp = require('pino-http') as (opts?: Options) => HttpLogger;

export const logger = pino({
  transport:
    process.env.NODE_ENV === 'development'
      ? { target: 'pino/file', options: { destination: 1 } }
      : undefined,
});

export const httpLogger = pinoHttp({ logger });
