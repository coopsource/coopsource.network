import pino from 'pino';
import { pinoHttp as createPinoHttp } from 'pino-http';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  transport:
    process.env.NODE_ENV === 'development'
      ? { target: 'pino/file', options: { destination: 1 } }
      : undefined,
});

/**
 * Headers carrying credentials or signatures that must never reach the logs
 * (audit finding S-03). Covers session cookies, bearer credentials (MCP tokens,
 * service-auth and Inlay JWTs), RFC 9421 federation signatures, DPoP proofs,
 * and provider webhook signatures.
 */
const SECRET_HEADERS = [
  'cookie',
  'set-cookie',
  'authorization',
  'proxy-authorization',
  'dpop',
  'x-api-key',
  'signature',
  'signature-input',
  'stripe-signature',
  'x-hub-signature',
  'x-hub-signature-256',
  'x-webhook-signature',
];

export const REDACT_PATHS = SECRET_HEADERS.flatMap((header) => [
  `req.headers["${header}"]`,
  `res.headers["${header}"]`,
]);

export function createHttpLogger(
  destination?: import('node:stream').Writable,
): ReturnType<typeof createPinoHttp> {
  const target = destination ? pino({ level: 'info' }, destination) : logger;
  return createPinoHttp({
    logger: target,
    redact: { paths: REDACT_PATHS, censor: '[Redacted]' },
  });
}

export const httpLogger = createHttpLogger();
